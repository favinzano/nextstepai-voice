const PRODUCTION_PROFILE_MARKER = "voice-production-profile-v1";

function initializeProductionProfile(storage, isPackaged) {
  if (!isPackaged || storage.getItem(PRODUCTION_PROFILE_MARKER)) return false;
  storage.removeItem("voice-history");
  storage.setItem(PRODUCTION_PROFILE_MARKER, "initialized");
  return true;
}

module.exports = { initializeProductionProfile, PRODUCTION_PROFILE_MARKER };
