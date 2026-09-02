const { cors, requireApiKey, wordpressFetch, sendJson, cleanListing } = require('../_lib');

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function normalized(text) {
  return String(text || '').trim().toLowerCase();
}

function containsValue(values, target) {
  const needle = normalized(target);
  if (!needle) return false;

  return values.some(value => {
    const haystack = normalized(value);
    return haystack === needle || haystack.includes(needle);
  });
}

function locationMatches(item, location) {
  if (!location) return true;

  const locationValues = [
    item.location,
    ...(item.regions || [])
  ].filter(Boolean);

  return containsValue(locationValues, location);
}

function categoryMatches(item, category) {
  if (!category) return true;

  const categoryValues = [
    ...(item.categories || []),
    ...(item.types || [])
  ].filter(Boolean);

  return containsValue(categoryValues, category);
}

function queryMatches(item, query) {
  if (!query) return true;

  const q = tokens(query);

  const title = tokens(item.title).join(' ');

  const body = tokens([
    item.description,
    item.excerpt,
    item.company,
    item.location,
    ...(item.categories || []),
    ...(item.regions || []),
    ...(item.types || []),
    ...(item.tags || []),
    ...(item.amenities || [])
  ].join(' ')).join(' ');

  return q.some(term =>
    title.includes(term) || body.includes(term)
  );
}

function rankListing(item, query, location, category) {
  const q = tokens(query);

  const title = tokens(item.title).join(' ');

  const body = tokens([
    item.description,
    item.excerpt,
    item.company,
    item.location,
    ...(item.categories || []),
    ...(item.regions || []),
    ...(item.types || []),
    ...(item.tags || []),
    ...(item.amenities || [])
  ].join(' ')).join(' ');

  let score = 0;
  const matched = [];

  for (const term of q) {
    if (title.includes(term)) {
      score += 8;
      matched.push(term);
    } else if (body.includes(term)) {
      score += 3;
      matched.push(term);
    }
  }

  if (location && locationMatches(item, location)) {
    score += 10;
    matched.push(location);
  }

  if (category && categoryMatches(item, category)) {
    score += 10;
    matched.push(category);
  }

  if (item.website) score += 1;
  if (item.phone) score += 1;

  return {
    score,
    matched: [...new Set(matched)]
  };
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
  }

  if (!requireApiKey(req)) {
    return sendJson(res, 401, {
      ok: false,
      error: 'Unauthorized'
    });
  }

  const {
    q = '',
    query = '',
    location = '',
    category = '',
    limit = '10',
    page = '1'
  } = req.query;

  const userQuery = String(q || query).trim();
  const requestedLocation = String(location || '').trim();
  const requestedCategory = String(category || '').trim();

  if (!userQuery && !requestedLocation && !requestedCategory) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Provide q, location or category.'
    });
  }

  try {
    const result = await wordpressFetch('job-listings', {
      search: userQuery || undefined,
      per_page: 100,
      page: Math.max(1, Number(page) || 1),
      status: 'publish'
    });

    const listings = Array.isArray(result.data)
      ? result.data.map(cleanListing)
      : [];

    const filtered = listings
      .filter(item => queryMatches(item, userQuery))
      .filter(item => locationMatches(item, requestedLocation))
      .filter(item => categoryMatches(item, requestedCategory));

    const ranked = filtered
      .map(item => ({
        item,
        ...rankListing(
          item,
          userQuery,
          requestedLocation,
          requestedCategory
        )
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.item.title).localeCompare(String(b.item.title))
      )
      .slice(
        0,
        Math.max(1, Math.min(50, Number(limit) || 10))
      );

    return sendJson(res, 200, {
      ok: true,
      engine: 'shoba-discovery-v1.2.1',
      query: userQuery || null,
      location: requestedLocation || null,
      category: requestedCategory || null,
      count: ranked.length,
      results: ranked.map(({ item, score, matched }) => ({
        ...item,
        discovery: {
          score,
          matchedTerms: matched
        }
      }))
    });
  } catch (error) {
    console.error(
      'Discovery request failed:',
      error.message
    );

    return sendJson(res, 502, {
      ok: false,
      error: 'Unable to run SHOBA discovery.'
    });
  }
};
