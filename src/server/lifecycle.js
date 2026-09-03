function createShutdownHandler(server, options = {}) {
  const processRef = options.processRef || process;
  const logger = options.logger || console;
  let shutdownStarted = false;

  return function shutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;

    server.close((error) => {
      if (!error) return;
      processRef.exitCode = 1;
      const failureCount = Number.isInteger(error.failureCount) ? ` (${error.failureCount} adapter failure${error.failureCount === 1 ? "" : "s"})` : "";
      logger.error(`Graceful shutdown failed after ${signal}: ${error.code || "SERVER_CLOSE_FAILED"}${failureCount}`);
    });
  };
}

module.exports = { createShutdownHandler };
