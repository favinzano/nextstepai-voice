const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { cleanTranscription } = require("./text-cleanup.cjs");
const { createIsolatedModelCache, verifyModelDownloads, loadPipelineWithRetry } = require("./model-smoke-utils.cjs");
const { resolveWhisperProfile } = require("./whisper-profiles.cjs");

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15000;
// CI runners occasionally hit transient Hugging Face / filesystem errors while
// downloading the model (rate limiting, connect timeouts, antivirus file locks).
const TRANSIENT_ERROR_PATTERN = /\b429\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT|fetch failed|terminated|system error number 13/i;

function isTransientError(error) {
  if (TRANSIENT_ERROR_PATTERN.test(String(error?.message ?? error))) return true;
  if (error?.cause) return isTransientError(error.cause);
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptSmokeTest() {
  const cacheDir = await createIsolatedModelCache("nextstepai-transcription-smoke-");
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  const profile = resolveWhisperProfile("fast");
  let transcriber;
  try {
    transcriber = await loadPipelineWithRetry(pipeline, "automatic-speech-recognition", profile.model, {
      device: "cpu",
      dtype: "fp32"
    });
    await verifyModelDownloads(cacheDir, profile.model);

    let seed = 123456789;
    const random = () => {
      seed = (1103515245 * seed + 12345) % 2147483648;
      return (seed / 2147483648) * 2 - 1;
    };

    const nonSpeechCases = [
      ["silence", new Float32Array(48000)],
      ["tone", Float32Array.from({ length: 48000 }, (_, index) => Math.sin(2 * Math.PI * 440 * index / 16000) * 0.03)],
      ["noise", Float32Array.from({ length: 48000 }, () => random() * 0.015)]
    ];

    for (const [name, samples] of nonSpeechCases) {
      const output = await transcriber(samples, {
        language: "spanish",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5
      });
      assert.equal(cleanTranscription(output.text), "", `${name}: ${output.text}`);
    }

    console.log(`${nonSpeechCases.length} real Whisper CPU/fp32 non-speech cases passed`);
  } finally {
    if (typeof transcriber?.dispose === "function") await transcriber.dispose();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
}

async function run() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await attemptSmokeTest();
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS || !isTransientError(error)) throw error;
      console.warn(`Intento ${attempt} fallo por un error transitorio, reintentando en ${RETRY_DELAY_MS * attempt}ms: ${error.message}`);
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
