const DEFAULT_PUBLIC_ORIGINS = [
  'https://shobaconnect.com',
  'https://www.shobaconnect.com'
];

function publicOrigins() {
  return (process.env.PUBLIC_DISCOVERY_ORIGINS || DEFAULT_PUBLIC_ORIGINS.join(','))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function isAllowedPublicOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  return Boolean(origin) && publicOrigins().includes(origin);
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizePublicRequest(body = {}) {
  const query = cleanString(body.query, 300);
  const previousQuery = cleanString(body.context?.previous_query, 300);
  const pageValue = Number.parseInt(body.page, 10);
  const perPageValue = Number.parseInt(body.per_page, 10);

  return {
    query,
    context: previousQuery ? { previous_query: previousQuery } : {},
    page: Number.isFinite(pageValue) ? Math.min(Math.max(pageValue, 1), 100) : 1,
    per_page: Number.isFinite(perPageValue) ? Math.min(Math.max(perPageValue, 1), 12) : 8
  };
}

module.exports = {
  DEFAULT_PUBLIC_ORIGINS,
  publicOrigins,
  isAllowedPublicOrigin,
  normalizePublicRequest
};
