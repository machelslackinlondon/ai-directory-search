const { DESIGN_FACETS, US_STATES } = require("../directory/designTaxonomy");
const { normalizeText, unique } = require("../utils/text");

const PRIMARY_FILTER_FIELDS = ["category", "businessType", "state"];
const PREFERENCE_FILTER_FIELDS = ["rooms", "projectTypes", "styles", "services"];

function asValues(value) {
  return unique((Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean));
}

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSearchFilters(filters = {}) {
  return {
    category: String(filters.category || ""),
    businessType: String(filters.businessType || filters.subcategory || ""),
    state: String(filters.state || ""),
    tags: asValues(filters.tags),
    rooms: asValues(filters.rooms),
    projectTypes: asValues(filters.projectTypes),
    styles: asValues(filters.styles),
    services: asValues(filters.services)
  };
}

function entryValues(entry, field) {
  const value = entry[field] || entry.taxonomy?.facets?.[field] || [];
  return asValues(value);
}

function selectedPreferences(filters) {
  const normalized = normalizeSearchFilters(filters);
  return PREFERENCE_FILTER_FIELDS.flatMap((facet) => normalized[facet].map((label) => ({ facet, label })));
}

function entryMatchesAnyPreference(entry, filters) {
  const selected = selectedPreferences(filters);
  if (selected.length === 0) return true;
  return selected.some(({ facet, label }) => entryValues(entry, facet).some((value) => normalizeText(value) === normalizeText(label)));
}

function buildMatchLabels(entry, filters) {
  return selectedPreferences(filters)
    .filter(({ facet, label }) => entryValues(entry, facet).some((value) => normalizeText(value) === normalizeText(label)))
    .map(({ facet, label }) => ({ facet, value: normalizeText(label).replace(/\s+/g, "-"), label }));
}

function entryScalar(entry, field) {
  if (field === "businessType") return entry.businessType || entry.taxonomy?.subcategory || "";
  return entry[field] || "";
}

function entryMatchesPrimaryFilters(entry, filters) {
  const normalized = normalizeSearchFilters(filters);
  const primaryMatch = PRIMARY_FILTER_FIELDS.every((field) =>
    !normalized[field] || normalizeText(entryScalar(entry, field)) === normalizeText(normalized[field])
  );
  const entryTags = entryValues(entry, "tags").map(normalizeText);
  return primaryMatch && normalized.tags.every((tag) => entryTags.includes(normalizeText(tag)));
}

function buildFacetCounts(entries, taxonomy = {}) {
  const labelsByField = {
    category: (taxonomy.categories || []).map(({ category }) => category),
    businessType: (taxonomy.categories || []).flatMap(({ subcategories }) => subcategories || []),
    state: US_STATES,
    ...DESIGN_FACETS
  };
  return Object.fromEntries(Object.entries(labelsByField).map(([field, labels]) => [
    field,
    unique(labels).map((label) => ({
      value: normalizeText(label).replace(/\s+/g, "-"),
      label,
      count: entries.filter((entry) => {
        const values = PRIMARY_FILTER_FIELDS.includes(field) ? [entryScalar(entry, field)] : entryValues(entry, field);
        return values.some((value) => normalizeText(value) === normalizeText(label));
      }).length
    }))
  ]));
}

module.exports = {
  PRIMARY_FILTER_FIELDS,
  PREFERENCE_FILTER_FIELDS,
  buildFacetCounts,
  buildMatchLabels,
  entryMatchesAnyPreference,
  entryMatchesPrimaryFilters,
  normalizeKeyword,
  normalizeSearchFilters
};
