const assert = require("node:assert/strict");
const {
  DEFAULT_WHISPER_PROFILE,
  WHISPER_PROFILES,
  resolveWhisperProfile
} = require("./whisper-profiles.cjs");

assert.equal(DEFAULT_WHISPER_PROFILE, "fast");
assert.equal(resolveWhisperProfile("fast").model, "onnx-community/whisper-base");
assert.equal(resolveWhisperProfile("accurate").model, "onnx-community/whisper-small");
assert.equal(resolveWhisperProfile("invalid"), WHISPER_PROFILES.fast);
assert.equal(resolveWhisperProfile(undefined), WHISPER_PROFILES.fast);
assert.equal(resolveWhisperProfile("fast").dtype, "q8");
assert.equal(resolveWhisperProfile("accurate").dtype, "q8");

console.log("7 Whisper profile cases passed");
