const assert = require('assert');
const {
  normalizeQuery, detectFilters, expandSynonyms, matchListing, calculateRelevance,
  buildMatchReasons, buildSearchResult, searchListings
} = require('../api/_search');

const listing = {
  id: 123, title: 'Island Kitchen', slug: 'island-kitchen',
  description: 'A Caribbean restaurant serving Scarborough.', excerpt: 'Caribbean food.',
  location: 'Scarborough, Toronto', latitude: null, longitude: null,
  categories: ['Restaurant'], regions: ['Scarborough'], tags: ['Caribbean'], amenities: [],
  business_type: 'restaurant', service_model: null, ownership_status: 'black_owned',
  verification_status: 'verified', website: 'https://example.test', phone: '416-555-0100',
  featured_media: null, link: 'https://shobaconnect.com/listing/island-kitchen'
};
const query = 'Black-owned Caribbean restaurants in Scarborough';

assert.equal(normalizeQuery(' Black-Owned  Restaurants! '), 'black owned restaurants');
assert.deepEqual(detectFilters(query), {
  ownership_status: 'black_owned', location: 'scarborough', business_type: ['restaurant']
});
assert(expandSynonyms('place to eat').includes('restaurant'));
assert(matchListing(listing, query));
assert(!matchListing({ ...listing, ownership_status: null }, query));
assert(calculateRelevance(listing, query) > 0.8);
assert.deepEqual(buildMatchReasons(listing, query), [
  'Black-owned', 'Restaurant', 'Caribbean', 'Scarborough', 'Verified listing'
]);
assert.deepEqual(buildSearchResult(listing, query), {
  id: 123, name: 'Island Kitchen', slug: 'island-kitchen',
  description: 'A Caribbean restaurant serving Scarborough.', excerpt: 'Caribbean food.',
  location: 'Scarborough, Toronto', latitude: null, longitude: null,
  categories: ['Restaurant'], regions: ['Scarborough'], business_type: 'restaurant', service_model: null,
  tags: ['Caribbean'], amenities: [], ownership_status: 'black_owned', verification_status: 'verified',
  website: 'https://example.test', phone: '416-555-0100', image: null,
  url: 'https://shobaconnect.com/listing/island-kitchen', score: calculateRelevance(listing, query),
  match_reasons: ['Black-owned', 'Restaurant', 'Caribbean', 'Scarborough', 'Verified listing']
});
const noResults = searchListings([listing], 'Black-owned lawyers in Etobicoke');
assert.equal(noResults.total, 0);
assert.deepEqual(noResults.suggestions, { locations: ['Scarborough', 'Scarborough, Toronto'], categories: ['Restaurant'] });
const paged = searchListings([listing, { ...listing, id: 124, title: 'Island Kitchen Two', slug: 'island-kitchen-two' }], query, { page: 2, per_page: 1 });
assert.equal(paged.total, 2);
assert.equal(paged.results.length, 1);
console.log('SHOBA Search V1 tests passed.');
