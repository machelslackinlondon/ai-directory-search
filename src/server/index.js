const { createAppServer } = require("./http");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const server = createAppServer();

server.listen(port, host, async () => {
  console.log(`AI directory search app running at http://${host}:${port}`);
  try {
    const stats = await server.context.searchAdapter.stats();
    console.log(`Loaded ${stats.entries} entries with ${stats.adapter} index.`);
  } catch (error) {
    console.error("Unable to load search index stats:", error);
  }
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
