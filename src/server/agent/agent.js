const { normalizeText, tokenize } = require("../utils/text");
const { DESIGN_FACETS, US_STATES } = require("../directory/designTaxonomy");
const { callMcpTool } = require("../mcp/tools");
const {
  classifyDirectoryQuery,
  formatDirectoryResult,
  searchSuggestions
} = require("./directoryIntelligence");

function inferFilters(question, taxonomy, suppliedFilters = {}) {
  const text = normalizeText(question);
  const filters = { ...suppliedFilters };

  function matchingLabel(labels) {
    return [...labels]
      .sort((a, b) => normalizeText(b).length - normalizeText(a).length)
      .find((label) => text.includes(normalizeText(label)));
  }

  if (!filters.category) {
    const category = matchingLabel((taxonomy.categories || []).map((item) => item.category));
    if (category) filters.category = category;
  }

  if (!filters.businessType && !filters.subcategory) {
    const businessType = matchingLabel(
      (taxonomy.categories || []).flatMap((item) => item.subcategories || [])
    );
    if (businessType) filters.businessType = businessType;
  }

  if (!filters.state) {
    const state = matchingLabel(US_STATES);
    if (state) filters.state = state;
  }

  Object.entries(DESIGN_FACETS).forEach(([field, defaults]) => {
    const selected = new Set(Array.isArray(filters[field]) ? filters[field] : []);
    (taxonomy.facets?.[field] || defaults).forEach((label) => {
      if (text.includes(normalizeText(label))) selected.add(label);
    });
    if (selected.size > 0) filters[field] = Array.from(selected);
  });

  const tags = new Set(Array.isArray(filters.tags) ? filters.tags : []);
  (taxonomy.tags || []).forEach((tag) => {
    if (text.includes(normalizeText(tag))) tags.add(tag);
  });
  if (tags.size > 0) filters.tags = Array.from(tags);

  return filters;
}

function findReferencedId(question, entries) {
  const text = normalizeText(question);
  return entries.find((entry) => text.includes(normalizeText(entry.id)) || (entry.taxonomy || {}).aliases?.some((alias) => text.includes(normalizeText(alias))));
}

function summarizeResults(question, searchResponse) {
  const results = searchResponse.results;
  if (results.length === 0) {
    return "I could not find any existing directory entries that match that question. I will not invent entries; try a broader query or remove a filter.";
  }

  const lead = results[0].entry;
  const references = results.map((result) => `${result.entry.name} (${result.entry.id})`).join(", ");
  const topResults = results.slice(0, 3).map(formatDirectoryResult).join("; ");
  const reasons = results.slice(0, 3).map((result) => {
    const matchedPreferences = (result.matchLabels || []).map(({ label }) => label).join(", ");
    return `${result.entry.name}: ${result.whyMatched}${matchedPreferences ? `; preference matches: ${matchedPreferences}` : ""}`;
  }).join(" ");
  return `I found ${searchResponse.total} matching director${searchResponse.total === 1 ? "y entry" : "y entries"}. Top match: ${lead.name} (${lead.id}). Top results by relevance: ${topResults}. References: ${references}. Why these matched: ${reasons}`;
}

function summarizeSuggestions(query, suggestions) {
  if (suggestions.length === 0) {
    return "I could not find autocomplete suggestions for that partial query. I will not invent entries; try a broader query.";
  }
  const labels = suggestions.map((suggestion) => `${suggestion.label} (${suggestion.type})`).join(", ");
  return `Autocomplete suggestions for "${query}": ${labels}.`;
}

function deterministicIntent(question) {
  const terms = tokenize(question);
  if (terms.some((term) => ["detail", "details", "lookup", "open"].includes(term))) return "entry_lookup";
  if (terms.some((term) => ["category", "categories", "list"].includes(term))) return "category_list";
  return "directory_search";
}

function applyLowConfidenceGuard(question, searchResponse) {
  if (searchResponse.backend === "memory" && question && searchResponse.results[0]?.score < 10) {
    searchResponse.results = [];
    searchResponse.total = 0;
  }
  return searchResponse;
}

async function searchViaMcp(params, context) {
  try {
    return await callMcpTool("search_directory", params, context);
  } catch (firstError) {
    try {
      return await callMcpTool("search_directory", params, context);
    } catch (secondError) {
      const error = new Error("Unable to retrieve directory results at this time.");
      error.cause = secondError || firstError;
      throw error;
    }
  }
}

async function executeSearch(route, params, context) {
  if (route.mode === "graphql") {
    try {
      return await context.searchAdapter.search(params);
    } catch (error) {
      return searchViaMcp(params, context);
    }
  }

  if (route.mode === "mcp") {
    return searchViaMcp(params, context);
  }

  const suggestions = searchSuggestions(params.query, context, { limit: 5 });
  if (suggestions.length > 0 && suggestions[0].score >= 100) {
    const suggestedSearch = await context.searchAdapter.search({
      ...params,
      query: suggestions[0].label
    });
    if (suggestedSearch.results.length > 0) return suggestedSearch;
  }
  return searchViaMcp(params, context);
}

async function answerDirectoryQuestion(question, context, options = {}) {
  const store = context.store;
  const searchAdapter = context.searchAdapter;
  const taxonomy = store.getTaxonomy();
  const entries = store.listEntries();
  const intent = deterministicIntent(question);
  const references = [];
  const tools = [];

  if (intent === "category_list" && normalizeText(question).includes("categor")) {
    tools.push("list_directory_categories");
    const categories = taxonomy.categories.map((item) => item.category).join(", ");
    return {
      answer: `Available directory categories: ${categories}.`,
      references: [],
      tools,
      grounded: true,
      results: []
    };
  }

  if (intent === "entry_lookup") {
    const referenced = findReferencedId(question, entries);
    if (referenced) {
      tools.push("get_directory_entry");
      references.push({ id: referenced.id, name: referenced.name });
      return {
        answer: `${referenced.name} (${referenced.id}) is a ${referenced.category} entry. ${referenced.description}`,
        references,
        tools,
        grounded: true,
        results: [{ entry: referenced, score: 1, whyMatched: "requested by id or alias" }]
      };
    }
  }

  const filters = inferFilters(question, taxonomy, options.filters || {});
  const stats = await searchAdapter.stats();
  const memoryStats = stats.adapter === "memory"
    ? stats
    : (stats.backend === "memory" ? stats.memory : null);
  const mode = memoryStats?.semanticEnabled && memoryStats.semanticProvider === "local-hash"
    ? "hybrid"
    : "keyword";
  tools.push("search_directory");
  const route = classifyDirectoryQuery(question, { store, taxonomy }, {
    autocomplete: options.autocomplete,
    filters: options.filters || {},
    limit: options.limit || 5,
    offset: options.offset,
    sort: options.sort
  });

  if (route.mode === "autocomplete") {
    const suggestions = searchSuggestions(question, { store, taxonomy }, { limit: options.limit || 10 });
    return {
      answer: summarizeSuggestions(question, suggestions),
      references: [],
      tools: ["searchSuggestions"],
      grounded: suggestions.length > 0,
      results: []
    };
  }

  const searchResponse = await executeSearch(route, {
    query: question,
    filters,
    limit: options.limit || 5,
    sort: options.sort || "relevance",
    mode
  }, context).then((response) => applyLowConfidenceGuard(question, response));

  searchResponse.results.forEach((result) => {
    references.push({ id: result.entry.id, name: result.entry.name });
  });

  return {
    answer: summarizeResults(question, searchResponse),
    references,
    tools,
    grounded: searchResponse.results.length > 0,
    mode: searchResponse.mode,
    filters,
    results: searchResponse.results.map((result) => ({
      id: result.id,
      score: result.score,
      matchLabels: result.matchLabels || [],
      whyMatched: result.whyMatched,
      entry: result.entry
    }))
  };
}

module.exports = {
  answerDirectoryQuestion,
  deterministicIntent,
  inferFilters
};
