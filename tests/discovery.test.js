const assert = require('node:assert/strict');
const { contextualQuery, summarizeResults, discover, STARTER_PROMPTS } = require('../api/_discovery');

const listing = {
  id: 1, title: 'Island Kitchen', slug: 'island-kitchen',
  description: 'Caribbean restaurant in Scarborough', excerpt: '',
  location: 'Scarborough, Toronto', categories: ['Restaurant'], regions: ['Scarborough'],
  tags: ['Caribbean'], amenities: [], types: [], business_type: 'restaurant',
  ownership_status: 'black_owned', verification_status: null,
  website: null, phone: null, featured_media: null, link: '/island-kitchen'
};

assert.equal(contextualQuery('in Scarborough', { previous_query: 'Find restaurants' }), 'Find restaurants in Scarborough');
assert.equal(contextualQuery('Find accountants', { previous_query: 'Find restaurants' }), 'Find accountants');
assert.equal(contextualQuery('what about Toronto', { previous_query: 'Find restaurants in Scarborough' }), 'Find restaurants in what about Toronto');
assert.equal(STARTER_PROMPTS.length, 4);

const found = discover([listing], 'Black-owned Caribbean restaurants in Scarborough');
assert.equal(found.grounded, true);
assert.equal(found.source, 'wordpress_published_directory');
assert.equal(found.total, 1);
assert.equal(found.results[0].name, 'Island Kitchen');
assert.match(found.assistant.message, /1 published SHOBA listing/);

const torontoListing = { ...listing, id: 2, title: 'Toronto Kitchen', slug: 'toronto-kitchen', location: 'Toronto', regions: ['Toronto'], description: 'Caribbean restaurant in Toronto' };
const refined = discover([listing, torontoListing], 'what about Toronto', { context: { previous_query: 'Find restaurants in Scarborough' } });
assert.equal(refined.total, 2);
assert(refined.results.some(item => item.name === 'Toronto Kitchen'));
assert(!/scarborough/i.test(refined.resolved_query));

const none = discover([listing], 'lawyers in Etobicoke');
assert.equal(none.total, 0);
assert.match(none.assistant.message, /couldn't find a published SHOBA listing/);

const summary = summarizeResults({ results: [], total: 0, suggestions: {} });
assert.equal(summary.result_count, 0);

console.log('SHOBA Conversational Discovery V1 tests passed.');
