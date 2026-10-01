const {
  cors,
  requireApiKey,
  sendJson,
  normalizeText
} = require('./_lib');
const { getDirectoryIndex } = require('./directory-index');

const LOCATION_TERMS = [
  'toronto', 'scarborough', 'north york', 'etobicoke',
  'mississauga', 'brampton', 'markham', 'vaughan',
  'ottawa', 'montreal', 'calgary', 'edmonton', 'vancouver'
];

const OWNERSHIP_TERMS = [
  'black-owned', 'black owned', 'black-founded', 'black founded',
  'black-led', 'black led'
];

const CATEGORY_TERMS = [
  'restaurant', 'cafe', 'catering', 'designer', 'design',
  'photographer', 'lawyer', 'accountant', 'salon', 'beauty',
  'consultant', 'marketing', 'retail', 'nonprofit'
];

function parseIntent(query) {
  const q = normalizeText(query);
  const ownership = OWNERSHIP_TERMS.find(term => q.includes(normalizeText(term))) || null;
  const location = LOCATION_TERMS.find(term => q.includes(normalizeText(term))) || null;
  const category = CATEGORY_TERMS.find(term => q.includes(normalizeText(term))) || null;

  const words = q.split(' ').filter(Boolean);
  const highIntent =
    /\b(need|hire|book|find|looking for|want)\b/.test(q);

  return {
    raw_query: query,
    normalized_query: q,
    ownership,
    location,
    category,
    intent: highIntent ? 'commercial' : 'discover'
  };
}

function textValues(listing) {
  const values = [
    listing.title,
    listing.description,
    listing.excerpt,
    listing.location,
    listing.business_type,
    listing.service_model,
    listing.ownership_status
  ];

  for (const collection of [
    listing.categories,
    listing.regions,
    listing.types,
    listing.tags,
    listing.amenities
  ]) {
    if (Array.isArray(collection)) {
      values.push(...collection.map(v =>
        typeof v === 'string' ? v : (v.name || v.slug || '')
      ));
    }
  }

  return normalizeText(values.filter(Boolean).join(' '));
}

function scoreListing(listing, intent) {
  const haystack = textValues(listing);
  let score = 0;
  const reasons = [];

  if (intent.location && haystack.includes(normalizeText(intent.location))) {
    score += 30;
    reasons.push('location_match');
  }

  if (intent.category && haystack.includes(normalizeText(intent.category))) {
    score += 25;
    reasons.push('category_match');
  }

  if (intent.ownership && normalizeText(listing.ownership_status).includes('black')) {
    score += 25;
    reasons.push('ownership_match');
  }

  if (normalizeText(listing.title).includes(intent.normalized_query)) {
    score += 15;
    reasons.push('name_match');
  }

  if (listing.website) {
    score += 3;
    reasons.push('website_available');
  }

  if (listing.phone || listing.email) {
    score += 2;
    reasons.push('contact_available');
  }

  return { score, reasons };
}

function publicProjection(listing, score) {
  return {
    id: listing.id,
    name: listing.title,
    slug: listing.slug,
    description: listing.description,
    location: listing.location,
    website: listing.website,
    phone: listing.phone,
    categories: listing.categories || [],
    ownership_status: listing.ownership_status,
    verification_status: listing.verification_status,
    score: score.score,
    match_reasons: score.reasons
  };
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!requireApiKey(req)) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  }

  try {
    const query = String(req.query?.q || '').trim();

    if (!query) {
      return sendJson(res, 400, {
        ok: false,
        error: 'missing_query',
        message: 'Use ?q=...'
      });
    }

    const limit = Math.min(
      Math.max(Number(req.query?.limit || 10), 1),
      50
    );

    const intent = parseIntent(query);
    const index = await getDirectoryIndex();

    const results = index.listings
      .map(listing => ({
        listing,
        score: scoreListing(listing, intent)
      }))
      .filter(item => item.score.score > 0)
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, limit)
      .map(item => publicProjection(item.listing, item.score));

    return sendJson(res, 200, {
      ok: true,
      engine: 'shoba-search-ai-v1',
      index: {
        record_count: index.record_count,
        cache: index.cache,
        build_ms: index.build_ms
      },
      intent,
      results
    });
  } catch (error) {
    console.error('search-ai error', error);
    return sendJson(res, 500, {
      ok: false,
      error: 'search_failed'
    });
  }
};
