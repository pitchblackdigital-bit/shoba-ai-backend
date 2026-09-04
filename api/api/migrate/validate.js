const {
  cors,
  requireApiKey,
  wordpressRequest,
  sendJson,
  normalizeUrl,
  normalizePhone,
  makeSlug
} = require('../_lib');

function getBody(req) {
  if (!req.body) return {};

  if (typeof req.body === 'object') {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function validateBusiness(business) {
  const errors = [];

  if (!business || typeof business !== 'object') {
    return ['Business record is required.'];
  }

  if (!business.name) {
    errors.push('name is required');
  }

  if (
    business.website &&
    !normalizeUrl(business.website)
  ) {
    errors.push('website is invalid');
  }

  if (
    business.phone &&
    normalizePhone(business.phone).length < 7
  ) {
    errors.push('phone appears invalid');
  }

  return errors;
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
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

  try {
    const body = getBody(req);

    const businesses = Array.isArray(body.businesses)
      ? body.businesses
      : [body.business];

    if (!businesses.length || !businesses[0]) {
      return sendJson(res, 400, {
        ok: false,
        error: 'No business records supplied.'
      });
    }

    const results = [];

    for (const business of businesses) {
      const errors = validateBusiness(business);

      const title = business.name
        ? String(business.name).trim()
        : '';

      const slug =
        business.slug ||
        makeSlug(title);

      let existingBySlug = [];

      if (slug) {
        try {
          const result = await wordpressRequest(
            'job-listings',
            {
              method: 'GET',
              params: {
                slug,
                per_page: 100,
                context: 'view'
              }
            }
          );

          existingBySlug =
            Array.isArray(result.data)
              ? result.data
              : [];
        } catch {
          errors.push(
            'Unable to check WordPress for existing slug.'
          );
        }
      }

      results.push({
        name: title,
        slug,
        valid: errors.length === 0,
        errors,
        existingBySlug: existingBySlug.map(item => ({
          id: item.id,
          slug: item.slug,
          title: item.title?.rendered || '',
          status: item.status,
          link: item.link
        }))
      });
    }

    return sendJson(res, 200, {
      ok: true,
      count: results.length,
      results
    });

  } catch (error) {
    console.error(
      'Migration validation failed:',
      error.message
    );

    return sendJson(res, 502, {
      ok: false,
      error: 'Migration validation failed.'
    });
  }
};
