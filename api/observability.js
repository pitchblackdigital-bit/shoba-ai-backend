const {
  cors,
  requireApiKey,
  sendJson,
  wordpressRequest
} = require('./_lib');

function now() {
  return Number(process.hrtime.bigint()) / 1e6;
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

  const started = now();

  try {
    const wpStarted = now();

    const result = await wordpressRequest(
      'job-listings',
      {
        method: 'GET',
        params: {
          per_page: 100,
          page: 1,
          context: 'view'
        }
      }
    );

    const wpMs = now() - wpStarted;
    const totalMs = now() - started;

    const listings = Array.isArray(result.data)
      ? result.data
      : [];

    return sendJson(res, 200, {
      ok: true,
      test: 'wordpress_read_observability',
      request_id:
        req.headers['x-request-id'] ||
        `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timing: {
        total_ms: Number(totalMs.toFixed(2)),
        wordpress_fetch_ms: Number(wpMs.toFixed(2))
      },
      wordpress: {
        records_returned: listings.length,
        pages_fetched: 1,
        per_page: 100
      },
      environment: {
        node: process.version,
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
      }
    });
  } catch (error) {
    const totalMs = now() - started;

    return sendJson(res, error.status || 500, {
      ok: false,
      test: 'wordpress_read_observability',
      timing: {
        total_ms: Number(totalMs.toFixed(2))
      },
      error: {
        type: error.name || 'Error',
        message: error.message,
        wordpress_status: error.status || null
      }
    });
  }
};
