const WHISPER_PROFILES = Object.freeze({
  fast: Object.freeze({
    id: "fast",
    label: "Rápido",
    shortLabel: "Whisper Base",
    model: "onnx-community/whisper-base",
    dtype: "q8"
  }),
  accurate: Object.freeze({
    id: "accurate",
    label: "Alta precisión",
    shortLabel: "Whisper Small",
    model: "onnx-community/whisper-small",
    dtype: "q8"
  })
});

const DEFAULT_WHISPER_PROFILE = "fast";

function resolveWhisperProfile(profileId) {
  return WHISPER_PROFILES[profileId] || WHISPER_PROFILES[DEFAULT_WHISPER_PROFILE];
}

module.exports = {
  DEFAULT_WHISPER_PROFILE,
  WHISPER_PROFILES,
  resolveWhisperProfile
};
