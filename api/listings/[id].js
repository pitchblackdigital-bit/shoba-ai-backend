const { cors, requireApiKey, wordpressFetch, sendJson, cleanListing } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  if (!requireApiKey(req)) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  const id = req.query.id;
  if (!id || !/^\d+$/.test(String(id))) {
    return sendJson(res, 400, { ok: false, error: 'A numeric listing ID is required.' });
  }

  try {
    const result = await wordpressFetch(`job-listings/${id}`);
    return sendJson(res, 200, { ok: true, listing: cleanListing(result.data) });
  } catch (error) {
    if (error.status === 404) return sendJson(res, 404, { ok: false, error: 'Listing not found.' });
    console.error('Listing request failed:', error.message);
    return sendJson(res, 502, { ok: false, error: 'Unable to retrieve the SHOBA listing.' });
  }
};
