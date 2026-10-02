const { cors, sendJson } = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');
const { discover } = require('../_discovery');
const {
  isAllowedPublicOrigin,
  normalizePublicRequest
} = require('../_public-discovery');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return typeof req.body === 'object' ? req.body : null;
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    if (!isAllowedPublicOrigin(req)) {
      return sendJson(res, 403, { ok: false, error: 'origin_not_allowed' });
    }
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!isAllowedPublicOrigin(req)) {
    return sendJson(res, 403, { ok: false, error: 'origin_not_allowed' });
  }

  const body = parseBody(req);
  if (!body) return sendJson(res, 400, { ok: false, error: 'invalid_json' });

  const request = normalizePublicRequest(body);
  if (!request.query) {
    return sendJson(res, 400, { ok: false, error: 'query_required' });
  }

  try {
    const index = await getDirectoryIndex();
    const result = discover(index.listings, request.query, {
      context: request.context,
      page: request.page,
      per_page: request.per_page
    });

    return sendJson(res, 200, {
      ok: true,
      record_count: index.record_count,
      index_cache: index.cache,
      ...result
    });
  } catch (error) {
    console.error('Public conversational discovery failed:', error.message);
    return sendJson(res, 502, { ok: false, error: 'discovery_unavailable' });
  }
};
