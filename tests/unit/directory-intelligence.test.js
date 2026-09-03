const test = require("node:test");
const assert = require("assert/strict");
const {
  classifyDirectoryQuery,
  formatDirectoryResult,
  searchSuggestions
} = require("../../src/server/agent/directoryIntelligence");
const { createTestContext } = require("../helpers");

test("directory intelligence routes structured queries to deterministic path", () => {
  const context = createTestContext();
  const route = classifyDirectoryQuery("Show me Architecture in California filtered by renovation", {
    store: context.store
  });

  assert.equal(route.mode, "graphql");
  assert.equal(route.path, "deterministic");
});

test("directory intelligence routes ranking intent to MCP search", () => {
  const context = createTestContext();
  const route = classifyDirectoryQuery("Who are the best kitchen designers in Chicago?", {
    store: context.store
  });

  assert.equal(route.mode, "mcp");
  assert.equal(route.tool, "search_directory");
});

test("directory intelligence treats partial input as autocomplete", () => {
  const context = createTestContext();
  const route = classifyDirectoryQuery("kit des chi", {
    store: context.store
  });
  const suggestions = searchSuggestions("kit des chi", {
    store: context.store
  });

  assert.equal(route.mode, "autocomplete");
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.some((suggestion) => suggestion.label === "Kitchen Designer" || suggestion.label === "Chicago, Illinois"));
  assert.ok(suggestions.length <= 10);
});

test("directory intelligence does not treat ordinary short searches as autocomplete", () => {
  const context = createTestContext();
  const route = classifyDirectoryQuery("garden renewal", {
    store: context.store
  });

  assert.notEqual(route.mode, "autocomplete");
});

test("directory result formatting only uses present fields", () => {
  const context = createTestContext();
  const entry = context.store.getEntry("hearth-kitchen-studio");
  const formatted = formatDirectoryResult({ entry });

  assert.match(formatted, /Hearth Kitchen Studio/);
  assert.match(formatted, /Kitchen Designer/);
  assert.match(formatted, /Chicago, Illinois/);
  assert.doesNotMatch(formatted, /undefined|null/);
});
