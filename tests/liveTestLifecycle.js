function registerLiveChecks(test, options) {
  const { name, enabled, setup, close, checks } = options;
  if (!enabled) {
    for (const [checkName, check] of checks) test.skip(checkName, check);
    return;
  }

  test(name, async (context) => {
    try {
      await setup();
      for (const [checkName, check] of checks) {
        await context.test(checkName, check);
      }
    } finally {
      await close();
    }
  });
}

module.exports = { registerLiveChecks };
