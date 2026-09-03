const http = require("http");
const seed = require("../src/data/seed-directory.json");
const { createMemoryDirectoryStore } = require("../src/server/directory/store");
const { createAppServer, createContext } = require("../src/server/http");

function createTestContext(options = {}) {
  const store = createMemoryDirectoryStore(options.data || seed);
  return createContext({
    store,
    searchOptions: {
      backend: "memory",
      memoryOptions: options.searchOptions || {}
    }
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const contentType = res.headers["content-type"] || "";
        const parsed = contentType.includes("application/json") && data ? JSON.parse(data) : data;
        resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createTestServer(options = {}) {
  const context = createTestContext(options);
  const server = createAppServer(context);
  const port = await listen(server);
  return { ...context, server, port };
}

module.exports = {
  close,
  createTestContext,
  createTestServer,
  request,
  seed
};
