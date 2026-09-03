const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const {
  buildMatchLabels,
  entryMatchesAnyPreference,
  normalizeKeyword,
  normalizeSearchFilters
} = require("../../src/server/search/searchContract");

test("normalizes comma and array preference values", () => {
  const filters = normalizeSearchFilters({ rooms: "Kitchen,Bathroom", styles: ["Modern"] });
  assert.deepEqual(filters.rooms, ["Kitchen", "Bathroom"]);
  assert.deepEqual(filters.styles, ["Modern"]);
  assert.equal(normalizeKeyword(" Intérieur Design + Decor "), "interieur design + decor");
});

test("uses one global OR across preference groups", () => {
  const atelier = seed.entries.find(({ id }) => id === "atelier-north-architecture");
  assert.equal(entryMatchesAnyPreference(atelier, {
    rooms: ["Bathroom"],
    styles: ["Modern"]
  }), true);
});

test("returns structured labels only for selected values that matched", () => {
  const atelier = seed.entries.find(({ id }) => id === "atelier-north-architecture");
  assert.deepEqual(buildMatchLabels(atelier, {
    rooms: ["Kitchen", "Bathroom"],
    styles: ["Modern"]
  }), [
    { facet: "rooms", value: "kitchen", label: "Kitchen" },
    { facet: "styles", value: "modern", label: "Modern" }
  ]);
});
