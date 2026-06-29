const test = require("node:test");
const assert = require("assert/strict");
const { parseCsv } = require("../../src/server/directory/csv");
const {
  normalizeEntry,
  validateAndNormalizeEntry,
  validateDirectoryPayload,
  validateEntry
} = require("../../src/server/directory/schema");

test("validates required directory entry fields", () => {
  const invalid = validateEntry({ name: "Only a name" });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("description")));

  const valid = validateEntry({
    name: "Search Tool",
    description: "Indexes directory data.",
    category: "tools"
  });
  assert.equal(valid.ok, true);
});

test("normalizes taxonomy fields and generated ids", () => {
  const entry = normalizeEntry({
    name: "Taxonomy Helper",
    description: "Maintains controlled terms.",
    category: "documents",
    tags: "taxonomy, facets",
    taxonomy: {
      subcategory: "guides",
      aliases: ["Facet Guide"],
      facets: {
        audience: "engineering"
      }
    }
  });

  assert.equal(entry.id, "taxonomy-helper");
  assert.deepEqual(entry.tags, ["taxonomy", "facets"]);
  assert.equal(entry.taxonomy.category, "documents");
  assert.deepEqual(entry.taxonomy.facets.audience, ["engineering"]);
});

test("validates a directory payload", () => {
  const result = validateDirectoryPayload({
    entries: [{
      id: "ok",
      name: "OK",
      description: "Valid",
      category: "tools"
    }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.entries[0].id, "ok");
});

test("parses CSV imports with tag arrays", () => {
  const rows = parseCsv('id,name,description,category,tags\nentry-one,Entry One,One description,tools,"ai|search"');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tags, ["ai", "search"]);
});

test("returns validation errors from validateAndNormalizeEntry", () => {
  const result = validateAndNormalizeEntry({ category: "tools" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
