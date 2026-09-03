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

function shutdown(signal) {
  server.close((error) => {
    if (!error) return;
    process.exitCode = 1;
    const failureCount = Number.isInteger(error.failureCount) ? ` (${error.failureCount} adapter failure${error.failureCount === 1 ? "" : "s"})` : "";
    console.error(`Graceful shutdown failed after ${signal}: ${error.code || "SERVER_CLOSE_FAILED"}${failureCount}`);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
