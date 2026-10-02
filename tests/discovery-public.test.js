const assert = require('assert');
const {
  isAllowedPublicOrigin,
  normalizePublicRequest
} = require('../api/_public-discovery');

function req(origin) {
  return { headers: origin ? { origin } : {} };
}

assert.equal(isAllowedPublicOrigin(req('https://shobaconnect.com')), true);
assert.equal(isAllowedPublicOrigin(req('https://www.shobaconnect.com')), true);
assert.equal(isAllowedPublicOrigin(req('https://example.com')), false);
assert.equal(isAllowedPublicOrigin(req()), false);

const normalized = normalizePublicRequest({
  query: '  Find   restaurants in Scarborough  ',
  context: { previous_query: '  restaurants  ' },
  page: -4,
  per_page: 100
});

assert.equal(normalized.query, 'Find restaurants in Scarborough');
assert.deepEqual(normalized.context, { previous_query: 'restaurants' });
assert.equal(normalized.page, 1);
assert.equal(normalized.per_page, 12);

const bounded = normalizePublicRequest({
  query: 'x'.repeat(500),
  context: { previous_query: 'y'.repeat(500) },
  page: 999,
  per_page: 0
});

assert.equal(bounded.query.length, 300);
assert.equal(bounded.context.previous_query.length, 300);
assert.equal(bounded.page, 100);
assert.equal(bounded.per_page, 1);

console.log('Public Discovery Bridge V1 tests passed.');
