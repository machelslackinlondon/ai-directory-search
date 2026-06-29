function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "i",
    "in",
    "is",
    "it",
    "me",
    "no",
    "of",
    "on",
    "or",
    "our",
    "show",
    "that",
    "the",
    "to",
    "us",
    "with"
  ]);

  return normalizeText(value)
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopWords.has(term));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  const slug = normalizeText(value).replace(/\s+/g, "-").replace(/^-|-$/g, "");
  return slug || `entry-${Date.now()}`;
}

module.exports = {
  asArray,
  escapeHtml,
  normalizeText,
  slugify,
  tokenize,
  unique
};
