const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCloseBehavior, setCloseBehavior } = require("./app-preferences.cjs");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nextstepai-preferences-"));

assert.equal(getCloseBehavior(directory), "ask");
assert.equal(setCloseBehavior(directory, "tray"), "tray");
assert.equal(getCloseBehavior(directory), "tray");
assert.equal(setCloseBehavior(directory, "exit"), "exit");
assert.equal(getCloseBehavior(directory), "exit");
assert.throws(() => setCloseBehavior(directory, "invalid"));

fs.rmSync(directory, { recursive: true, force: true });
console.log("App preferences: 5 checks passed.");
