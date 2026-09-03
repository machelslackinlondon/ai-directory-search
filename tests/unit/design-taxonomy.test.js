const test = require("node:test");
const assert = require("assert/strict");
const {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
} = require("../../src/server/directory/designTaxonomy");

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
