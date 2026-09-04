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

function buildPayload(business) {
  const name = String(business.name || '').trim();

  const description =
    business.description ||
    business.short_description ||
    '';

  const meta = {};

  if (business.location) {
    meta._job_location = business.location;
  }

  if (business.latitude !== undefined) {
    meta.geo_latitude = business.latitude;
  }

  if (business.longitude !== undefined) {
    meta.geo_longitude = business.longitude;
  }

  if (business.phone) {
    meta._job_phone = business.phone;
  }

  if (business.email) {
    meta._job_email = business.email;
  }

  if (business.website) {
    meta._job_website = business.website;
  }

  if (business.ownership_status) {
    meta._shobaownershipstatus =
      business.ownership_status;
  }

  if (business.verification_status) {
    meta._shobaverificationstatus =
      business.verification_status;
  }

  if (business.business_type) {
    meta._shobabusinesstype =
      business.business_type;
  }

  if (business.service_model) {
    meta._shobaservicemodel =
      business.service_model;
  }

  return {
    title: {
      raw: name
    },

    content: {
      raw: description
    },

    status: 'draft',

    meta
  };
}

async function fetchAllListings() {
  const listings = [];
  let page = 1;

  while (page <= 20) {
    const result = await wordpressRequest(
      'job-listings',
      {
        method: 'GET',
        params: {
          per_page: 100,
          page,
          context: 'view'
        }
      }
    );

    const items = Array.isArray(result.data)
      ? result.data
      : [];

    listings.push(...items);

    if (items.length < 100) {
      break;
    }

    page += 1;
  }

  return listings;
}

async function findExisting(business, slug) {
  const matches = new Map();

  const addMatch = (reason, item) => {
    if (!item || !item.id) return;

    const existing = matches.get(item.id);

    if (existing) {
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      return;
    }

    matches.set(item.id, {
      reasons: [reason],
      id: item.id,
      slug: item.slug,
      title: item.title?.rendered || '',
      status: item.status,
      link: item.link
    });
  };

  const name = String(business.name || '').trim();

  /*
   * First check the exact slug directly.
   */
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

      if (Array.isArray(result.data)) {
        for (const item of result.data) {
          addMatch('slug', item);
        }
      }
    } catch {}
  }

  /*
   * Check exact normalized business name.
   */
  if (name) {
    try {
      const result = await wordpressRequest(
        'job-listings',
        {
          method: 'GET',
          params: {
            search: name,
            per_page: 100,
            context: 'view'
          }
        }
      );

      if (Array.isArray(result.data)) {
        const normalizedName = normalizeText(name);

        for (const item of result.data) {
          const existingTitle =
            normalizeText(
              item.title?.rendered || ''
            );

          if (existingTitle === normalizedName) {
            addMatch('exact_title', item);
          }
        }
      }
    } catch {}
  }

  /*
   * Independently check website and phone.
   *
   * This is deliberately separate from slug/title
   * checking so a business with a changed name or
   * changed slug can still be detected.
   */
  const incomingWebsite =
    normalizeUrl(business.website);

  const incomingPhone =
    normalizePhone(business.phone);

  if (incomingWebsite || incomingPhone) {
    try {
      const listings = await fetchAllListings();

      for (const item of listings) {
        const meta = item.meta || {};

        const existingWebsite =
          normalizeUrl(
            meta._job_website ??
            item._job_website ??
            ''
          );

        const existingPhone =
          normalizePhone(
            meta._job_phone ??
            item._job_phone ??
            ''
          );

        if (
          incomingWebsite &&
          existingWebsite &&
          incomingWebsite === existingWebsite
        ) {
          addMatch('website', item);
        }

        if (
          incomingPhone &&
          existingPhone &&
          incomingPhone === existingPhone
        ) {
          addMatch('phone', item);
        }
      }
    } catch {}
  }

  return Array.from(matches.values());
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

    const business =
      body.business ||
      (Array.isArray(body.businesses)
        ? body.businesses[0]
        : null);

    if (!business || !business.name) {
      return sendJson(res, 400, {
        ok: false,
        error: 'A business with a name is required.'
      });
    }

    const slug =
      business.slug ||
      makeSlug(String(business.name));

    const existing = await findExisting(
      business,
      slug
    );

    if (existing.length > 0) {
      return sendJson(res, 200, {
        ok: true,
        action: 'HOLD_FOR_REVIEW',
        reason:
          'Potential existing WordPress listing found.',
        business: {
          name: business.name,
          slug
        },
        existing,
        payload: null
      });
    }

    const payload = buildPayload(business);

    return sendJson(res, 200, {
      ok: true,
      action: 'CREATE_DRAFT',
      business: {
        name: business.name,
        slug
      },
      existing: [],
      payload
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
