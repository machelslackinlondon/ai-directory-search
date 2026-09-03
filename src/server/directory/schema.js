const { asArray, slugify, unique } = require("../utils/text");
const {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  US_STATES,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
} = require("./designTaxonomy");

const ENTRY_FIELDS = [
  "id",
  "name",
  "description",
  "category",
  "businessType",
  "state",
  "city",
  "rooms",
  "projectTypes",
  "styles",
  "services",
  "tags",
  "location",
  "url",
  "contact",
  "metadata",
  "createdAt",
  "updatedAt",
  "taxonomy"
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringArray(value) {
  return unique(asArray(value).flatMap((item) => {
    if (typeof item === "string") return item.split(",").map((part) => part.trim());
    return [String(item).trim()];
  })).filter(Boolean);
}

function normalizeFacetMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, normalizeStringArray(items)]));
}

function normalizeTaxonomyForEntry(entry) {
  const taxonomy = isPlainObject(entry.taxonomy) ? entry.taxonomy : {};
  const category = taxonomy.category || entry.category || "uncategorized";
  const tags = unique([...normalizeStringArray(entry.tags), ...normalizeStringArray(taxonomy.tags)]);

  return {
    category,
    subcategory: taxonomy.subcategory || "",
    tags,
    facets: normalizeFacetMap(taxonomy.facets),
    synonyms: normalizeStringArray(taxonomy.synonyms),
    relatedTerms: normalizeStringArray(taxonomy.relatedTerms),
    aliases: normalizeStringArray(taxonomy.aliases)
  };
}

function normalizeControlledArray(input, allowed, field, errors) {
  return normalizeStringArray(input).map((value) => {
    const canonical = canonicalizeControlledValue(allowed, value);
    if (!canonical) errors.push(`${field} contains unsupported value: ${value}.`);
    return canonical;
  }).filter(Boolean);
}

function validateControlledFields(input, options = {}) {
  const errors = [];
  const taxonomy = isPlainObject(input.taxonomy) ? input.taxonomy : {};
  const sourceCategory = input.category === undefined ? taxonomy.category : input.category;
  const sourceBusinessType = input.businessType === undefined ? taxonomy.subcategory : input.businessType;
  const hasCategory = sourceCategory !== undefined && sourceCategory !== "";
  const hasBusinessType = sourceBusinessType !== undefined && sourceBusinessType !== "";
  const hasState = input.state !== undefined && input.state !== "";
  const category = hasCategory ? canonicalizeControlledValue(DESIGN_CATEGORIES.map((item) => item.category), sourceCategory) : "";
  const businessType = hasBusinessType ? canonicalizeControlledValue(DESIGN_CATEGORIES.flatMap((item) => item.subcategories), sourceBusinessType) : "";

  if (hasCategory && !category) errors.push(`category contains unsupported value: ${sourceCategory}.`);
  if (hasBusinessType && !businessType) errors.push(`businessType contains unsupported value: ${sourceBusinessType}.`);
  if (category && businessType && !businessTypeBelongsToCategory(category, businessType)) {
    errors.push(`${businessType} does not belong to ${category}.`);
  }
  if (hasState && !canonicalizeControlledValue(US_STATES, input.state)) errors.push(`state contains unsupported value: ${input.state}.`);

  Object.entries(DESIGN_FACETS).forEach(([field, allowed]) => {
    const value = input[field] === undefined ? taxonomy.facets?.[field] : input[field];
    if (value !== undefined) normalizeControlledArray(value, allowed, field, errors);
  });

  if (!options.partial) {
    if (!hasBusinessType) errors.push("businessType is required.");
    if (!hasState) errors.push("state is required.");
  }

  return errors;
}

function validateEntry(input, options = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Entry must be an object."] };
  }

  const required = options.partial ? [] : ["name", "description", "category"];
  required.forEach((field) => {
    if (!input[field] || typeof input[field] !== "string") {
      errors.push(`${field} is required.`);
    }
  });

  if (input.id !== undefined && typeof input.id !== "string") errors.push("id must be a string.");
  if (input.name !== undefined && typeof input.name !== "string") errors.push("name must be a string.");
  if (input.description !== undefined && typeof input.description !== "string") errors.push("description must be a string.");
  if (input.category !== undefined && typeof input.category !== "string") errors.push("category must be a string.");
  if (input.tags !== undefined && !Array.isArray(input.tags) && typeof input.tags !== "string") errors.push("tags must be an array or comma-separated string.");
  if (input.metadata !== undefined && !isPlainObject(input.metadata)) errors.push("metadata must be an object.");
  if (input.taxonomy !== undefined && !isPlainObject(input.taxonomy)) errors.push("taxonomy must be an object.");

  ["createdAt", "updatedAt"].forEach((field) => {
    if (input[field] && Number.isNaN(Date.parse(input[field]))) {
      errors.push(`${field} must be an ISO date string.`);
    }
  });

  if (errors.length === 0) errors.push(...validateControlledFields(input, options));

  return { ok: errors.length === 0, errors };
}

function normalizeEntry(input) {
  const now = new Date().toISOString();
  const base = {};
  ENTRY_FIELDS.forEach((field) => {
    if (input[field] !== undefined) base[field] = input[field];
  });

  const id = base.id || slugify(base.name || "entry");
  const tags = normalizeStringArray(base.tags);
  const taxonomy = isPlainObject(base.taxonomy) ? base.taxonomy : {};
  const category = canonicalizeControlledValue(DESIGN_CATEGORIES.map((item) => item.category), base.category || taxonomy.category);
  const businessType = canonicalizeControlledValue(DESIGN_CATEGORIES.flatMap((item) => item.subcategories), base.businessType || taxonomy.subcategory);
  const state = canonicalizeControlledValue(US_STATES, base.state);
  const city = String(base.city || "").trim();
  const errors = [];
  const normalizedFacets = {
    rooms: normalizeControlledArray(base.rooms || taxonomy.facets?.rooms, DESIGN_FACETS.rooms, "rooms", errors),
    projectTypes: normalizeControlledArray(base.projectTypes || taxonomy.facets?.projectTypes, DESIGN_FACETS.projectTypes, "projectTypes", errors),
    styles: normalizeControlledArray(base.styles || taxonomy.facets?.styles, DESIGN_FACETS.styles, "styles", errors),
    services: normalizeControlledArray(base.services || taxonomy.facets?.services, DESIGN_FACETS.services, "services", errors)
  };
  const normalized = {
    id,
    name: String(base.name || id),
    description: String(base.description || ""),
    category: category || String(base.category || taxonomy.category || "uncategorized"),
    businessType,
    state,
    city,
    rooms: normalizedFacets.rooms,
    projectTypes: normalizedFacets.projectTypes,
    styles: normalizedFacets.styles,
    services: normalizedFacets.services,
    tags,
    location: [city, state].filter(Boolean).join(", ") || String(base.location || ""),
    url: String(base.url || ""),
    contact: String(base.contact || ""),
    metadata: isPlainObject(base.metadata) ? base.metadata : {},
    createdAt: base.createdAt || now,
    updatedAt: base.updatedAt || now
  };

  normalized.taxonomy = normalizeTaxonomyForEntry({ ...normalized, taxonomy: base.taxonomy });
  normalized.taxonomy.category = normalized.category;
  normalized.taxonomy.subcategory = businessType || normalized.taxonomy.subcategory;
  normalized.taxonomy.facets = { ...normalized.taxonomy.facets, ...normalizedFacets };
  normalized.category = normalized.taxonomy.category || normalized.category;
  normalized.tags = unique([...normalized.tags, ...normalized.taxonomy.tags]);
  normalized.taxonomy.tags = normalized.tags;

  return normalized;
}

function validateAndNormalizeEntry(input, options = {}) {
  const validation = validateEntry(input, options);
  if (!validation.ok) return validation;
  return { ok: true, entry: normalizeEntry(input), errors: [] };
}

function validateDirectoryPayload(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.entries)) {
    return { ok: false, errors: ["Payload must be an object with an entries array."] };
  }

  const entries = [];
  const errors = [];
  payload.entries.forEach((entry, index) => {
    const result = validateAndNormalizeEntry(entry);
    if (!result.ok) {
      errors.push(`entries[${index}]: ${result.errors.join(" ")}`);
    } else {
      entries.push(result.entry);
    }
  });

  return {
    ok: errors.length === 0,
    entries,
    taxonomy: isPlainObject(payload.taxonomy) ? payload.taxonomy : {},
    errors
  };
}

module.exports = {
  ENTRY_FIELDS,
  isPlainObject,
  normalizeEntry,
  normalizeFacetMap,
  normalizeStringArray,
  normalizeTaxonomyForEntry,
  validateAndNormalizeEntry,
  validateDirectoryPayload,
  validateEntry
};
