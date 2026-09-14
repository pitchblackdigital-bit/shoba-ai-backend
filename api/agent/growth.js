const {
  cors,
  requireApiKey,
  sendJson,
  normalizeText
} = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');

function recommendations(listing) {
  const actions = [];

  if (!listing.website) {
    actions.push({
      priority: 'high',
      action: 'add_website',
      reason: 'A website is a core discovery and trust signal.'
    });
  }

  if (!listing.location) {
    actions.push({
      priority: 'high',
      action: 'complete_location',
      reason: 'Location improves local discovery.'
    });
  }

  if (!Array.isArray(listing.categories) || !listing.categories.length) {
    actions.push({
      priority: 'high',
      action: 'complete_categories',
      reason: 'Categories improve search matching.'
    });
  }

  if (!listing.phone && !listing.email) {
    actions.push({
      priority: 'medium',
      action: 'complete_contact',
      reason: 'A contact path improves conversion.'
    });
  }

  if (normalizeText(listing.description).length < 80) {
    actions.push({
      priority: 'medium',
      action: 'improve_description',
      reason: 'A stronger description gives discovery systems more context.'
    });
  }

  return actions;
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

    const actions = recommendations(listing);

    return sendJson(res, 200, {
      ok: true,
      agent: 'growth',
      business_id: id,
      priority: actions.some(a => a.priority === 'high') ? 'high' : actions.length ? 'medium' : 'low',
      actions,
      execution: {
        mode: 'recommendation_only',
        approval_required: true
      }
    });
  } catch (error) {
    console.error('growth-agent error', error);
    return sendJson(res, 500, { ok: false, error: 'growth_failed' });
  }
};
