const {
  cors,
  requireApiKey,
  sendJson
} = require('../_lib');

const { searchListings } = require('../_search');
const { getDirectoryIndex } = require('../directory-index');

function parseBody(req) {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return typeof req.body === 'object' ? req.body : null;
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
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

  const body = parseBody(req);

  if (!body) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Request body must be valid JSON.'
    });
  }

  const query = typeof body.query === 'string'
    ? body.query.trim()
    : '';

  if (!query) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Query is required.'
    });
  }

  if (query.length > 500) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Query must be 500 characters or fewer.'
    });
  }

  const page = Math.max(
    1,
    Number(body.page) || 1
  );

  const per_page = Math.max(
    1,
    Math.min(50, Number(body.per_page) || 20)
  );

  try {
    const index = await getDirectoryIndex();

    const search = searchListings(
      index.listings,
      query,
      {
        page,
        per_page
      }
    );

    return sendJson(res, 200, {
      ok: true,
      query,
      source: 'wordpress_directory_index',
      record_count: index.record_count,
      index_cache: index.cache,
      index_cache_age_ms: index.cache_age_ms,
      ...search
    });

  } catch (error) {
    console.error('Search request failed:', error.message);

    return sendJson(res, 502, {
      ok: false,
      error: 'Unable to search SHOBA business listings.'
    });
  }
};
