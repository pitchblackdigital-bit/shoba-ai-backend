const { cors, sendJson, getEnv } = require('./_lib');
module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  const required = ['WORDPRESS_URL','WORDPRESS_USERNAME','WORDPRESS_APP_PASSWORD','SHOBA_API_KEY','ALLOWED_ORIGINS'];
  const missing = required.filter(name => { try { getEnv(name); return false; } catch { return true; } });
  return sendJson(res, missing.length ? 503 : 200, { ok: missing.length === 0, service: 'shoba-ai-backend', missing });
};
