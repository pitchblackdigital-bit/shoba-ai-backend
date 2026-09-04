
const crypto = require('crypto');

const DEFAULT_ORIGINS = [
  'https://shobaconnect.com',
  'https://www.shobaconnect.com'
];

function getEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function cors(req, res) {
  const requestOrigin = req.headers.origin;

  const configured = (
    process.env.ALLOWED_ORIGINS ||
    DEFAULT_ORIGINS.join(',')
  )
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  if (requestOrigin && configured.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-SHOBA-API-Key'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

function requireApiKey(req) {
  const expected = getEnv('SHOBA_API_KEY');

  const supplied =
    req.headers['x-shoba-api-key'] ||
    (req.headers.authorization || '').replace(
      /^Bearer\s+/i,
      ''
    );

  if (!supplied || supplied.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(supplied),
    Buffer.from(expected)
  );
}

function wordpressAuth() {
  const username = getEnv('WORDPRESS_USERNAME');

  const password = getEnv('WORDPRESS_APP_PASSWORD')
    .replace(/\s+/g, '');

  return `Basic ${Buffer.from(
    `${username}:${password}`
  ).toString('base64')}`;
}

async function wordpressRequest(path, options = {}) {
  const base = getEnv('WORDPRESS_URL').replace(/\/$/, '');

  const url = new URL(
    `${base}/wp-json/wp/v2/${path.replace(/^\//, '')}`
  );

  Object.entries(options.params || {}).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        url.searchParams.set(key, String(value));
      }
    }
  );

  const method = options.method || 'GET';

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'SHOBA-AI-Backend/1.3',
    Authorization: wordpressAuth()
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body:
      options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    cache: 'no-store'
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      `WordPress returned HTTP ${response.status}`
    );

    error.status = response.status;
    error.wordpress = data;
    error.responseHeaders =
      Object.fromEntries(response.headers.entries());

    throw error;
  }

  return {
    data,
    headers: response.headers
  };
}

async function wordpressFetch(path, params = {}) {
  return wordpressRequest(path, {
    method: 'GET',
    params
  });
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanListing(item) {
  const meta = item.meta || {};

  return {
    id: item.id,
    slug: item.slug,

    title: stripHtml(
      item.title?.rendered
    ),

    description: stripHtml(
      item.content?.rendered
    ),

    excerpt: stripHtml(
      item.excerpt?.rendered
    ),

    date: item.date,
    modified: item.modified,
    status: item.status,
    link: item.link,

    featured_media:
      item.featured_media || null,

    location:
      meta._job_location ??
      item._job_location ??
      null,

    latitude:
      meta.geo_latitude ??
      item.geo_latitude ??
      null,

    longitude:
      meta.geo_longitude ??
      item.geo_longitude ??
      null,

    company:
      meta._company_name ??
      item._company_name ??
      null,

    phone:
      meta._job_phone ??
      item._job_phone ??
      null,

    email:
      meta._job_email ??
      item._job_email ??
      null,

    website:
      meta._job_website ??
      item._job_website ??
      null,

    ownership_status:
      meta._shobaownershipstatus ??
      item._shobaownershipstatus ??
      null,

    verification_status:
      meta._shobaverificationstatus ??
      item._shobaverificationstatus ??
      null,

    business_type:
      meta._shobabusinesstype ??
      item._shobabusinesstype ??
      null,

    service_model:
      meta._shobaservicemodel ??
      item._shobaservicemodel ??
      null,

    categories:
      item.job_listing_category || [],

    regions:
      item.job_listing_region || [],

    types:
      item.job_listing_type || [],

    tags:
      item.job_listing_tag || [],

    amenities:
      item.job_listing_amenity || []
  };
}

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(
      String(value).trim()
    );

    return url.hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return String(value)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }
}

function normalizePhone(value) {
  return String(value || '')
    .replace(/\D/g, '');
}

function makeSlug(title) {
  return normalizeText(title)
    .replace(/\s+/g, '-')
    .slice(0, 180);
}

module.exports = {
  cors,
  requireApiKey,
  wordpressFetch,
  wordpressRequest,
  wordpressAuth,
  sendJson,
  cleanListing,
  stripHtml,
  normalizeText,
  normalizeUrl,
  normalizePhone,
  makeSlug,
  getEnv
}; 
