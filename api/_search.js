const { normalizeText } = require('./_lib');

const LOCATIONS = [
  'scarborough', 'north york', 'etobicoke', 'downtown', 'toronto', 'york'
];

const BUSINESS_TYPES = {
  restaurant: ['restaurant', 'restaurants', 'place to eat', 'eatery', 'dining'],
  salon: ['salon', 'hair salon', 'beauty salon'],
  barber: ['barber', 'barbershop'],
  accountant: ['accountant', 'accounting'],
  lawyer: ['lawyer', 'legal'],
  consultant: ['consultant', 'consulting'],
  marketing: ['marketing', 'marketer'],
  designer: ['designer', 'design'],
  'web designer': ['web designer', 'website designer'],
  'web developer': ['web developer', 'website developer']
};

const SYNONYMS = {
  restaurant: ['restaurant', 'restaurants', 'place to eat', 'eatery', 'dining', 'food'],
  salon: ['salon', 'beauty', 'hair'],
  barber: ['barber', 'barbershop', 'grooming'],
  accountant: ['accountant', 'accounting', 'bookkeeping'],
  lawyer: ['lawyer', 'legal', 'attorney'],
  consultant: ['consultant', 'consulting', 'advisory'],
  marketing: ['marketing', 'marketer', 'branding'],
  designer: ['designer', 'design', 'creative'],
  'web designer': ['web designer', 'website designer', 'web design'],
  'web developer': ['web developer', 'website developer', 'web development']
};

function normalizeQuery(value) {
  return normalizeText(value);
}

function containsPhrase(text, phrase) {
  return (` ${text} `).includes(` ${normalizeQuery(phrase)} `);
}

function values(value) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source.flatMap(item => {
    if (item && typeof item === 'object') {
      return [item.name, item.slug, item.label, item.value]
        .filter(Boolean)
        .map(String);
    }
    return [String(item)];
  });
}

function listingText(listing, fields) {
  return normalizeQuery(fields.flatMap(field => values(listing[field])).join(' '));
}

function requestedBusinessTypes(query) {
  const normalized = normalizeQuery(query);
  return Object.entries(BUSINESS_TYPES)
    .filter(([, terms]) => terms.some(term => containsPhrase(normalized, term)))
    .map(([type]) => type);
}

function detectIntent(query) {
  const normalized = normalizeQuery(query);
  if (/\b(refine|narrow|near me|nearby)\b/.test(normalized)) return 'refine_search';
  if (/\b(filter|only|with)\b/.test(normalized)) return 'filter_businesses';
  if (/\b(search|find|looking for)\b/.test(normalized)) return 'search_business';
  return 'discover_business';
}

function detectFilters(query) {
  const normalized = normalizeQuery(query);
  const filters = {};
  if (['black owned', 'black owned business', 'black owned businesses']
    .some(phrase => containsPhrase(normalized, phrase))) {
    filters.ownership_status = 'black_owned';
  }
  const location = LOCATIONS.find(place => containsPhrase(normalized, place));
  if (location) filters.location = location;
  const businessTypes = requestedBusinessTypes(normalized);
  if (businessTypes.length) filters.business_type = businessTypes;
  if (/\bverified\b/.test(normalized) && !/\bunverified\b/.test(normalized)) {
    filters.verification_status = 'verified';
  }
  return filters;
}

function expandSynonyms(query) {
  const normalized = normalizeQuery(query);
  const expanded = new Set(normalized.split(' ').filter(Boolean));
  for (const [concept, terms] of Object.entries(SYNONYMS)) {
    if (terms.some(term => containsPhrase(normalized, term))) {
      expanded.add(concept);
      terms.forEach(term => term.split(' ').forEach(word => expanded.add(word)));
    }
  }
  return [...expanded];
}

function buildPlan(query) {
  const normalized = normalizeQuery(query);
  const filters = detectFilters(normalized);
  let textQuery = normalized;
  textQuery = textQuery.replace(/\bblack owned businesses?\b|\bblack owned\b/g, ' ');
  LOCATIONS.forEach(location => {
    textQuery = textQuery.replace(new RegExp(`\\b${location.replace(' ', '\\s+')}\\b`, 'g'), ' ');
  });
  textQuery = textQuery.replace(/\b(in|near|around|with|only|show|find|search for)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return {
    intent: detectIntent(normalized),
    text_query: textQuery,
    filters,
    search_mode: Object.keys(filters).length ? 'structured' : 'text',
    confidence: Object.keys(filters).length ? 0.96 : 0.75,
    expanded_terms: expandSynonyms(textQuery)
  };
}

function hasConcept(text, concept) {
  return (SYNONYMS[concept] || [concept]).some(term => containsPhrase(text, term));
}

function isVerified(value) {
  const normalized = normalizeQuery(value);
  return normalized.includes('verified') && !normalized.includes('unverified');
}

function evaluateMatch(listing, plan) {
  const filters = plan.filters || {};
  const businessText = listingText(listing, [
    'business_type', 'categories', 'types', 'tags', 'title', 'description', 'excerpt'
  ]);
  const locationText = listingText(listing, ['location', 'regions']);
  const ownership = normalizeQuery(listing.ownership_status);
  const verification = normalizeQuery(listing.verification_status);
  const matches = {
    ownership: !filters.ownership_status || ownership === normalizeQuery(filters.ownership_status),
    verification: !filters.verification_status || isVerified(verification),
    location: !filters.location || containsPhrase(locationText, filters.location),
    business_type: !filters.business_type || filters.business_type.every(type => hasConcept(businessText, type))
  };
  const hardMatched = Object.values(matches).every(Boolean);
  const queryTerms = (plan.expanded_terms || []).filter(term => term.length > 1);
  const textFields = {
    title: normalizeQuery(listing.title),
    description: normalizeQuery([listing.description, listing.excerpt].join(' ')),
    company: normalizeQuery(listing.company),
    taxonomy: listingText(listing, ['categories', 'regions', 'tags', 'amenities', 'types'])
  };
  const matchedTerms = queryTerms.filter(term => Object.values(textFields)
    .some(text => containsPhrase(text, term)));
  return {
    hardMatched,
    matches,
    matchedTerms,
    businessText,
    locationText,
    synonymMatched: matchedTerms.some(term => !(plan.text_query || '').split(' ').includes(term))
  };
}

function matchListing(listing, planOrQuery) {
  const plan = typeof planOrQuery === 'string' ? buildPlan(planOrQuery) : planOrQuery;
  return evaluateMatch(listing, plan).hardMatched;
}

function calculateRelevance(listing, planOrQuery) {
  const plan = typeof planOrQuery === 'string' ? buildPlan(planOrQuery) : planOrQuery;
  const detail = evaluateMatch(listing, plan);
  if (!detail.hardMatched) return 0;
  const filters = plan.filters || {};
  const queryTerms = (plan.expanded_terms || []).filter(term => term.length > 1);
  const requestedTypes = filters.business_type || [];
  const categoryScore = requestedTypes.length
    ? requestedTypes.filter(type => hasConcept(detail.businessText, type)).length / requestedTypes.length
    : 0;
  const locationScore = filters.location && containsPhrase(detail.locationText, filters.location) ? 1 : 0;
  const title = normalizeQuery(listing.title);
  const allText = normalizeQuery([
    listing.title, listing.description, listing.excerpt, listing.company,
    ...values(listing.categories), ...values(listing.regions), ...values(listing.tags), ...values(listing.amenities)
  ].join(' '));
  const textScore = queryTerms.length
    ? queryTerms.reduce((score, term) => score + (containsPhrase(title, term) ? 1 : containsPhrase(allText, term) ? 0.6 : 0), 0) / queryTerms.length
    : 0;
  const completenessFields = ['description', 'location', 'website', 'phone'];
  const completeness = completenessFields.filter(field => Boolean(listing[field])).length / completenessFields.length;
  const score = (detail.hardMatched && Object.keys(filters).length ? 0.35 : 0)
    + (categoryScore * 0.20)
    + (locationScore * 0.20)
    + (textScore * 0.15)
    + (isVerified(listing.verification_status) ? 0.05 : 0)
    + (completeness * 0.05);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function buildMatchReasons(listing, planOrQuery) {
  const plan = typeof planOrQuery === 'string' ? buildPlan(planOrQuery) : planOrQuery;
  const detail = evaluateMatch(listing, plan);
  const reasons = [];
  if (plan.filters.ownership_status === 'black_owned' && detail.matches.ownership) reasons.push('Black-owned');
  for (const type of plan.filters.business_type || []) {
    if (hasConcept(detail.businessText, type)) reasons.push(type.replace(/\b\w/g, char => char.toUpperCase()));
  }
  for (const term of (plan.text_query || '').split(' ').filter(term => term.length > 1)) {
    if (detail.matchedTerms.includes(term) && !requestedBusinessTypes(term).length) {
      reasons.push(term.replace(/\b\w/g, char => char.toUpperCase()));
    }
  }
  if (plan.filters.location && detail.matches.location) {
    reasons.push(plan.filters.location.replace(/\b\w/g, char => char.toUpperCase()));
  }
  if (isVerified(listing.verification_status)) reasons.push('Verified listing');
  return [...new Set(reasons)];
}

function buildSearchResult(listing, planOrQuery) {
  const plan = typeof planOrQuery === 'string' ? buildPlan(planOrQuery) : planOrQuery;
  return {
    id: listing.id,
    name: listing.title || listing.company || '',
    slug: listing.slug || null,
    description: listing.description || '',
    excerpt: listing.excerpt || '',
    location: listing.location || null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    categories: values(listing.categories),
    regions: values(listing.regions),
    business_type: listing.business_type || null,
    service_model: listing.service_model || null,
    tags: values(listing.tags),
    amenities: values(listing.amenities),
    ownership_status: listing.ownership_status || null,
    verification_status: listing.verification_status || null,
    website: listing.website || null,
    phone: listing.phone || null,
    image: listing.featured_media || null,
    url: listing.link || null,
    score: calculateRelevance(listing, plan),
    match_reasons: buildMatchReasons(listing, plan)
  };
}

function countFacet(target, value) {
  const key = String(value || '').trim();
  if (key) target[key] = (target[key] || 0) + 1;
}

function buildSuggestions(listings) {
  const locations = new Set();
  const categories = new Set();
  listings.forEach(listing => {
    if (listing.location) locations.add(String(listing.location));
    values(listing.regions).forEach(value => locations.add(value));
    values(listing.categories).forEach(value => categories.add(value));
  });
  return {
    locations: [...locations].sort().slice(0, 10),
    categories: [...categories].sort().slice(0, 10)
  };
}

function buildFacets(listings) {
  const facets = { categories: {}, regions: {}, business_types: {}, ownership_statuses: {}, verification_statuses: {} };
  listings.forEach(listing => {
    values(listing.categories).forEach(value => countFacet(facets.categories, value));
    values(listing.regions).forEach(value => countFacet(facets.regions, value));
    countFacet(facets.business_types, listing.business_type);
    countFacet(facets.ownership_statuses, listing.ownership_status);
    countFacet(facets.verification_statuses, listing.verification_status);
  });
  return facets;
}

function searchListings(listings, query, options = {}) {
  const plan = buildPlan(query);
  const all = Array.isArray(listings) ? listings : [];
  const matches = all
    .filter(listing => matchListing(listing, plan))
    .map(listing => ({ listing, detail: evaluateMatch(listing, plan), result: buildSearchResult(listing, plan) }))
    .filter(entry => entry.result.score > 0 || !plan.text_query)
    .sort((a, b) => b.result.score - a.result.score || String(a.result.name).localeCompare(String(b.result.name)));
  const page = Math.max(1, Number(options.page) || 1);
  const perPage = Math.max(1, Math.min(50, Number(options.per_page || options.perPage) || 20));
  const start = (page - 1) * perPage;
  return {
    interpreted_query: { intent: plan.intent, filters: plan.filters },
    results: matches.slice(start, start + perPage).map(entry => entry.result),
    total: matches.length,
    facets: buildFacets(matches.map(entry => entry.listing)),
    suggestions: matches.length ? {} : buildSuggestions(all),
    search_metadata: {
      location_match: Boolean(plan.filters.location && matches.some(entry => entry.detail.matches.location)),
      semantic_match: matches.some(entry => entry.detail.synonymMatched)
    }
  };
}

module.exports = {
  normalizeQuery,
  detectIntent,
  detectFilters,
  expandSynonyms,
  matchListing,
  calculateRelevance,
  buildMatchReasons,
  buildSearchResult,
  buildSuggestions,
  searchListings
};
