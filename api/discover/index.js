const { cors, requireApiKey, wordpressFetch, sendJson, cleanListing } = require('../_lib');

function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s&-]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function rankListing(item, query, location, category) {
  const q = tokens(query);
  const title = tokens(item.title).join(' ');
  const body = tokens([item.description, item.excerpt, item.company, item.location, ...(item.categories || []), ...(item.tags || [])].join(' ')).join(' ');
  let score = 0;
  const matched = [];
  for (const term of q) {
    if (title.includes(term)) { score += 8; matched.push(term); }
    else if (body.includes(term)) { score += 3; matched.push(term); }
  }
  if (location && String(item.location || '').toLowerCase().includes(String(location).toLowerCase())) score += 10;
  if (category && (item.categories || []).some(c => String(c).toLowerCase().includes(String(category).toLowerCase()))) score += 10;
  if (item.website) score += 1;
  if (item.phone) score += 1;
  return { score, matched: [...new Set(matched)] };
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  if (!requireApiKey(req)) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  const { q = '', query = '', location = '', category = '', limit = '10', page = '1' } = req.query;
  const userQuery = String(q || query).trim();
  if (!userQuery && !location && !category) return sendJson(res, 400, { ok: false, error: 'Provide q, location or category.' });
  try {
    const result = await wordpressFetch('job-listings', { search: userQuery || undefined, per_page: 100, page: Math.max(1, Number(page) || 1), status: 'publish' });
    let listings = Array.isArray(result.data) ? result.data.map(cleanListing) : [];
    const ranked = listings.map(item => ({ item, ...rankListing(item, userQuery, location, category) }))
      .filter(x => x.score > 0 || (!userQuery && (location || category)))
      .sort((a,b) => b.score - a.score || String(a.item.title).localeCompare(String(b.item.title)))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
    return sendJson(res, 200, {
      ok: true, engine: 'shoba-discovery-v1', query: userQuery || null, location: location || null, category: category || null,
      count: ranked.length,
      results: ranked.map(({ item, score, matched }) => ({ ...item, discovery: { score, matchedTerms: matched } }))
    });
  } catch (error) {
    console.error('Discovery request failed:', error.message);
    return sendJson(res, 502, { ok: false, error: 'Unable to run SHOBA discovery.' });
  }
};
