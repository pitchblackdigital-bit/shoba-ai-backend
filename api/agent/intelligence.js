const {
  cors,
  requireApiKey,
  sendJson,
  normalizeText
} = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');

function analyze(listing) {
  const gaps = [];
  const strengths = [];

  if (listing.website) strengths.push('website_present');
  else gaps.push('website_missing');

  if (listing.phone || listing.email) strengths.push('contact_present');
  else gaps.push('contact_missing');

  if (listing.location) strengths.push('location_present');
  else gaps.push('location_missing');

  if (Array.isArray(listing.categories) && listing.categories.length) {
    strengths.push('category_present');
  } else {
    gaps.push('category_missing');
  }

  if (normalizeText(listing.description).length >= 80) {
    strengths.push('description_present');
  } else {
    gaps.push('description_weak_or_missing');
  }

  const score = Math.max(0, 100 - gaps.length * 15);

  return {
    intelligence: {
      score,
      strengths,
      gaps
    },
    priority:
      gaps.length >= 3 ? 'high' :
      gaps.length === 2 ? 'medium' :
      'low'
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
    const id = Number(req.query?.id);
    if (!Number.isInteger(id) || id < 1) {
      return sendJson(res, 400, { ok: false, error: 'invalid_id' });
    }

    const index = await getDirectoryIndex();
    const listing = index.listings.find(item => item.id === id);

    if (!listing) {
      return sendJson(res, 404, { ok: false, error: 'listing_not_found' });
    }

    return sendJson(res, 200, {
      ok: true,
      agent: 'intelligence',
      business_id: id,
      ...analyze(listing)
    });
  } catch (error) {
    console.error('intelligence-agent error', error);
    return sendJson(res, 500, { ok: false, error: 'intelligence_failed' });
  }
};
