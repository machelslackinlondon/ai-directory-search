const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { answerDirectoryQuestion } = require("./agent/agent");
const { createDirectoryStore } = require("./directory/store");
const { createSearchAdapter } = require("./search/createSearchAdapter");
const { callMcpTool, listMcpTools } = require("./mcp/tools");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        error.code = "BAD_JSON";
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseFilters(searchParams) {
  const filters = {};
  if (searchParams.get("category")) filters.category = searchParams.get("category");
  if (searchParams.get("subcategory")) filters.subcategory = searchParams.get("subcategory");
  if (searchParams.get("location")) filters.location = searchParams.get("location");
  if (searchParams.get("tags")) filters.tags = searchParams.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean);

  const facets = {};
  searchParams.getAll("facet").forEach((item) => {
    const [key, value] = item.split(":");
    if (key && value) facets[key] = [...(facets[key] || []), value];
  });
  if (Object.keys(facets).length > 0) filters.facets = facets;
  return filters;
}

function requireAdminRequest(req, body = {}) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.headers["x-admin-token"] || body.adminToken;

  if (expected) {
    if (supplied !== expected) {
      const error = new Error("Admin token is required.");
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const error = new Error("Set ADMIN_TOKEN before using admin routes in production.");
    error.statusCode = 403;
    throw error;
  }
}

function createContext(options = {}) {
  const store = options.store || createDirectoryStore(options.storeOptions || {});
  const searchAdapter = options.searchAdapter || createSearchAdapter(store, options.searchOptions || {});
  return { store, searchAdapter };
}

function createAppServer(options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), "public");
  const context = createContext(options);

  async function routeApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/search") {
      const payload = await context.searchAdapter.search({
        query: url.searchParams.get("query") || "",
        filters: parseFilters(url.searchParams),
        sort: url.searchParams.get("sort") || "relevance",
        limit: Number(url.searchParams.get("limit")) || 20,
        offset: Number(url.searchParams.get("offset")) || 0,
        mode: url.searchParams.get("mode") || "keyword"
      });
      sendJson(res, 200, payload);
      return true;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/entries/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
      const entry = context.store.getEntry(id);
      if (!entry) sendJson(res, 404, { error: "Entry not found.", id });
      else sendJson(res, 200, entry);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      sendJson(res, 200, context.store.getTaxonomy());
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      sendJson(res, 200, await context.searchAdapter.stats());
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/mcp/tools") {
      sendJson(res, 200, { tools: listMcpTools() });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/agent") {
      const body = await readBody(req);
      const response = await answerDirectoryQuestion(body.question || body.query || "", context, {
        filters: body.filters || {},
        sort: body.sort || "relevance",
        limit: body.limit || 5
      });
      sendJson(res, 200, response);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/import") {
      const body = await readBody(req);
      requireAdminRequest(req, body);
      const result = context.store.importEntries(body.content || body.entries || body, {
        format: body.format || "json",
        mode: body.mode || "upsert"
      });
      const stats = await context.searchAdapter.reindex();
      sendJson(res, 200, { ...result, stats });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/reindex") {
      const body = await readBody(req);
      requireAdminRequest(req, body);
      sendJson(res, 200, await context.searchAdapter.reindex());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/mcp") {
      const body = await readBody(req);
      const result = await callMcpTool(body.tool || body.name, body.args || {}, context);
      sendJson(res, 200, { tool: body.tool || body.name, result });
      return true;
    }

    return false;
  }

  function serveStatic(req, res, url) {
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const normalizedPath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDir, normalizedPath);
    if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    const extension = path.extname(filePath);
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": body.length
    });
    res.end(body);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const handled = await routeApi(req, res, url);
        if (!handled) sendJson(res, 404, { error: "API route not found." });
        return;
      }
      if (req.method !== "GET") {
        sendText(res, 405, "Method not allowed.");
        return;
      }
      serveStatic(req, res, url);
    } catch (error) {
      const statusCode = error.statusCode || (error.code === "VALIDATION_ERROR" ? 400 : 500);
      sendJson(res, statusCode, {
        error: error.message || "Internal server error.",
        code: error.code || "SERVER_ERROR"
      });
    }
  });

  const nativeClose = server.close.bind(server);
  let adapterClosePromise;

  function closeAdapterOnce() {
    if (!adapterClosePromise) {
      adapterClosePromise = Promise.resolve().then(async () => {
        if (typeof context.searchAdapter.close === "function") await context.searchAdapter.close();
      });
    }
    return adapterClosePromise;
  }

  server.close = function close(callback) {
    const complete = (serverError) => {
      closeAdapterOnce().then(
        () => callback?.(serverError),
        (adapterError) => {
          server.shutdownError = adapterError;
          callback?.(serverError || adapterError);
        }
      );
    };
    try {
      return nativeClose(complete);
    } catch (error) {
      complete(error);
      return server;
    }
  };
  server.context = context;
  return server;
}

module.exports = {
  createAppServer,
  createContext,
  parseFilters,
  readBody,
  requireAdminRequest,
  sendJson
};
