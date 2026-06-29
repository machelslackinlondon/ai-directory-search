const { asArray, slugify, unique } = require("../utils/text");

const ENTRY_FIELDS = [
  "id",
  "name",
  "description",
  "category",
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
  const normalized = {
    id,
    name: String(base.name || id),
    description: String(base.description || ""),
    category: String(base.category || "uncategorized"),
    tags,
    location: String(base.location || ""),
    url: String(base.url || ""),
    contact: String(base.contact || ""),
    metadata: isPlainObject(base.metadata) ? base.metadata : {},
    createdAt: base.createdAt || now,
    updatedAt: base.updatedAt || now
  };

  normalized.taxonomy = normalizeTaxonomyForEntry({ ...normalized, taxonomy: base.taxonomy });
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
