const assert = require("node:assert/strict");
const path = require("node:path");
const { cleanTranscription } = require("./text-cleanup.cjs");
const { WHISPER_PROFILES } = require("./whisper-profiles.cjs");

async function run() {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.join(__dirname, "..", "node_modules", "@huggingface", "transformers", ".cache");
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  for (const profile of Object.values(WHISPER_PROFILES)) {
    const transcriber = await pipeline("automatic-speech-recognition", profile.model, {
      device: "cpu",
      dtype: profile.dtype
    });
    const output = await transcriber(new Float32Array(32000), {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5
    });
    assert.equal(cleanTranscription(output.text), "", `${profile.shortLabel}: ${output.text}`);
    if (typeof transcriber.dispose === "function") await transcriber.dispose();
    console.log(`${profile.shortLabel} loaded and passed the non-speech smoke test`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
