require("dotenv").config({ quiet: true });
const { createAppServer } = require("./http");
const { createShutdownHandler } = require("./lifecycle");
const { formatStartupSearchStats } = require("./search/searchStats");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const server = createAppServer();

server.listen(port, host, async () => {
  console.log(`AI directory search app running at http://${host}:${port}`);
  try {
    const stats = await server.context.searchAdapter.stats();
    console.log(formatStartupSearchStats(stats));
  } catch (error) {
    console.error("Unable to load search index stats:", error);
  }
});

const shutdown = createShutdownHandler(server);

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
