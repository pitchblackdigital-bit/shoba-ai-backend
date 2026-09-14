const {
  wordpressRequest,
  cleanListing,
  normalizeText,
  normalizeUrl,
  normalizePhone,
  makeSlug
} = require('./_lib');

const CACHE_TTL_MS = 60 * 1000;
let cachedIndex = null;

function addToIndex(map, key, listing) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(listing);
}

function normalizeLocation(value) {
  return normalizeText(value).replace(/\b(canada|ca)\b/g, '').trim();
}

function buildIndex(listings, context = 'edit', status = 'any') {
  const bySlug = new Map();
  const byName = new Map();
  const byWebsite = new Map();
  const byPhone = new Map();
  const byLocation = new Map();

  for (const listing of listings) {
    const normalized = {
      name: normalizeText(listing.title),
      slug: normalizeText(listing.slug || makeSlug(listing.title)),
      website: normalizeUrl(listing.website),
      phone: normalizePhone(listing.phone),
      location: normalizeLocation(listing.location)
    };

    const indexed = { ...listing, normalized };

    addToIndex(bySlug, normalized.slug, indexed);
    addToIndex(byName, normalized.name, indexed);
    addToIndex(byWebsite, normalized.website, indexed);
    addToIndex(byPhone, normalized.phone, indexed);
    addToIndex(byLocation, normalized.location, indexed);
  }

  return {
    source: 'wordpress',
    context,
    status,
    generated_at: new Date().toISOString(),
    record_count: listings.length,
    listings,
    bySlug,
    byName,
    byWebsite,
    byPhone,
    byLocation
  };
}

async function fetchAllListings() {
  const listings = [];
  let page = 1;
  let totalPages = 1;

  while (page <= 20 && page <= totalPages) {
    const result = await wordpressRequest('job-listings', {
      method: 'GET',
      params: {
        per_page: 100,
        page,
        context: 'edit',
        status: 'any'
      }
    });

    const items = Array.isArray(result.data) ? result.data : [];
    listings.push(...items.map(cleanListing));

    totalPages =
      Number(result.headers.get('x-wp-totalpages')) || totalPages;

    if (items.length < 100) break;
    page += 1;
  }

  return listings;
}

async function getDirectoryIndex({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedIndex &&
    now - cachedIndex.cached_at < CACHE_TTL_MS
  ) {
    return {
      ...cachedIndex.index,
      cache: 'hit',
      cache_age_ms: now - cachedIndex.cached_at
    };
  }

  const started = performance.now();
  const listings = await fetchAllListings();
  const index = buildIndex(listings);
  const build_ms = Number((performance.now() - started).toFixed(2));

  cachedIndex = {
    index: { ...index, build_ms },
    cached_at: Date.now()
  };

  return {
    ...cachedIndex.index,
    cache: 'miss',
    cache_age_ms: 0
  };
}

function clearDirectoryIndexCache() {
  cachedIndex = null;
}

module.exports = {
  buildIndex,
  fetchAllListings,
  getDirectoryIndex,
  clearDirectoryIndexCache
};
