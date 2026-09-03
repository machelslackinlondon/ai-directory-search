const { normalizeText, tokenize, unique } = require("../utils/text");
const { normalizeFacetMap, normalizeStringArray } = require("./schema");
const { DESIGN_CATEGORIES, DESIGN_FACETS } = require("./designTaxonomy");

function normalizeTaxonomy(taxonomy = {}) {
  const sourceCategories = Array.isArray(taxonomy.categories) ? taxonomy.categories : DESIGN_CATEGORIES;
  const categories = sourceCategories
    ? sourceCategories.map((item) => ({
        category: item.category,
        subcategories: normalizeStringArray(item.subcategories),
        description: item.description || ""
      })).filter((item) => item.category)
    : [];

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
    facets: normalizeFacetMap(Object.keys(taxonomy.facets || {}).length > 0 ? taxonomy.facets : DESIGN_FACETS),
    synonyms,
    relatedTerms
  };
}

function collectTaxonomy(entries, taxonomy = {}) {
  const normalized = normalizeTaxonomy(taxonomy);
  const categories = new Map(normalized.categories.map((item) => [item.category, item]));
  const tags = new Set();
  const facets = { ...normalized.facets };
  const aliases = new Map();

  entries.forEach((entry) => {
    const entryTaxonomy = entry.taxonomy || {};
    if (!categories.has(entry.category)) {
      categories.set(entry.category, {
        category: entry.category,
        subcategories: entryTaxonomy.subcategory ? [entryTaxonomy.subcategory] : [],
        description: ""
      });
    } else if (entryTaxonomy.subcategory) {
      const category = categories.get(entry.category);
      category.subcategories = unique([...category.subcategories, entryTaxonomy.subcategory]);
    }

    normalizeStringArray(entry.tags).forEach((tag) => tags.add(tag));
    normalizeStringArray(entryTaxonomy.tags).forEach((tag) => tags.add(tag));
    normalizeStringArray(entryTaxonomy.aliases).forEach((alias) => aliases.set(alias, entry.id));

    Object.entries(entryTaxonomy.facets || {}).forEach(([facet, values]) => {
      facets[facet] = unique([...(facets[facet] || []), ...normalizeStringArray(values)]);
    });
  });

  return {
    ...normalized,
    categories: Array.from(categories.values()).sort((a, b) => a.category.localeCompare(b.category)),
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
