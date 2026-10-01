const assert = require('node:assert/strict');
const { websiteState, assessListing, assessCorpus } = require('../api/_data-quality');

const complete = {
  id: 1, slug: 'sample', title: 'Sample Business', phone: '4165550100',
  email: 'hello@example.com', website: 'https://example.com', location: 'Toronto, ON',
  categories: [4], types: [], business_type: 'service', ownership_status: 'first_party',
  verification_status: 'verified', modified: '2025-01-01T00:00:00'
};

assert.equal(websiteState('example.com').syntactically_valid, true);
assert.equal(websiteState('not a website').syntactically_valid, false);

const a = assessListing(complete, '2026-10-01T00:00:00.000Z');
assert.equal(a.unknowns.length, 0);
assert.equal(a.provenance.source_observation_date_available, false);
assert.equal(a.freshness.assessable, false);
assert.equal(a.confidence.assessable, false);

const missing = assessListing({ id: 2, title: 'Unknown Ownership', description: 'Black-owned verified business', categories: [1] }, '2026-10-01T00:00:00.000Z');
assert.ok(missing.unknowns.includes('ownership_status'));
assert.ok(missing.unknowns.includes('verification_status'));

const bad = assessListing({ id: 3, title: 'Bad URL', website: 'not a website' }, '2026-10-01T00:00:00.000Z');
assert.ok(bad.conflicts.includes('website_invalid_syntax'));

const noExpected = assessCorpus([complete]);
assert.equal(noExpected.corpus.expected_record_count, null);
assert.equal(noExpected.corpus.count_matches_expected, null);

const mismatch = assessCorpus([complete], { expectedCount: 355 });
assert.equal(mismatch.corpus.actual_record_count, 1);
assert.equal(mismatch.corpus.count_matches_expected, false);

console.log('SHOBA Data Quality V1 tests passed');
