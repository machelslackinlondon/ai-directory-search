const test = require("node:test");
const assert = require("assert/strict");
const renderers = require("../../public/renderers");
const { close, createTestServer, request } = require("../helpers");

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
