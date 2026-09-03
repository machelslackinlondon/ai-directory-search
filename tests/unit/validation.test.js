const test = require("node:test");
const assert = require("assert/strict");
const { parseCsv } = require("../../src/server/directory/csv");
const seed = require("../../src/data/seed-directory.json");
const { DESIGN_CATEGORIES, DESIGN_FACETS } = require("../../src/server/directory/designTaxonomy");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");
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
    name: "Design Studio",
    description: "Designs residential spaces.",
    category: "Architecture",
    businessType: "Residential Architect",
    state: "California"
  });
  assert.equal(valid.ok, true);
});

test("normalizes taxonomy fields and generated ids", () => {
  const entry = normalizeEntry({
    name: "Design Taxonomy Studio",
    description: "Maintains controlled design terms.",
    category: "Interior Design + Decor",
    businessType: "Interior Designer",
    state: "New York",
    city: "Brooklyn",
    rooms: ["Kitchen"],
    projectTypes: ["Renovation"],
    styles: ["Modern"],
    services: ["Consultation"],
    tags: "taxonomy, facets",
    taxonomy: {
      subcategory: "Interior Designer",
      aliases: ["Facet Guide"],
      facets: {
        rooms: "Kitchen"
      }
    }
  });

  assert.equal(entry.id, "design-taxonomy-studio");
  assert.deepEqual(entry.tags, ["taxonomy", "facets"]);
  assert.equal(entry.taxonomy.category, "Interior Design + Decor");
  assert.deepEqual(entry.taxonomy.facets.rooms, ["Kitchen"]);
});

test("validates a directory payload", () => {
  const result = validateDirectoryPayload({
    entries: [{
      id: "ok",
      name: "OK",
      description: "Valid",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.entries[0].id, "ok");
});

test("parses CSV imports with tag arrays", () => {
  const rows = parseCsv('id,name,description,category,businessType,state,tags\nentry-one,Entry One,One description,Architecture,Residential Architect,California,"design|search"');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tags, ["design", "search"]);
});

test("returns validation errors from validateAndNormalizeEntry", () => {
  const result = validateAndNormalizeEntry({ category: "Architecture" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("normalizes a controlled design profile and mirrors taxonomy fields", () => {
  const result = validateAndNormalizeEntry({
    id: "studio-test",
    name: "Studio Test",
    description: "Residential renovation practice.",
    category: "Architecture",
    businessType: "Residential Architect",
    state: "California",
    city: "San Francisco",
    rooms: ["Kitchen"],
    projectTypes: ["Renovation"],
    styles: ["Modern"],
    services: ["Full-service Design"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.location, "San Francisco, California");
  assert.equal(result.entry.taxonomy.subcategory, "Residential Architect");
  assert.deepEqual(result.entry.taxonomy.facets.rooms, ["Kitchen"]);
});

test("rejects a business type outside its category", () => {
  const result = validateAndNormalizeEntry({
    name: "Invalid Studio",
    description: "Invalid taxonomy pair.",
    category: "Outdoor + Garden Design",
    businessType: "Residential Architect",
    state: "Oregon"
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Residential Architect.*Outdoor \+ Garden Design/);
});

test("rejects imported top-level taxonomy outside the controlled directory contract", () => {
  const result = validateDirectoryPayload({
    taxonomy: {
      categories: [{
        category: "Builders + Contractors",
        subcategories: ["General Contractor"]
      }],
      facets: {
        services: ["Industrial"],
        sectors: ["Industrial"]
      }
    },
    entries: [{
      id: "valid-profile",
      name: "Valid Profile",
      description: "A valid controlled profile.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }]
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Builders \+ Contractors/);
  assert.match(result.errors.join(" "), /Industrial/);
  assert.match(result.errors.join(" "), /sectors/);
});

test("store imports reject invalid taxonomy without changing the canonical public taxonomy", () => {
  const store = createMemoryDirectoryStore(seed);

  assert.throws(() => store.importEntries({
    taxonomy: {
      categories: [{ category: "Builders + Contractors", subcategories: ["General Contractor"] }],
      facets: { services: ["Industrial"] }
    },
    entries: [{
      id: "invalid-taxonomy-import",
      name: "Invalid Taxonomy Import",
      description: "Must not redefine the directory taxonomy.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }]
  }), /Builders \+ Contractors|Industrial/);

  const taxonomy = store.getTaxonomy();
  assert.deepEqual(taxonomy.categories, DESIGN_CATEGORIES);
  assert.deepEqual(taxonomy.facets, DESIGN_FACETS);
});
