const { createAppServer } = require("./http");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const server = createAppServer();

server.listen(port, host, () => {
  const stats = server.context.searchAdapter.stats();
  console.log(`AI directory search app running at http://${host}:${port}`);
  console.log(`Loaded ${stats.entries} entries with ${stats.adapter} index.`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
