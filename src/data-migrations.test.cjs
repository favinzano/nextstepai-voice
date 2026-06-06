const assert = require("assert");
const { initializeProductionProfile, PRODUCTION_PROFILE_MARKER } = require("./data-migrations.cjs");

function createStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    has: (key) => data.has(key)
  };
}

const development = createStorage({ "voice-history": "test" });
assert.equal(initializeProductionProfile(development, false), false);
assert.equal(development.has("voice-history"), true);

const firstProductionRun = createStorage({ "voice-history": "prerelease", "voice-settings": "keep" });
assert.equal(initializeProductionProfile(firstProductionRun, true), true);
assert.equal(firstProductionRun.has("voice-history"), false);
assert.equal(firstProductionRun.has("voice-settings"), true);
assert.equal(firstProductionRun.getItem(PRODUCTION_PROFILE_MARKER), "initialized");

firstProductionRun.setItem("voice-history", "real");
assert.equal(initializeProductionProfile(firstProductionRun, true), false);
assert.equal(firstProductionRun.getItem("voice-history"), "real");

console.log("Data migrations: 7 checks passed.");
