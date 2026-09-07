const { getEnv, sendJson } = require('./_lib');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const key = String(getEnv('SHOBA_API_KEY'));
    return sendJson(res, 200, {
      ok: true,
      configured: Boolean(key),
      length: key.length,
      trimmedLength: key.trim().length,
      hasLeadingOrTrailingWhitespace: key !== key.trim()
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      configured: false,
      error: error.message
    });
  }
};
