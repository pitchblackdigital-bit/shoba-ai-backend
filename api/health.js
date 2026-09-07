const { cors, wordpressFetch, sendJson } = require('./_lib');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const result = await wordpressFetch('job-listings', { per_page: 1 });
    return sendJson(res, 200, {
      ok: true,
      service: 'shoba-ai-backend',
      wordpress: 'reachable',
      sampleListings: Array.isArray(result.data) ? result.data.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return sendJson(res, 502, {
      ok: false,
      service: 'shoba-ai-backend',
      wordpress: 'unreachable',
      error: 'Unable to reach the SHOBA WordPress REST API.'
    });
  }
};
