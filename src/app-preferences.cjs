const fs = require("fs");
const path = require("path");

const CLOSE_BEHAVIORS = new Set(["ask", "tray", "exit"]);
const SHORTCUT_MODES = new Set(["toggle", "hold"]);
const DEFAULT_SHORTCUTS = Object.freeze({
  record: "CommandOrControl+Shift+Space",
  reprocess: "CommandOrControl+Alt+Space"
});

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
  return CLOSE_BEHAVIORS.has(behavior) ? behavior : "tray";
}

function setCloseBehavior(userDataPath, behavior) {
  if (!CLOSE_BEHAVIORS.has(behavior)) throw new Error(`Unsupported close behavior: ${behavior}`);
  const preferences = readPreferences(userDataPath);
  preferences.closeBehavior = behavior;
  writePreferences(userDataPath, preferences);
  return behavior;
}

function hasAutoStartPreference(userDataPath) {
  return typeof readPreferences(userDataPath).autoStartEnabled === "boolean";
}

function getAutoStartEnabled(userDataPath) {
  const enabled = readPreferences(userDataPath).autoStartEnabled;
  return typeof enabled === "boolean" ? enabled : true;
}

function setAutoStartEnabled(userDataPath, enabled) {
  if (typeof enabled !== "boolean") throw new Error("Auto-start preference must be a boolean.");
  const preferences = readPreferences(userDataPath);
  preferences.autoStartEnabled = enabled;
  writePreferences(userDataPath, preferences);
  return enabled;
}

function getShortcuts(userDataPath) {
  const shortcuts = readPreferences(userDataPath).shortcuts;
  return {
    record: typeof shortcuts?.record === "string" ? shortcuts.record : DEFAULT_SHORTCUTS.record,
    reprocess: typeof shortcuts?.reprocess === "string" ? shortcuts.reprocess : DEFAULT_SHORTCUTS.reprocess
  };
}

function setShortcuts(userDataPath, shortcuts) {
  if (!shortcuts || typeof shortcuts.record !== "string" || typeof shortcuts.reprocess !== "string") {
    throw new Error("Both shortcut accelerators are required.");
  }
  if (shortcuts.record === shortcuts.reprocess) throw new Error("Shortcuts must be different.");
  const preferences = readPreferences(userDataPath);
  preferences.shortcuts = { record: shortcuts.record, reprocess: shortcuts.reprocess };
  writePreferences(userDataPath, preferences);
  return preferences.shortcuts;
}

function getShortcutMode(userDataPath) {
  const mode = readPreferences(userDataPath).shortcutMode;
  return SHORTCUT_MODES.has(mode) ? mode : "toggle";
}

function setShortcutMode(userDataPath, mode) {
  if (!SHORTCUT_MODES.has(mode)) throw new Error(`Unsupported shortcut mode: ${mode}`);
  const preferences = readPreferences(userDataPath);
  preferences.shortcutMode = mode;
  writePreferences(userDataPath, preferences);
  return mode;
}

module.exports = {
  DEFAULT_SHORTCUTS,
  getAutoStartEnabled,
  getCloseBehavior,
  getShortcutMode,
  getShortcuts,
  hasAutoStartPreference,
  setAutoStartEnabled,
  setCloseBehavior,
  setShortcutMode,
  setShortcuts
};
