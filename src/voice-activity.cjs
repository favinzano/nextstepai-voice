function createVoiceActivityDetector(options = {}) {
  const minimumSpeechThreshold = options.speechThreshold ?? 0.008;
  const minimumSilenceThreshold = options.silenceThreshold ?? 0.004;
  const silenceTimeoutMs = options.silenceTimeoutMs ?? 1800;
  let noiseFloor = options.initialNoiseFloor ?? 0.001;
  let speechDetected = false;
  let silenceStartedAt;
  let stopped = false;

  return {
    update(rms, now = Date.now()) {
      if (stopped) return false;
      const speechThreshold = Math.max(minimumSpeechThreshold, noiseFloor * 3);
      const silenceThreshold = Math.max(minimumSilenceThreshold, noiseFloor * 1.8);
      if (rms >= speechThreshold) {
        speechDetected = true;
        silenceStartedAt = undefined;
        return false;
      }
      if (!speechDetected) noiseFloor = noiseFloor * 0.9 + rms * 0.1;
      if (!speechDetected || rms > silenceThreshold) {
        silenceStartedAt = undefined;
        return false;
      }
      silenceStartedAt ??= now;
      if (now - silenceStartedAt < silenceTimeoutMs) return false;
      stopped = true;
      return true;
    }
  };
}

module.exports = { createVoiceActivityDetector };
