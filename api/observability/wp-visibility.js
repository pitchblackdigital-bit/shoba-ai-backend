const {
  cors,
  requireApiKey,
  wordpressRequest,
  sendJson
} = require('../_lib');

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

async function timed(fn) {
  const start = nowMs();

  try {
    const result = await fn();

    return {
      ok: true,
      elapsed_ms: Number((nowMs() - start).toFixed(2)),
      result
    };
  } catch (error) {
    return {
      ok: false,
      elapsed_ms: Number((nowMs() - start).toFixed(2)),
      error: {
        message: error.message,
        status: error.status || null,
        wordpress: error.wordpress || null
      }
    };
  }
}

async function fetchPages(params) {
  const all = [];
  const pages = [];
  let page = 1;

  while (page <= 20) {
    const start = nowMs();

    const result = await wordpressRequest(
      'job-listings',
      {
        method: 'GET',
        params: {
          per_page: 100,
          page,
          ...params
        }
      }
    );

    const elapsed_ms = Number(
      (nowMs() - start).toFixed(2)
    );

    const items = Array.isArray(result.data)
      ? result.data
      : [];

    pages.push({
      page,
      records: items.length,
      elapsed_ms,
      wp_total: result.headers.get('x-wp-total'),
      wp_total_pages: result.headers.get('x-wp-totalpages')
    });

    all.push(...items);

    if (items.length < 100) break;

    page++;
  }

  return {
    records: all.length,
    pages_fetched: pages.length,
    pages
  };
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
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

  const started = nowMs();

  const public_publish = await timed(() =>
    fetchPages({
      context: 'view',
      status: 'publish'
    })
  );

  const authenticated_any = await timed(() =>
    fetchPages({
      context: 'edit',
      status: 'any'
    })
  );

  return sendJson(res, 200, {
    ok: true,
    test: 'wordpress_visibility_profile',
    request_id:
      req.headers['x-request-id'] ||
      `wp-visibility-${Date.now()}`,
    total_ms: Number(
      (nowMs() - started).toFixed(2)
    ),
    result: {
      public_publish,
      authenticated_any
    },
    memory_mb: {
      rss: Number(
        (process.memoryUsage().rss / 1048576).toFixed(2)
      ),
      heap_used: Number(
        (process.memoryUsage().heapUsed / 1048576).toFixed(2)
      ),
      heap_total: Number(
        (process.memoryUsage().heapTotal / 1048576).toFixed(2)
      )
    }
  });
};
