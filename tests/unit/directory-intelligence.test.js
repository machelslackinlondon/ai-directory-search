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

test("directory intelligence recognizes canonical business, state, and preference constraints", () => {
  const context = createTestContext();
  const route = classifyDirectoryQuery("Decorator California Bathroom", {
    store: context.store
  });

  assert.equal(route.mode, "graphql");
  assert.equal(route.path, "deterministic");
});

test("directory autocomplete includes canonical states", () => {
  const context = createTestContext();
  const suggestions = searchSuggestions("cal", { store: context.store });

  assert.ok(suggestions.some((suggestion) => suggestion.label === "California" && suggestion.type === "state"));
});

test("directory result formatting only uses present fields", () => {
  const context = createTestContext();
  const entry = context.store.getEntry("hearth-kitchen-studio");
  const formatted = formatDirectoryResult({
    entry,
    matchLabels: [{ facet: "styles", value: "traditional", label: "Traditional" }]
  });

  assert.match(formatted, /Hearth Kitchen Studio/);
  assert.match(formatted, /Kitchen Designer/);
  assert.match(formatted, /Chicago, Illinois/);
  assert.match(formatted, /Traditional/);
  assert.doesNotMatch(formatted, /undefined|null/);
});
