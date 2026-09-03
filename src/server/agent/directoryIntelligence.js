const { normalizeText, tokenize, unique } = require("../utils/text");

const STRUCTURED_PHRASES = [
  "filter by",
  "filtered by",
  "show me",
  "show",
  "sort by",
  "order by",
  "limit",
  "page"
];

const INTENT_PHRASES = [
  "who are the best",
  "who is the best",
  "find experts",
  "find expert",
  "top engineers",
  "top engineer",
  "who works with",
  "recommended",
  "recommend",
  "best"
];

function hasMeaningfulFilters(filters = {}) {
  return Object.values(filters || {}).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return hasMeaningfulFilters(value);
    return Boolean(value);
  });
}

function phraseMatches(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function hasPaginationOrSorting(query, options = {}) {
  const text = normalizeText(query);
  if (options.offset || (options.sort && options.sort !== "relevance")) return true;
  return /\b(show|limit|first)\s+\d+\b/.test(text) || /\b(page|sort|order)\b/.test(text);
}

function hasExplicitConstraint(query, taxonomy = {}) {
  const text = normalizeText(query);
  if (/\b(in|near|location|located in|team|role|skill|seniority)\b/.test(text)) return true;

  const categories = (taxonomy.categories || []).map((item) => normalizeText(item.category));
  const tags = (taxonomy.tags || []).map(normalizeText);
  return [...categories, ...tags].some((term) => term && text.includes(term));
}

function isAutocompleteLike(query, taxonomy = {}) {
  const text = normalizeText(query);
  if (!text || text.endsWith("?")) return false;
  if (phraseMatches(text, STRUCTURED_PHRASES) || phraseMatches(text, INTENT_PHRASES)) return false;

  const terms = tokenize(query);
  if (terms.length === 0 || terms.length > 3) return false;

  const knownTerms = new Set([
    ...(taxonomy.tags || []).map(normalizeText),
    ...(taxonomy.categories || []).map((item) => normalizeText(item.category)),
    ...Object.values(taxonomy.facets || {}).flat().map(normalizeText),
    ...Object.keys(taxonomy.aliases || {}).map(normalizeText)
  ]);
  const allTermsKnown = terms.every((term) => knownTerms.has(normalizeText(term)));
  return !allTermsKnown && terms.every((term) => term.length <= 4);
}

function classifyDirectoryQuery(query, context = {}, options = {}) {
  const taxonomy = context.taxonomy || (context.store && context.store.getTaxonomy && context.store.getTaxonomy()) || {};
  const text = normalizeText(query);

  if (options.autocomplete || isAutocompleteLike(query, taxonomy)) {
    return {
      mode: "autocomplete",
      path: "graphql",
      reason: "partial query uses deterministic suggestions"
    };
  }

  if (
    hasMeaningfulFilters(options.filters)
    || phraseMatches(text, STRUCTURED_PHRASES)
    || hasPaginationOrSorting(query, options)
  ) {
    return {
      mode: "graphql",
      path: "deterministic",
      reason: "structured filters or explicit constraints"
    };
  }

  if (phraseMatches(text, INTENT_PHRASES) || /\b(who|which|what)\b/.test(text)) {
    return {
      mode: "mcp",
      path: "semantic",
      tool: "search_directory",
      reason: "natural-language intent requires semantic interpretation"
    };
  }

  if (hasExplicitConstraint(query, taxonomy)) {
    return {
      mode: "graphql",
      path: "deterministic",
      reason: "explicit constraints"
    };
  }

  return {
    mode: "hybrid",
    path: "suggest-then-mcp",
    tool: "search_directory",
    reason: "ambiguous query"
  };
}

function candidateTypePriority(type) {
  const priorities = {
    name: 100,
    role: 90,
    team: 85,
    category: 75,
    tag: 70,
    location: 65,
    alias: 60
  };
  return priorities[type] || 50;
}

function addCandidate(candidates, label, type, entryId) {
  if (!label) return;
  candidates.push({
    label,
    type,
    entryId,
    baseScore: candidateTypePriority(type)
  });
}

function collectSuggestionCandidates(entries = [], taxonomy = {}) {
  const candidates = [];
  entries.forEach((entry) => {
    const metadata = entry.metadata || {};
    const entryTaxonomy = entry.taxonomy || {};
    addCandidate(candidates, entry.name, "name", entry.id);
    addCandidate(candidates, metadata.role, "role", entry.id);
    addCandidate(candidates, metadata.team || metadata.owner || metadata.accountOwner, "team", entry.id);
    addCandidate(candidates, entry.location, "location", entry.id);
    addCandidate(candidates, entry.category, "category", entry.id);
    (entry.tags || []).forEach((tag) => addCandidate(candidates, tag, "tag", entry.id));
    (entryTaxonomy.aliases || []).forEach((alias) => addCandidate(candidates, alias, "alias", entry.id));
  });

  (taxonomy.categories || []).forEach((item) => {
    addCandidate(candidates, item.category, "category");
    (item.subcategories || []).forEach((subcategory) => addCandidate(candidates, subcategory, "role"));
  });
  (taxonomy.tags || []).forEach((tag) => addCandidate(candidates, tag, "tag"));
  Object.values(taxonomy.facets || {}).forEach((values) => {
    (values || []).forEach((value) => addCandidate(candidates, value, "tag"));
  });

  return candidates;
}

function scoreSuggestion(candidate, queryTerms, queryText) {
  const labelText = normalizeText(candidate.label);
  const labelTerms = tokenize(candidate.label);
  if (!labelText) return 0;

  let score = candidate.baseScore;
  if (labelText === queryText) score += 60;
  else if (labelText.startsWith(queryText)) score += 45;
  else if (queryText && labelText.includes(queryText)) score += 25;

  const matchedTerms = queryTerms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return labelTerms.some((labelTerm) => labelTerm.startsWith(normalizedTerm))
      || labelText.includes(normalizedTerm);
  });
  if (matchedTerms.length === 0) return 0;

  score += matchedTerms.length * 15;
  return score;
}

function searchSuggestions(query, context = {}, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 10, 10));
  const store = context.store;
  const entries = context.entries || (store && store.listEntries ? store.listEntries() : []);
  const taxonomy = context.taxonomy || (store && store.getTaxonomy ? store.getTaxonomy() : {});
  const queryText = normalizeText(query);
  const queryTerms = tokenize(query);

  if (!queryText || queryTerms.length === 0) return [];

  const suggestions = new Map();
  collectSuggestionCandidates(entries, taxonomy).forEach((candidate) => {
    const score = scoreSuggestion(candidate, queryTerms, queryText);
    if (score <= 0) return;
    const key = `${normalizeText(candidate.label)}:${candidate.type}`;
    const existing = suggestions.get(key);
    if (!existing || score > existing.score) {
      suggestions.set(key, {
        label: candidate.label,
        type: candidate.type,
        score,
        ...(candidate.entryId ? { entryId: candidate.entryId } : {})
      });
    }
  });

  return Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function formatDirectoryResult(result) {
  const entry = result.entry || result;
  const metadata = entry.metadata || {};
  const parts = [
    entry.name,
    metadata.role,
    metadata.team || metadata.owner || metadata.accountOwner,
    entry.location
  ].filter(Boolean);
  return unique(parts).join(" | ");
}

module.exports = {
  classifyDirectoryQuery,
  formatDirectoryResult,
  hasMeaningfulFilters,
  searchSuggestions
};
