const test = require("node:test");
const assert = require("assert/strict");
const renderers = require("../../public/renderers");
const { close, createTestServer, request } = require("../helpers");
const fs = require("fs");
const path = require("path");
const seed = require("../../src/data/seed-directory.json");
const { validateDirectoryPayload } = require("../../src/server/directory/schema");

test("result cards render safe relevance labels", () => {
  const html = renderers.renderResultList([{
    id: "atelier-north-architecture",
    entry: seed.entries.find(({ id }) => id === "atelier-north-architecture"),
    score: 12,
    matchLabels: [
      { facet: "rooms", value: "kitchen", label: "Kitchen" },
      { facet: "styles", value: "modern", label: "<Modern>" }
    ]
  }]);

  assert.match(html, /Kitchen/);
  assert.match(html, /&lt;Modern&gt;/);
  assert.doesNotMatch(html, /<Modern>/);
});

test("detail links render only absolute HTTP and HTTPS URLs", () => {
  const entry = seed.entries.find(({ id }) => id === "atelier-north-architecture");

  assert.match(renderers.renderDetail({ ...entry, url: "https://example.com/profile" }), /href="https:\/\/example\.com\/profile"/);
  assert.match(renderers.renderDetail({ ...entry, url: "http://example.com/profile" }), /href="http:\/\/example\.com\/profile"/);

  for (const url of ["javascript:alert(1)", "data:text/html,unsafe", "/relative/profile", "not a URL", ""]) {
    const html = renderers.renderDetail({ ...entry, url });
    assert.doesNotMatch(html, /class="record-link"/, url);
    assert.doesNotMatch(html, /javascript:|data:text\/html/, url);
  }
});

test("filter markup has canonical controls and accessible progressive disclosure", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");

  ["business-type-filter", "category-filter", "state-filter", "more-filters-toggle", "more-filters-panel", "apply-filters", "clear-filters"].forEach((id) => {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  });
  ["rooms", "projectTypes", "styles", "services"].forEach((facet) => {
    assert.match(html, new RegExp(`data-facet-options=["']${facet}["']`));
  });
  assert.match(html, /aria-expanded=["']false["']/);
  assert.match(html, /aria-controls=["']more-filters-panel["']/);
  assert.match(html, /<section id=["']more-filters-panel["'] hidden>/);
  assert.match(html, /<fieldset>/);
  assert.match(html, /<legend>Rooms<\/legend>/);
  assert.match(html, /id=["']result-count["'][^>]*aria-live=["']polite["']/);
});

test("collapsed More Filters stays hidden despite its grid layout", () => {
  const styles = fs.readFileSync(path.join(process.cwd(), "public", "styles.css"), "utf8");

  assert.match(styles, /#more-filters-panel\[hidden\]\s*{[^}]*display:\s*none/);
});

test("admin import placeholder is a valid design-professional payload", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  const placeholder = html.match(/id=["']import-content["'][^>]*placeholder='([^']+)'/)?.[1];

  assert.ok(placeholder);
  const result = validateDirectoryPayload(JSON.parse(placeholder));
  assert.equal(result.ok, true, result.errors.join(" "));
});

test("user search flow renders results, detail, and no-result state", async () => {
  const { server, port } = await createTestServer();
  try {
    const search = await request(port, "GET", "/api/search?query=traditional%20kitchen%20consultation");
    const resultHtml = renderers.renderResultList(search.body.results, search.body.results[0].id);
    assert.match(resultHtml, /Hearth Kitchen Studio/);
    assert.match(resultHtml, /why/i);

    const detail = await request(port, "GET", `/api/entries/${search.body.results[0].id}`);
    const detailHtml = renderers.renderDetail(detail.body);
    assert.match(detailHtml, /Record|Hearth Kitchen Studio/);
    assert.match(detailHtml, /hearth-kitchen-studio/);

    const empty = await request(port, "GET", "/api/search?query=zzzz-no-match");
    const emptyHtml = renderers.renderResultList(empty.body.results);
    assert.match(emptyHtml, /No matching entries found/);
  } finally {
    await close(server);
  }
});
