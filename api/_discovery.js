const { searchListings, detectFilters } = require('./_search');

const STARTER_PROMPTS = [
  'Find Black-owned restaurants in Scarborough',
  'Show me salons in Toronto',
  'Find a marketing consultant',
  'Show me accountants in North York'
];

function cleanTurn(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

function contextualQuery(query, context = {}) {
  const current = cleanTurn(query);
  const previous = cleanTurn(context.previous_query);
  if (!previous) return current;

  const refinement = /^(only|with|in|near|around|verified|black[- ]owned|show|what about|how about)\b/i.test(current);
  if (!refinement) return current;

  let base = previous;
  const currentFilters = detectFilters(current);
  const previousFilters = detectFilters(previous);
  if (currentFilters.location && previousFilters.location && currentFilters.location !== previousFilters.location) {
    base = base.replace(new RegExp(previousFilters.location, 'ig'), ' ').replace(/\s+/g, ' ').trim();
  }
  return `${base} ${current}`.trim().slice(0, 500);
}

function summarizeResults(search) {
  const results = Array.isArray(search.results) ? search.results : [];
  if (!results.length) {
    const locations = search.suggestions?.locations || [];
    const categories = search.suggestions?.categories || [];
    const hints = [...locations.slice(0, 2), ...categories.slice(0, 2)];
    return {
      message: hints.length
        ? `I couldn't find a published SHOBA listing matching that search. You can try refining it with: ${hints.join(', ')}.`
        : "I couldn't find a published SHOBA listing matching that search. Try a different business type or location.",
      result_count: 0
    };
  }

  const names = results.slice(0, 3).map(item => item.name).filter(Boolean);
  const suffix = search.total > names.length ? ` and ${search.total - names.length} more` : '';
  return {
    message: `I found ${search.total} published SHOBA ${search.total === 1 ? 'listing' : 'listings'} matching your search: ${names.join(', ')}${suffix}.`,
    result_count: search.total
  };
}

function discover(listings, query, options = {}) {
  const resolvedQuery = contextualQuery(query, options.context || {});
  const search = searchListings(listings, resolvedQuery, {
    page: options.page,
    per_page: options.per_page || 8
  });
  const summary = summarizeResults(search);

  return {
    engine: 'shoba-conversational-discovery-v1',
    grounded: true,
    source: 'wordpress_published_directory',
    query: cleanTurn(query),
    resolved_query: resolvedQuery,
    assistant: {
      message: summary.message,
      starter_prompts: STARTER_PROMPTS
    },
    ...search
  };
}

module.exports = { STARTER_PROMPTS, cleanTurn, contextualQuery, summarizeResults, discover };
