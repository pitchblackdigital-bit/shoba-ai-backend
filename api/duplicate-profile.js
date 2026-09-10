const {
  cors,
  requireApiKey,
  wordpressRequest,
  sendJson,
  normalizeText,
  normalizeWebsiteInput,
  normalizeUrl,
  normalizePhone,
  makeSlug
} = require('./_lib');

function ms(start) {
  return Number(
    ((Number(process.hrtime.bigint()) / 1e6) - start).toFixed(2)
  );
}

async function timed(label, fn) {
  const start = Number(process.hrtime.bigint()) / 1e6;

  try {
    const result = await fn();

    return {
      ok: true,
      label,
      elapsed_ms: ms(start),
      result
    };
  } catch (error) {
    return {
      ok: false,
      label,
      elapsed_ms: ms(start),
      error: {
        message: error.message,
        status: error.status || null
      }
    };
  }
}

async function fetchAllListingsInstrumented() {
  const listings = [];
  let page = 1;
  const pageTimings = [];

  while (page <= 20) {
    const start = Number(process.hrtime.bigint()) / 1e6;

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

    const elapsed = ms(start);

    const items = Array.isArray(result.data)
      ? result.data
      : [];

    pageTimings.push({
      page,
      records: items.length,
      elapsed_ms: elapsed
    });

    listings.push(...items);

    if (items.length < 100) break;

    page++;
  }

  return {
    listings,
    pages_fetched: page,
    records_scanned: listings.length,
    page_timings: pageTimings
  };
}

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
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

  const name = String(
    req.query?.name || 'Beach Hill Smokehouse'
  ).trim();

  const website = normalizeWebsiteInput(
    req.query?.website || ''
  );

  const phone = String(
    req.query?.phone || ''
  ).trim();

  const slug = makeSlug(name);

  const overallStart =
    Number(process.hrtime.bigint()) / 1e6;

  const profile = {
    input: {
      name,
      slug,
      website,
      phone
    },
    checks: {}
  };

  /*
   * 1. Exact slug lookup
   */
  profile.checks.slug = await timed(
    'slug',
    async () => {
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

      return {
        matches: Array.isArray(result.data)
          ? result.data.map(item => item.id)
          : []
      };
    }
  );

  /*
   * 2. Name lookup
   */
  profile.checks.name = await timed(
    'name',
    async () => {
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

      const normalizedName =
        normalizeText(name);

      const matches =
        Array.isArray(result.data)
          ? result.data
              .filter(item =>
                normalizeText(
                  item.title?.rendered || ''
                ) === normalizedName
              )
              .map(item => item.id)
          : [];

      return {
        matches
      };
    }
  );

  /*
   * 3. Full directory scan used by the
   *    website/phone duplicate logic.
   */
  if (website || phone) {
    profile.checks.directory =
      await timed(
        'full_directory_scan',
        async () => {
          const result =
            await fetchAllListingsInstrumented();

          const incomingWebsite =
            normalizeUrl(website);

          const incomingPhone =
            normalizePhone(phone);

          const websiteMatches = [];
          const phoneMatches = [];

          for (const item of result.listings) {
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
              websiteMatches.push(item.id);
            }

            if (
              incomingPhone &&
              existingPhone &&
              incomingPhone === existingPhone
            ) {
              phoneMatches.push(item.id);
            }
          }

          return {
            pages_fetched:
              result.pages_fetched,
            records_scanned:
              result.records_scanned,
            website_matches:
              websiteMatches,
            phone_matches:
              phoneMatches,
            page_timings:
              result.page_timings
          };
        }
      );
  } else {
    profile.checks.directory = {
      ok: true,
      label: 'full_directory_scan',
      elapsed_ms: 0,
      result: {
        skipped: true,
        reason:
          'No website or phone supplied'
      }
    };
  }

  profile.total_ms = ms(overallStart);

  profile.memory_mb = {
    rss: Number(
      (process.memoryUsage().rss / 1048576).toFixed(2)
    ),
    heap_used: Number(
      (process.memoryUsage().heapUsed / 1048576).toFixed(2)
    ),
    heap_total: Number(
      (process.memoryUsage().heapTotal / 1048576).toFixed(2)
    )
  };

  return sendJson(res, 200, {
    ok: true,
    test: 'duplicate_check_profile',
    request_id:
      req.headers['x-request-id'] ||
      `dup-${Date.now()}`,
    profile
  });
};
