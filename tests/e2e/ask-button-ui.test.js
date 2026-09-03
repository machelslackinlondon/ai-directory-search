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
    "#category-filter",
    "#tag-filter",
    "#location-filter",
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

  const tabs = [new FakeElement(".tab"), new FakeElement(".tab")];
  tabs[0].dataset.view = "search";
  tabs[1].dataset.view = "admin";

  return {
    elements,
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: (selector) => {
      if (selector === ".tab") return tabs;
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
