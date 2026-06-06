const fs = require("fs");
const path = require("path");

const CLOSE_BEHAVIORS = new Set(["ask", "tray", "exit"]);

function preferencesPath(userDataPath) {
  return path.join(userDataPath, "app-preferences.json");
}

function readPreferences(userDataPath) {
  try {
    return JSON.parse(fs.readFileSync(preferencesPath(userDataPath), "utf8"));
  } catch {
    return {};
  }
}

function writePreferences(userDataPath, preferences) {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(preferencesPath(userDataPath), JSON.stringify(preferences, null, 2), "utf8");
}

function getCloseBehavior(userDataPath) {
  const behavior = readPreferences(userDataPath).closeBehavior;
  return CLOSE_BEHAVIORS.has(behavior) ? behavior : "ask";
}

function setCloseBehavior(userDataPath, behavior) {
  if (!CLOSE_BEHAVIORS.has(behavior)) throw new Error(`Unsupported close behavior: ${behavior}`);
  const preferences = readPreferences(userDataPath);
  preferences.closeBehavior = behavior;
  writePreferences(userDataPath, preferences);
  return behavior;
}

module.exports = { getCloseBehavior, setCloseBehavior };
