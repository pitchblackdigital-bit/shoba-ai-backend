const {
  cors,
  sendJson,
  wordpressAuth,
  getEnv
} = require('./_lib');

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

  try {
    const base = getEnv('WORDPRESS_URL').replace(/\/$/, '');

    const response = await fetch(
      `${base}/wp-json/wp/v2/users/me`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: wordpressAuth(),
          'User-Agent': 'SHOBA-AI-Backend/AuthCheck'
        },
        cache: 'no-store'
      }
    );

    return sendJson(res, 200, {
      ok: response.ok,
      wordpress_authenticated: response.ok,
      status: response.status
    });

  } catch (error) {
    console.error(
      'WordPress auth check failed:',
      error.message
    );

    return sendJson(res, 502, {
      ok: false,
      wordpress_authenticated: false,
      error: 'WordPress authentication check failed.'
    });
  }
};
