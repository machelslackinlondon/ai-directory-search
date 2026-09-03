const test = require("node:test");
const assert = require("assert/strict");

let createShutdownHandler;
try {
  ({ createShutdownHandler } = require("../../src/server/lifecycle"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

test("duplicate shutdown signals close the server only once", () => {
  assert.equal(typeof createShutdownHandler, "function");

  let closeCalls = 0;
  let completeClose;
  const server = {
    close(callback) {
      closeCalls += 1;
      completeClose = callback;
    }
  };
  const shutdown = createShutdownHandler(server);

  shutdown("SIGINT");
  shutdown("SIGTERM");
  completeClose();
  shutdown("SIGINT");

  assert.equal(closeCalls, 1);
});

test("the first shutdown close error is reported and sets a failing exit code", () => {
  assert.equal(typeof createShutdownHandler, "function");

  const processRef = {};
  const messages = [];
  const closeError = Object.assign(new Error("adapter cleanup failed"), {
    code: "SEARCH_ADAPTER_CLOSE_FAILED",
    failureCount: 2
  });
  const server = {
    close(callback) {
      callback(closeError);
    }
  };
  const shutdown = createShutdownHandler(server, {
    processRef,
    logger: { error(message) { messages.push(message); } }
  });

  shutdown("SIGTERM");

  assert.equal(processRef.exitCode, 1);
  assert.deepEqual(messages, [
    "Graceful shutdown failed after SIGTERM: SEARCH_ADAPTER_CLOSE_FAILED (2 adapter failures)"
  ]);
});
