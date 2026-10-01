const {
  cors,
  requireApiKey,
  sendJson,
  normalizeText
} = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');
const { evaluateDuplicate } = require('../duplicate-engine');

function lifecycleFor(listing) {
  const verification = normalizeText(listing.verification_status);

  if (verification === 'verified') return 'verified';
  if (verification === 'needs review') return 'verification_needed';
  if (verification === 'pending review') return 'verification_needed';

  const hasIdentity = Boolean(listing.title);
  const hasEnrichment = Boolean(
    listing.website || listing.phone || listing.location ||
    (Array.isArray(listing.categories) && listing.categories.length)
  );

  if (!hasIdentity) return 'discovered';
  if (hasEnrichment) return 'enriched';
  return 'discovered';
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!requireApiKey(req)) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  }

  try {
    const index = await getDirectoryIndex();

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        agent: 'discovery',
        source: 'wordpress',
        record_count: index.record_count,
        cache: index.cache,
        lifecycle_counts: index.listings.reduce((acc, listing) => {
          const state = lifecycleFor(listing);
          acc[state] = (acc[state] || 0) + 1;
          return acc;
        }, {})
      });
    }

    if (req.method === 'POST') {
      const candidate = req.body || {};
      const duplicate = evaluateDuplicate(index, candidate);

      return sendJson(res, 200, {
        ok: true,
        agent: 'discovery',
        candidate: {
          name: candidate.name || candidate.title || null,
          website: candidate.website || null,
          phone: candidate.phone || null,
          location: candidate.location || null
        },
        lifecycle: 'discovered',
        duplicate
      });
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('discovery-agent error', error);
    return sendJson(res, 500, { ok: false, error: 'discovery_failed' });
  }
};
