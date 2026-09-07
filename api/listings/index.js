const { cors, requireApiKey, wordpressFetch, sendJson, cleanListing } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  if (!requireApiKey(req)) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  const {
    search,
    location,
    category,
    region,
    type,
    tag,
    page = '1',
    per_page = '20'
  } = req.query;

  const params = {
    search,
    page: Math.max(1, Math.min(100, Number(page) || 1)),
    per_page: Math.max(1, Math.min(100, Number(per_page) || 20)),
    status: 'publish'
  };

  // These taxonomy parameters match the WP Job Manager taxonomies visible
  // in the SHOBA WordPress REST response.
  if (category) params.job_listing_category = category;
  if (region) params.job_listing_region = region;
  if (type) params.job_listing_type = type;
  if (tag) params.job_listing_tag = tag;

  try {
    const result = await wordpressFetch('job-listings', params);
    let listings = Array.isArray(result.data) ? result.data.map(cleanListing) : [];

    // WP Job Manager location is a listing field rather than a standard
    // WordPress taxonomy, so apply a safe server-side text filter.
    if (location) {
      const needle = String(location).toLowerCase();
      listings = listings.filter((item) =>
        String(item.location || '').toLowerCase().includes(needle) ||
        String(item.title || '').toLowerCase().includes(needle) ||
        String(item.description || '').toLowerCase().includes(needle)
      );
    }

    return sendJson(res, 200, {
      ok: true,
      count: listings.length,
      page: Number(page) || 1,
      per_page: Number(per_page) || 20,
      listings
    });
  } catch (error) {
    console.error('Listings request failed:', error.message, error.wordpress || '');
    const status = error.status === 400 ? 400 : 502;
    return sendJson(res, status, {
      ok: false,
      error: 'Unable to retrieve SHOBA business listings.'
    });
  }
};
