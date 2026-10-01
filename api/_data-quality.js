const { normalizeWebsiteInput, normalizeText } = require('./_lib');

const PRESENT = value => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== '';

function websiteState(value) {
  if (!PRESENT(value)) return { present: false, syntactically_valid: null, reason: 'missing' };
  const raw = normalizeWebsiteInput(value);
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return { present: true, syntactically_valid: Boolean(parsed.hostname && parsed.hostname.includes('.')), reason: parsed.hostname && parsed.hostname.includes('.') ? null : 'invalid_hostname' };
  } catch {
    return { present: true, syntactically_valid: false, reason: 'invalid_url_syntax' };
  }
}

function assessListing(listing, assessmentObservedAt) {
  const website = websiteState(listing.website);
  const fields = {
    identity: PRESENT(listing.title) || PRESENT(listing.company),
    contact: PRESENT(listing.phone) || PRESENT(listing.email) || website.present,
    location: PRESENT(listing.location) || (PRESENT(listing.latitude) && PRESENT(listing.longitude)),
    website: website.present,
    category_or_type: PRESENT(listing.categories) || PRESENT(listing.types) || PRESENT(listing.business_type),
    ownership: PRESENT(listing.ownership_status),
    verification: PRESENT(listing.verification_status)
  };

  const unknowns = [];
  if (!fields.identity) unknowns.push('identity');
  if (!fields.contact) unknowns.push('contact');
  if (!fields.location) unknowns.push('location');
  if (!fields.website) unknowns.push('website');
  if (!fields.category_or_type) unknowns.push('category_or_type');
  if (!fields.ownership) unknowns.push('ownership_status');
  if (!fields.verification) unknowns.push('verification_status');

  const conflicts = [];
  if (website.present && website.syntactically_valid === false) conflicts.push('website_invalid_syntax');

  const evidence = Object.entries(fields).filter(([, present]) => present).map(([field]) => ({
    field,
    source: 'wordpress_canonical_record',
    evidence_state: 'observed_in_canonical_record',
    assessment_observed_at: assessmentObservedAt
  }));

  return {
    business_id: listing.id,
    name: listing.title || listing.company || null,
    slug: listing.slug || null,
    wordpress_status: listing.status || null,
    assessment_observed_at: assessmentObservedAt,
    source: 'wordpress_canonical_record',
    fields,
    website,
    evidence,
    unknowns,
    conflicts,
    provenance: {
      source_available: true,
      source_observation_date_available: false,
      note: 'WordPress date/modified fields are not treated as evidence observation dates.'
    },
    freshness: {
      assessable: false,
      reason: 'No governed source observation date is available in the current canonical record.'
    },
    confidence: {
      assessable: false,
      reason: 'DQ V1 does not manufacture a single confidence or quality score.'
    },
    do_not_infer: [
      'ownership_from_name_description_or_category',
      'verification_from_field_presence',
      'current_operating_status_from_wordpress_modified_date',
      'address_from_unrelated_social_or_website_signals',
      'services_from_category',
      'hours_from_website_presence',
      'truth_confidence_from_completeness'
    ]
  };
}

function summarize(assessments) {
  const dimensions = ['identity','contact','location','website','category_or_type','ownership','verification'];
  const coverage = {};
  for (const dimension of dimensions) {
    const known = assessments.filter(a => a.fields[dimension]).length;
    coverage[dimension] = { known, unknown: assessments.length - known };
  }
  return {
    record_count: assessments.length,
    coverage,
    records_with_conflicts: assessments.filter(a => a.conflicts.length).length,
    records_with_unknowns: assessments.filter(a => a.unknowns.length).length
  };
}

function assessCorpus(listings, { expectedCount = null, observedAt = new Date().toISOString() } = {}) {
  const assessments = listings.map(listing => assessListing(listing, observedAt));
  const actualCount = assessments.length;
  const expected = Number.isInteger(expectedCount) && expectedCount >= 0 ? expectedCount : null;
  return {
    schema_version: 'shoba-dq-v1',
    mode: 'read_only',
    source: 'wordpress_canonical_record',
    assessment_observed_at: observedAt,
    corpus: {
      actual_record_count: actualCount,
      expected_record_count: expected,
      count_matches_expected: expected === null ? null : actualCount === expected,
      expected_count_note: expected === null ? 'No expected corpus count supplied. DQ V1 does not assume a historical count.' : null
    },
    summary: summarize(assessments),
    assessments
  };
}

module.exports = { websiteState, assessListing, summarize, assessCorpus };
