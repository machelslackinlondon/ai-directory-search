const { normalizeText, tokenize, unique } = require("../utils/text");
const { normalizeStringArray } = require("./schema");
const { DESIGN_CATEGORIES, DESIGN_FACETS, US_STATES } = require("./designTaxonomy");

function normalizeTaxonomy(taxonomy = {}) {
  const categories = DESIGN_CATEGORIES.map((item) => ({
    category: item.category,
    subcategories: [...item.subcategories]
  }));

  const synonyms = {};
  Object.entries(taxonomy.synonyms || {}).forEach(([term, values]) => {
    synonyms[normalizeText(term)] = normalizeStringArray(values);
  });

  const relatedTerms = {};
  Object.entries(taxonomy.relatedTerms || {}).forEach(([term, values]) => {
    relatedTerms[normalizeText(term)] = normalizeStringArray(values);
  });

  return {
    categories,
    facets: Object.fromEntries(
      Object.entries(DESIGN_FACETS).map(([field, values]) => [field, [...values]])
    ),
    states: [...US_STATES],
    synonyms,
    relatedTerms
  };
}

function collectTaxonomy(entries, taxonomy = {}) {
  const normalized = normalizeTaxonomy(taxonomy);
  const tags = new Set();
  const aliases = new Map();

  entries.forEach((entry) => {
    const entryTaxonomy = entry.taxonomy || {};
    normalizeStringArray(entry.tags).forEach((tag) => tags.add(tag));
    normalizeStringArray(entryTaxonomy.tags).forEach((tag) => tags.add(tag));
    normalizeStringArray(entryTaxonomy.aliases).forEach((alias) => aliases.set(alias, entry.id));
  });

  return {
    ...normalized,
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
    aliases: Object.fromEntries(aliases)
  };
}

function expandQueryTerms(query, taxonomy = {}) {
  const normalized = normalizeTaxonomy(taxonomy);
  const sourceTerms = tokenize(query);
  const terms = new Set(sourceTerms);
  const phrases = new Set();
  const normalizedQuery = normalizeText(query);

  Object.entries(normalized.synonyms).forEach(([term, values]) => {
    if (sourceTerms.includes(term) || normalizedQuery.includes(term)) {
      values.forEach((value) => {
        phrases.add(normalizeText(value));
        tokenize(value).forEach((token) => terms.add(token));
      });
    }
    values.forEach((value) => {
      const synonymText = normalizeText(value);
      if (normalizedQuery.includes(synonymText)) {
        terms.add(term);
        phrases.add(term);
      }
    });
  });

  Object.entries(normalized.relatedTerms).forEach(([term, values]) => {
    if (sourceTerms.includes(term) || normalizedQuery.includes(term)) {
      values.forEach((value) => {
        phrases.add(normalizeText(value));
        tokenize(value).forEach((token) => terms.add(token));
      });
    }
  });

  return {
    terms: Array.from(terms),
    phrases: Array.from(phrases).filter(Boolean)
  };
}

module.exports = {
  collectTaxonomy,
  expandQueryTerms,
  normalizeTaxonomy
};
