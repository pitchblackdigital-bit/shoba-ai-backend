const { cors, requireApiKey, sendJson } = require('../_lib');
const { getDirectoryIndex } = require('../directory-index');
const { assessCorpus } = require('../_data-quality');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!requireApiKey(req)) return sendJson(res, 401, { error: 'unauthorized' });

  try {
    const expectedRaw = req.method === 'GET' ? req.query?.expected_count : req.body?.expected_count;
    const expectedCount = expectedRaw === undefined || expectedRaw === null || expectedRaw === '' ? null : Number(expectedRaw);
    if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
      return sendJson(res, 400, { error: 'invalid_expected_count' });
    }

    const index = await getDirectoryIndex({ forceRefresh: true });
    const report = assessCorpus(index.listings, { expectedCount });
    return sendJson(res, 200, {
      ...report,
      retrieval: {
        source: index.source,
        context: index.context,
        status: index.status,
        index_record_count: index.record_count
      }
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: 'data_quality_assessment_failed',
      message: error.message,
      wordpress: error.wordpress || undefined
    });
  }
};
