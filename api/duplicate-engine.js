const {
  normalizeText,
  normalizeUrl,
  normalizePhone,
  makeSlug
} = require('./_lib');

function normalizedCandidate(candidate = {}) {
  return {
    name: normalizeText(candidate.name || candidate.title),
    slug: normalizeText(candidate.slug || makeSlug(candidate.name || candidate.title)),
    website: normalizeUrl(candidate.website),
    phone: normalizePhone(candidate.phone),
    location: normalizeText(candidate.location)
  };
}

function compatibleLocation(a, b) {
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function evaluateDuplicate(index, candidate) {
  const c = normalizedCandidate(candidate);

  if (c.slug && index.bySlug.has(c.slug)) {
    const match = index.bySlug.get(c.slug)[0];
    return {
      duplicate: true,
      decision: 'duplicate',
      matched_listing_id: match.id,
      rule: 'slug_exact',
      confidence: 'high'
    };
  }

  if (c.website && index.byWebsite.has(c.website)) {
    const match = index.byWebsite.get(c.website)[0];
    return {
      duplicate: true,
      decision: 'duplicate',
      matched_listing_id: match.id,
      rule: 'website_exact',
      confidence: 'high'
    };
  }

  if (c.phone && index.byPhone.has(c.phone)) {
    const match = index.byPhone.get(c.phone)[0];
    return {
      duplicate: true,
      decision: 'duplicate',
      matched_listing_id: match.id,
      rule: 'phone_exact',
      confidence: 'high'
    };
  }

  if (c.name && index.byName.has(c.name)) {
    const matches = index.byName.get(c.name);
    const locationMatch = matches.find(m =>
      compatibleLocation(c.location, m.normalized.location)
    );

    if (locationMatch) {
      return {
        duplicate: true,
        decision: 'duplicate',
        matched_listing_id: locationMatch.id,
        rule: 'name_exact_location_compatible',
        confidence: 'high'
      };
    }

    return {
      duplicate: false,
      decision: 'needs_review',
      matched_listing_id: matches[0].id,
      rule: 'name_exact_location_conflict',
      confidence: 'medium'
    };
  }

  return {
    duplicate: false,
    decision: 'create_candidate',
    matched_listing_id: null,
    rule: 'no_exact_match',
    confidence: 'high'
  };
}

module.exports = {
  normalizedCandidate,
  evaluateDuplicate
};
