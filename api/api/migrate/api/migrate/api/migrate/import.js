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

async function findPotentialDuplicates(business) {
  const name =
    cleanValue(business.name);

  const website =
    normalizeUrl(business.website);

  const phone =
    normalizePhone(business.phone);

  const slug =
    business.slug ||
    makeSlug(name);

  const matches = new Map();

  if (slug) {
    const result =
      await wordpressRequest(
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
    const result =
      await wordpressRequest(
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
  ).map(match => {
    const existingWebsite =
      normalizeUrl(
        match.item.meta?._job_website ||
        match.item._job_website
      );

    const existingPhone =
      normalizePhone(
        match.item.meta?._job_phone ||
        match.item._job_phone
      );

    return {
      id: match.item.id,

      title:
        match.item.title?.rendered ||
        '',

      slug:
        match.item.slug ||
        '',

      status:
        match.item.status ||
        '',

      link:
        match.item.link ||
        '',

      signals:
        match.signals,

      websiteMatch:
        Boolean(
          website &&
          existingWebsite &&
          website === existingWebsite
        ),

      phoneMatch:
        Boolean(
          phone &&
          existingPhone &&
          phone === existingPhone
        )
    };
  });
}

function buildPayload(business) {
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
      raw:
        cleanValue(
          business.name
        )
    },

    content: {
      raw:
        cleanValue(
          business.description ||
          business.about ||
          ''
        )
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

    /*
     * HARD SAFETY GATE.
     *
     * Nothing can be written unless the caller
     * explicitly confirms draft creation.
     */
    if (
      body.confirm !==
      'CREATE_DRAFT'
    ) {
      return sendJson(res, 400, {
        ok: false,
        error:
          'Draft import requires confirm: CREATE_DRAFT.'
      });
    }

    const businesses =
      Array.isArray(body.businesses)
        ? body.businesses
        : [body.business];

    if (
      !businesses.length ||
      !businesses[0]
    ) {
      return sendJson(res, 400, {
        ok: false,
        error:
          'No business records supplied.'
      });
    }

    const results = [];

    for (const business of businesses) {
      if (!business.name) {
        results.push({
          ok: false,
          action: 'REJECTED',
          reason:
            'Business name is required.'
        });

        continue;
      }

      const duplicates =
        await findPotentialDuplicates(
          business
        );

      /*
       * Any potential match stops the record.
       * No automatic merge.
       * No overwrite.
       */
      if (duplicates.length > 0) {
        results.push({
          ok: false,
          action: 'HOLD_FOR_REVIEW',
          name: business.name,
          duplicates
        });

        continue;
      }

      const payload =
        buildPayload(business);

      const created =
        await wordpressRequest(
          'job-listings',
          {
            method: 'POST',
            body: payload
          }
        );

      results.push({
        ok: true,
        action: 'CREATED_DRAFT',
        name: business.name,
        wordpressId:
          created.data?.id ||
          null,
        slug:
          created.data?.slug ||
          null,
        status:
          created.data?.status ||
          null,
        link:
          created.data?.link ||
          null
      });
    }

    return sendJson(res, 200, {
      ok: true,
      writesPerformed:
        results.filter(
          result =>
            result.action ===
            'CREATED_DRAFT'
        ).length,
      results
    });

  } catch (error) {
    console.error(
      'Migration import failed:',
      error.message
    );

    return sendJson(res, 502, {
      ok: false,
      error:
        'Migration draft import failed.'
    });
  }
};
