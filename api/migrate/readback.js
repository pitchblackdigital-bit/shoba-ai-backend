const {
  cors,
  requireApiKey,
  wordpressFetch,
  sendJson,
  cleanListing
} = require('../_lib');

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

  const id = String(req.query?.id || '').trim();

  if (!id || !/^\d+$/.test(id)) {
    return sendJson(res, 400, {
      ok: false,
      error: 'A numeric WordPress listing ID is required.'
    });
  }

  try {
    const result = await wordpressFetch(
      `job-listings/${id}`,
      {
        context: 'edit'
      }
    );

    return sendJson(res, 200, {
      ok: true,
      listing: cleanListing(result.data),
      raw_meta: result.data.meta || {}
    });

  } catch (error) {
    console.error('READBACK_DIAGNOSTIC', {
      message: error.message,
      status: error.status || null,
      wordpress: error.wordpress || null
    });

    return sendJson(res, error.status || 502, {
      ok: false,
      error: 'Migration readback failed.',
      diagnostic: {
        message: error.message,
        wordpress_status: error.status || null,
        wordpress_code: error.wordpress?.code || null,
        wordpress_message: error.wordpress?.message || null
      }
    });
  }
};
