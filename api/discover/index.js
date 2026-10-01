const { cors, requireApiKey, sendJson } = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');
const { discover } = require('../_discovery');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return typeof req.body === 'object' ? req.body : null;
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!requireApiKey(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

  const body = parseBody(req);
  if (!body) return sendJson(res, 400, { ok: false, error: 'invalid_json' });

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return sendJson(res, 400, { ok: false, error: 'query_required' });
  if (query.length > 500) return sendJson(res, 400, { ok: false, error: 'query_too_long' });

  try {
    const index = await getDirectoryIndex();
    const result = discover(index.listings, query, {
      context: body.context || {},
      page: body.page,
      per_page: body.per_page
    });
    return sendJson(res, 200, {
      ok: true,
      record_count: index.record_count,
      index_cache: index.cache,
      ...result
    });
  } catch (error) {
    console.error('Conversational discovery failed:', error.message);
    return sendJson(res, 502, { ok: false, error: 'discovery_unavailable' });
  }
};
