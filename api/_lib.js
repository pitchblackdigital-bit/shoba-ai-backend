const crypto = require('crypto');

const DEFAULT_ORIGINS = ['https://shobaconnect.com', 'https://www.shobaconnect.com'];

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function cors(req, res) {
  const requestOrigin = req.headers.origin;
  const configured = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map(v => v.trim()).filter(Boolean);
  if (requestOrigin && configured.includes(requestOrigin)) res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-SHOBA-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function requireApiKey(req) {
  const expected = getEnv('SHOBA_API_KEY');
  const supplied = req.headers['x-shoba-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function wordpressAuth() {
  const username = getEnv('WORDPRESS_USERNAME');
  const password = getEnv('WORDPRESS_APP_PASSWORD').replace(/\s+/g, '');
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function wordpressFetch(path, params = {}) {
  const base = getEnv('WORDPRESS_URL').replace(/\/$/, '');
  const url = new URL(`${base}/wp-json/wp/v2/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  let response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'SHOBA-AI-Backend/1.2' }, cache: 'no-store' });
  if ((response.status === 401 || response.status === 403) && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APP_PASSWORD) {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'SHOBA-AI-Backend/1.2', Authorization: wordpressAuth() }, cache: 'no-store' });
  }
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`WordPress returned HTTP ${response.status}`);
    error.status = response.status; error.wordpress = data; error.responseHeaders = Object.fromEntries(response.headers.entries()); throw error;
  }
  return { data, headers: response.headers };
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function cleanListing(item) {
  const meta = item.meta || {};
  return {
    id: item.id, slug: item.slug, title: stripHtml(item.title?.rendered),
    description: stripHtml(item.content?.rendered), excerpt: stripHtml(item.excerpt?.rendered),
    date: item.date, modified: item.modified, status: item.status, link: item.link,
    featured_media: item.featured_media || null,
    location: meta.job_listing_location ?? item.job_listing_location ?? null,
    company: meta._company_name ?? item._company_name ?? null,
    website: meta._company_website ?? item._company_website ?? null,
    phone: meta._company_phone ?? item._company_phone ?? null,
    email: meta._application ?? item._application ?? null,
    categories: item.job_listing_category || [], regions: item.job_listing_region || [],
    types: item.job_listing_type || [], tags: item.job_listing_tag || [], amenities: item.job_listing_amenity || []
  };
}

function sendJson(res, status, body) { res.status(status).json(body); }
module.exports = {
  cors,
  requireApiKey,
  wordpressFetch,
  wordpressAuth,
  sendJson,
  cleanListing,
  stripHtml,
  getEnv
};
