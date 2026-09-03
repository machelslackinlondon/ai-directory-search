const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("assert/strict");
const vm = require("vm");
const renderers = require("../../public/renderers");

class FakeElement {
  constructor(selector) {
    this.selector = selector;
    this.value = "";
    this.innerHTML = "";
    this.textContent = "";
    this.disabled = false;
    this.dataset = {};
    this.files = [];
    this.listeners = {};
    this.classList = {
      toggle: () => {}
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  async dispatch(type, event = {}) {
    const handlers = this.listeners[type] || [];
    for (const handler of handlers) {
      await handler(event);
    }
  }
}

function createFakeDocument() {
  const selectors = [
    "#search-input",
    "#search-button",
    "#agent-input",
    "#agent-button",
    "#agent-inline-answer",
    "#business-type-filter",
    "#category-filter",
    "#state-filter",
    "#more-filters-toggle",
    "#more-filters-panel",
    "#applied-filter-chips",
    "#apply-filters",
    "#clear-filters",
    "#sort-control",
    "#mode-control",
    "#result-count",
    "#results",
    "#detail",
    "#agent-answer",
    "#clear-button",
    "#clear-log-button",
    "#activity-log",
    "#search-view",
    "#admin-view",
    "#import-button",
    "#reindex-button",
    "#import-content",
    "#import-format",
    "#import-mode",
    "#import-file",
    "#admin-token",
    "#admin-status",
    "#stats-output"
  ];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, new FakeElement(selector)]));
  elements["#sort-control"].value = "relevance";
  elements["#mode-control"].value = "keyword";
  elements["#import-format"].value = "json";
  elements["#import-mode"].value = "upsert";
  ["rooms", "projectTypes", "styles", "services"].forEach((facet) => {
    elements[`[data-facet-options=\"${facet}\"]`] = new FakeElement(`[data-facet-options=\"${facet}\"]`);
  });

  const tabs = [new FakeElement(".tab"), new FakeElement(".tab")];
  tabs[0].dataset.view = "search";
  tabs[1].dataset.view = "admin";

  return {
    elements,
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: (selector) => {
      if (selector === ".tab") return tabs;
      if (selector === "[data-facet-options]") {
        return ["rooms", "projectTypes", "styles", "services"].map((facet) => elements[`[data-facet-options=\"${facet}\"]`]);
      }
      return [];
    }
  };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("Ask button renders an inline grounded answer", async () => {
  const document = createFakeDocument();
  const requests = [];
  const consoleMessages = [];
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");

  const context = {
    console: {
      info: (...args) => consoleMessages.push(args)
    },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: {
      DirectoryRenderers: renderers
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/categories") {
        return { ok: true, json: async () => ({ categories: [] }) };
      }
      if (String(url).startsWith("/api/search")) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      if (url === "/api/stats") {
        return { ok: true, json: async () => ({ entries: 0 }) };
      }
      if (url === "/api/agent") {
        return {
          ok: true,
          json: async () => ({
            answer: "Hearth Kitchen Studio can help with traditional kitchen consultation.",
            references: [{ id: "hearth-kitchen-studio" }]
          })
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await tick();
  await tick();

  document.elements["#agent-input"].value = "who can help with traditional kitchen consultation ?";
  await document.elements["#agent-button"].dispatch("click");

  assert.ok(requests.some((request) => request.url === "/api/agent"));
  assert.ok(consoleMessages.some(([label, payload]) => label === "[directory] activity log" && Array.isArray(payload)));
  assert.ok(consoleMessages.some(([label, payload]) => label === "[directory] activity log" && payload.some((item) => item.action === "Ask completed")));
  assert.match(document.elements["#agent-inline-answer"].innerHTML, /Hearth Kitchen Studio/);
  assert.match(document.elements["#agent-inline-answer"].innerHTML, /hearth-kitchen-studio/);
  assert.equal(document.elements["#agent-button"].disabled, false);
  assert.equal(document.elements["#agent-button"].textContent, "Ask");
});

test("preference filters wait for Apply, show facet counts, and keep primary filters compatible", async () => {
  const document = createFakeDocument();
  const requests = [];
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const taxonomy = {
    categories: [
      { category: "Architecture", subcategories: ["Building Architect", "Residential Architect"] },
      { category: "Interior Design + Decor", subcategories: ["Kitchen Designer"] }
    ],
    facets: {
      rooms: ["Kitchen"],
      projectTypes: ["Renovation"],
      styles: ["Modern"],
      services: ["Consultation"]
    }
  };
  const searchResponse = {
    results: [{
      id: "atelier-north-architecture",
      score: 12,
      whyMatched: "Selected preferences matched.",
      matchLabels: [{ facet: "rooms", value: "kitchen", label: "Kitchen" }, { facet: "styles", value: "modern", label: "Modern" }],
      entry: { id: "atelier-north-architecture", name: "Atelier North", category: "Architecture", state: "California", description: "Modern homes.", tags: [] }
    }],
    facets: {
      rooms: [{ label: "Kitchen", count: 3 }],
      projectTypes: [{ label: "Renovation", count: 2 }],
      styles: [{ label: "Modern", count: 3 }],
      services: [{ label: "Consultation", count: 2 }]
    }
  };
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      requests.push({ url });
      if (url === "/api/categories") return { ok: true, json: async () => taxonomy };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => searchResponse };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 1 }) };
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await tick();
  await tick();
  const searchesBeforePreferences = requests.filter(({ url }) => String(url).startsWith("/api/search")).length;

  document.elements["#category-filter"].value = "Architecture";
  await document.elements["#category-filter"].dispatch("change");
  assert.match(document.elements["#business-type-filter"].innerHTML, /Residential Architect/);
  assert.doesNotMatch(document.elements["#business-type-filter"].innerHTML, /Kitchen Designer/);

  await document.elements['[data-facet-options="rooms"]'].dispatch("change", {
    target: { type: "checkbox", name: "rooms", value: "Kitchen", checked: true }
  });
  await document.elements['[data-facet-options="styles"]'].dispatch("change", {
    target: { type: "checkbox", name: "styles", value: "Modern", checked: true }
  });
  assert.equal(requests.filter(({ url }) => String(url).startsWith("/api/search")).length, searchesBeforePreferences + 1);
  assert.match(document.elements['[data-facet-options="rooms"]'].innerHTML, /Kitchen<\/span><strong>3/);
  assert.match(document.elements["#applied-filter-chips"].innerHTML, /Architecture/);

  await document.elements["#apply-filters"].dispatch("click");
  const searchRequest = requests.filter(({ url }) => String(url).startsWith("/api/search")).at(-1);
  assert.match(searchRequest.url, /rooms=Kitchen/);
  assert.match(searchRequest.url, /styles=Modern/);
  assert.match(document.elements["#applied-filter-chips"].innerHTML, /Kitchen/);
  assert.match(document.elements["#applied-filter-chips"].innerHTML, /Modern/);

  await document.elements["#clear-filters"].dispatch("click");
  const clearedSearchRequest = requests.filter(({ url }) => String(url).startsWith("/api/search")).at(-1);
  assert.doesNotMatch(clearedSearchRequest.url, /rooms=|styles=/);
  assert.equal(document.elements["#applied-filter-chips"].innerHTML, "");
});
