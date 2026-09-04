const {
  cors,
  requireApiKey,
  wordpressRequest,
  sendJson,
  normalizeText,
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

function cleanValue(value) {
  return String(value || '').trim();
}

async function findExisting(business) {
  const name = cleanValue(business.name);
  const website = normalizeUrl(business.website);
  const phone = normalizePhone(business.phone);

  const slug =
    business.slug ||
    makeSlug(name);

  const matches = new Map();

  if (slug) {
    const result = await wordpressRequest(
      'job-listings',
      {
        method: 'GET',
        params: {
          slug,
          per_page: 100
        }
      }
    );

    for (const item of result.data || []) {
      matches.set(item.id, {
        item,
        signals: ['exact_slug']
      });
    }
  }

  if (name) {
    const result = await wordpressRequest(
      'job-listings',
      {
        method: 'GET',
        params: {
          search: name,
          per_page: 100
        }
      }
    );

    for (const item of result.data || []) {
      const existingTitle =
        normalizeText(
          item.title?.rendered
        );

      if (
        existingTitle ===
        normalizeText(name)
      ) {
        const existing =
          matches.get(item.id);

        if (existing) {
          existing.signals.push(
            'exact_title'
          );
        } else {
          matches.set(item.id, {
            item,
            signals: ['exact_title']
          });
        }
      }
    }
  }

  return Array.from(
    matches.values()
  ).map(match => ({
    id: match.item.id,
    title:
      match.item.title?.rendered || '',
    slug:
      match.item.slug || '',
    status:
      match.item.status || '',
    link:
      match.item.link || '',
    signals:
      match.signals,
    websiteMatch:
      Boolean(
        website &&
        normalizeUrl(
          match.item.meta?._job_website ||
          match.item._job_website
        ) === website
      ),
    phoneMatch:
      Boolean(
        phone &&
        normalizePhone(
          match.item.meta?._job_phone ||
          match.item._job_phone
        ) === phone
      )
  }));
}

function buildPayload(business) {
  const title =
    cleanValue(business.name);

  const content =
    cleanValue(
      business.description ||
      business.about ||
      ''
    );

  const meta = {};

  const mappings = {
    _job_location: business.location,
    geo_latitude: business.latitude,
    geo_longitude: business.longitude,
    _job_phone: business.phone,
    _job_email: business.email,
    _job_website: business.website,
    _shobaownershipstatus:
      business.ownership_status,
    _shobaverificationstatus:
      business.verification_status,
    _shobabusinesstype:
      business.business_type,
    _shobaservicemodel:
      business.service_model
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      meta[key] = String(value);
    }
  }

  return {
    title: {
      raw: title
    },

    content: {
      raw: content
    },

    status: 'draft',

    meta
  };
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

    const businesses =
      Array.isArray(body.businesses)
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
      const existing =
        await findExisting(business);

      results.push({
        name:
          cleanValue(business.name),

        slug:
          business.slug ||
          makeSlug(business.name),

        action:
          existing.length
            ? 'HOLD_FOR_REVIEW'
            : 'CREATE_DRAFT',

        reason:
          existing.length
            ? 'Potential existing listing detected.'
            : 'No matching listing detected.',

        existing,

        payload:
          buildPayload(business)
      });
    }

    return sendJson(res, 200, {
      ok: true,
      dryRun: true,
      writesPerformed: 0,
      results
    });

  } catch (error) {
    console.error(
      'Migration dry-run failed:',
      error.message
    );

    return sendJson(res, 502, {
      ok: false,
      error: 'Migration dry-run failed.'
    });
  }
};
