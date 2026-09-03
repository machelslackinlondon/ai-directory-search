const test = require("node:test");
const assert = require("assert/strict");
const {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  US_STATES,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
} = require("../../src/server/directory/designTaxonomy");
const { collectTaxonomy, normalizeTaxonomy } = require("../../src/server/directory/taxonomy");

test("exposes only the three approved design categories", () => {
  assert.deepEqual(DESIGN_CATEGORIES.map(({ category }) => category), [
    "Architecture",
    "Interior Design + Decor",
    "Outdoor + Garden Design"
  ]);
});

test("validates business types against their parent category", () => {
  assert.equal(businessTypeBelongsToCategory("Architecture", "Residential Architect"), true);
  assert.equal(businessTypeBelongsToCategory("Outdoor + Garden Design", "Residential Architect"), false);
});

test("canonicalizes case and accent variations without changing display labels", () => {
  assert.equal(canonicalizeControlledValue(DESIGN_FACETS.services, " full-SERVICE design "), "Full-service Design");
});

test("uses approved categories when no taxonomy categories are supplied", () => {
  assert.deepEqual(normalizeTaxonomy({}).categories.map(({ category }) => category), [
    "Architecture",
    "Interior Design + Decor",
    "Outdoor + Garden Design"
  ]);
});

test("public taxonomy always exposes canonical categories, facets, and a fresh state list", () => {
  const imported = {
    categories: [{ category: "Builders + Contractors", subcategories: ["General Contractor"] }],
    facets: { services: ["Industrial"], sectors: ["Industrial"] }
  };
  const first = collectTaxonomy([], imported);

  assert.deepEqual(first.categories, DESIGN_CATEGORIES);
  assert.deepEqual(first.facets, DESIGN_FACETS);
  assert.deepEqual(first.states, US_STATES);

  first.states.pop();
  assert.deepEqual(collectTaxonomy([], imported).states, US_STATES);
});
