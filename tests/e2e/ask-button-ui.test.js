const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("assert/strict");
const vm = require("vm");
const renderers = require("../../public/renderers");
const { US_STATES } = require("../../src/server/directory/designTaxonomy");
const { close, createTestServer, request } = require("../helpers");

class FakeElement {
  constructor(selector) {
    this.selector = selector;
    this.value = "";
    this._innerHTML = "";
    this.textContent = "";
    this.disabled = false;
    this.dataset = {};
    this.files = [];
    this.listeners = {};
    this.classList = {
      toggle: () => {}
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (!this.selector.endsWith("-filter") && !["#sort-control", "#mode-control"].includes(this.selector)) return;
    const optionValues = [...String(value).matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
    if (optionValues.length > 0 && !optionValues.includes(this.value)) this.value = "";
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

async function settle() {
  await tick();
  await tick();
  await tick();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

test("state selection and chip survive a zero-result facet response", async () => {
  const document = createFakeDocument();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const searchResponses = [
    { results: [], facets: { state: [{ label: "California", count: 1 }] } },
    { results: [], facets: { state: [] } }
  ];
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {}, states: ["California"] }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => searchResponses.shift() };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 0 }) };
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();
  document.elements["#state-filter"].value = "California";
  await document.elements["#state-filter"].dispatch("change");
  await settle();

  assert.equal(document.elements["#state-filter"].value, "California");
  assert.match(document.elements["#state-filter"].innerHTML, /California/);
  assert.match(document.elements["#applied-filter-chips"].innerHTML, /California/);
});

test("result count announces the backend total instead of the current page length", async () => {
  const document = createFakeDocument();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {} }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 6 }) };
      if (String(url).startsWith("/api/search")) {
        return {
          ok: true,
          json: async () => ({
            total: 6,
            results: [{
              id: "atelier-north-architecture",
              entry: { id: "atelier-north-architecture", name: "Atelier North", category: "Architecture", description: "Modern homes.", tags: [] }
            }],
            facets: {}
          })
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();

  assert.equal(document.elements["#result-count"].textContent, "6 entries");
});

test("only the latest search response controls results, errors, and loading state", async () => {
  const document = createFakeDocument();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const older = deferred();
  const newer = deferred();
  let searchCalls = 0;
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {} }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 0 }) };
      if (String(url).startsWith("/api/search")) {
        searchCalls += 1;
        if (searchCalls === 1) return { ok: true, json: async () => ({ results: [], facets: {} }) };
        return searchCalls === 2 ? older.promise : newer.promise;
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();
  document.elements["#search-input"].value = "older search";
  await document.elements["#search-button"].dispatch("click");
  document.elements["#search-input"].value = "newer search";
  await document.elements["#search-button"].dispatch("click");
  assert.match(document.elements["#results"].innerHTML, /Searching directory/);

  newer.resolve({
    ok: true,
    json: async () => ({
      results: [{ id: "newer", entry: { id: "newer", name: "Newer result", category: "Architecture", description: "Newest response.", tags: [] } }],
      facets: { styles: [{ label: "Modern", count: 1 }] }
    })
  });
  await settle();
  assert.match(document.elements["#results"].innerHTML, /Newer result/);
  assert.doesNotMatch(document.elements["#results"].innerHTML, /Searching directory|older failure/);

  older.reject(new Error("older failure"));
  await settle();
  assert.match(document.elements["#results"].innerHTML, /Newer result/);
  assert.doesNotMatch(document.elements["#results"].innerHTML, /Searching directory|older failure/);
  assert.equal(document.elements["#result-count"].textContent, "1 entry");
});

test("the real taxonomy API initially populates every canonical state in the UI", async () => {
  const { server, port } = await createTestServer();
  let taxonomy;
  try {
    const response = await request(port, "GET", "/api/categories");
    assert.equal(response.statusCode, 200);
    taxonomy = response.body;
  } finally {
    await close(server);
  }

  const document = createFakeDocument();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => taxonomy };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 6 }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => ({ results: [], facets: {} }) };
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();

  const options = [...document.elements["#state-filter"].innerHTML.matchAll(/<option value="([^"]*)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(options, ["", ...US_STATES]);
});

test("only the latest detail request may update the selected result", async () => {
  const document = createFakeDocument();
  const older = deferred();
  const newer = deferred();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {}, states: [] }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 0 }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => ({ results: [], facets: {} }) };
      if (url === "/api/entries/older") return older.promise;
      if (url === "/api/entries/newer") return newer.promise;
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();

  const olderRequest = context.openDetail("older");
  const newerRequest = context.openDetail("newer");
  newer.resolve({
    ok: true,
    json: async () => ({
      id: "newer",
      name: "Newer Detail",
      category: "Architecture",
      description: "The selected detail.",
      updatedAt: "2026-01-01T00:00:00.000Z"
    })
  });
  await newerRequest;
  assert.match(document.elements["#detail"].innerHTML, /Newer Detail/);

  older.resolve({
    ok: true,
    json: async () => ({
      id: "older",
      name: "Older Detail",
      category: "Architecture",
      description: "A stale detail.",
      updatedAt: "2026-01-01T00:00:00.000Z"
    })
  });
  await olderRequest;

  assert.match(document.elements["#detail"].innerHTML, /Newer Detail/);
  assert.doesNotMatch(document.elements["#detail"].innerHTML, /Older Detail/);
});

test("Enter cannot submit a duplicate agent request while Ask is busy", async () => {
  const document = createFakeDocument();
  const agentResponse = deferred();
  let agentCalls = 0;
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {}, states: [] }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 0 }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => ({ results: [], facets: {} }) };
      if (url === "/api/agent") {
        agentCalls += 1;
        return agentResponse.promise;
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();
  document.elements["#agent-input"].value = "Who handles modern architecture?";

  const firstSubmit = document.elements["#agent-button"].dispatch("click");
  await tick();
  await document.elements["#agent-input"].dispatch("keydown", { key: "Enter" });
  await tick();

  assert.equal(agentCalls, 1);
  agentResponse.resolve({
    ok: true,
    json: async () => ({ answer: "Atelier North Architecture", references: [{ id: "atelier-north-architecture" }] })
  });
  await firstSubmit;
});

test("healthy and degraded OpenSearch reindex UI use indexed counts and stable status", async () => {
  const document = createFakeDocument();
  let reindexCalls = 0;
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {}, states: [] }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 6, backend: "opensearch" }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => ({ results: [], facets: {} }) };
      if (url === "/api/admin/reindex") {
        reindexCalls += 1;
        return {
          ok: true,
          json: async () => reindexCalls === 1
            ? { indexed: 6, backend: "opensearch", fallback: false }
            : { entries: 6, backend: "memory", fallback: true, fallbackReason: "OPENSEARCH_COOLDOWN" }
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();
  await document.elements["#reindex-button"].dispatch("click");

  assert.match(document.elements["#admin-status"].innerHTML, /Indexed 6 entries/);
  assert.match(document.elements["#admin-status"].innerHTML, /state success/);
  assert.doesNotMatch(document.elements["#admin-status"].innerHTML, /degraded/i);

  await document.elements["#reindex-button"].dispatch("click");
  assert.match(document.elements["#admin-status"].innerHTML, /Indexed 6 entries/);
  assert.match(document.elements["#admin-status"].innerHTML, /degraded.*OPENSEARCH_COOLDOWN/i);
  assert.match(document.elements["#admin-status"].innerHTML, /state warn/);
});

test("degraded OpenSearch import UI warns with the stable fallback reason", async () => {
  const document = createFakeDocument();
  const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
  const context = {
    console: { info: () => {} },
    document,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    window: { DirectoryRenderers: renderers },
    fetch: async (url) => {
      if (url === "/api/categories") return { ok: true, json: async () => ({ categories: [], facets: {}, states: [] }) };
      if (url === "/api/stats") return { ok: true, json: async () => ({ entries: 7, backend: "memory", fallback: true }) };
      if (String(url).startsWith("/api/search")) return { ok: true, json: async () => ({ results: [], facets: {} }) };
      if (url === "/api/admin/import") {
        return {
          ok: true,
          json: async () => ({
            count: 1,
            entries: ["degraded-import"],
            stats: {
              indexed: 7,
              backend: "memory",
              fallback: true,
              fallbackReason: "ECONNREFUSED"
            }
          })
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  };

  vm.runInNewContext(appJs, context, { filename: "public/app.js" });
  await settle();
  document.elements["#import-content"].value = JSON.stringify({ entries: [] });
  await document.elements["#import-button"].dispatch("click");

  assert.match(document.elements["#admin-status"].innerHTML, /Imported 1 entry/);
  assert.match(document.elements["#admin-status"].innerHTML, /Indexed 7 entries/);
  assert.match(document.elements["#admin-status"].innerHTML, /degraded.*ECONNREFUSED/i);
  assert.match(document.elements["#admin-status"].innerHTML, /state warn/);
});
