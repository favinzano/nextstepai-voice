const assert = require("node:assert/strict");
const { createVoiceActivityDetector } = require("./voice-activity.cjs");

const initialSilence = createVoiceActivityDetector({ silenceTimeoutMs: 1000 });
assert.equal(initialSilence.update(0, 0), false);
assert.equal(initialSilence.update(0, 5000), false);

const pause = createVoiceActivityDetector({ silenceTimeoutMs: 1000 });
assert.equal(pause.update(0.02, 0), false);
assert.equal(pause.update(0.001, 100), false);
assert.equal(pause.update(0.001, 1099), false);
assert.equal(pause.update(0.001, 1100), true);
assert.equal(pause.update(0.02, 1200), false);

const resumedSpeech = createVoiceActivityDetector({ silenceTimeoutMs: 1000 });
resumedSpeech.update(0.02, 0);
resumedSpeech.update(0.001, 100);
assert.equal(resumedSpeech.update(0.02, 900), false);
assert.equal(resumedSpeech.update(0.001, 1000), false);
assert.equal(resumedSpeech.update(0.001, 2000), true);

const noisyRoom = createVoiceActivityDetector({ silenceTimeoutMs: 500 });
for (let index = 0; index < 20; index += 1) assert.equal(noisyRoom.update(0.006, index * 100), false);
assert.equal(noisyRoom.update(0.03, 2100), false);
assert.equal(noisyRoom.update(0.003, 2200), false);
assert.equal(noisyRoom.update(0.003, 2700), true);

const noiseBlip = createVoiceActivityDetector({ silenceTimeoutMs: 1000 });
noiseBlip.update(0.02, 0);
assert.equal(noiseBlip.update(0.001, 100), false);
assert.equal(noiseBlip.update(0.005, 600), false);
assert.equal(noiseBlip.update(0.001, 700), false);
assert.equal(noiseBlip.update(0.001, 1099), false);
assert.equal(noiseBlip.update(0.001, 1700), true);

console.log("Voice activity: 41 checks passed.");
