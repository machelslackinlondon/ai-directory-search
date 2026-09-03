const test = require("node:test");
const assert = require("assert/strict");
const { answerDirectoryQuestion, deterministicIntent, inferFilters } = require("../../src/server/agent/agent");
const { createTestContext } = require("../helpers");

test("deterministic agent refuses to invent missing entries", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("Find a submarine catering partner on Mars", context);
  assert.equal(response.references.length, 0);
  assert.match(response.answer, /will not invent/i);
});

test("agent answer is grounded in returned directory entries", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("Who handles traditional kitchen consultation?", context);
  assert.ok(response.references.length > 0);
  response.references.forEach((reference) => {
    assert.ok(context.store.getEntry(reference.id));
  });
});

test("agent can answer category list questions", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("List categories", context);
  assert.deepEqual(response.tools, ["list_directory_categories"]);
  assert.match(response.answer, /Architecture/);
});

test("agent uses deterministic suggestions for autocomplete input", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("kit des chi", context);
  assert.deepEqual(response.tools, ["searchSuggestions"]);
  assert.match(response.answer, /Autocomplete suggestions/);
  assert.equal(response.references.length, 0);
});

test("intent and filter inference are deterministic", () => {
  const context = createTestContext();
  assert.equal(deterministicIntent("lookup atelier-north-architecture"), "entry_lookup");
  const filters = inferFilters("Find Architecture renovation", context.store.getTaxonomy());
  assert.equal(filters.category, "Architecture");
  assert.ok(filters.tags.includes("renovation"));
});
