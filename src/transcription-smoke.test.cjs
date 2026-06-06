const assert = require("node:assert/strict");
const path = require("node:path");
const { cleanTranscription } = require("./text-cleanup.cjs");

async function run() {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.join(__dirname, "..", "node_modules", "@huggingface", "transformers", ".cache");
  env.allowLocalModels = true;
  env.allowRemoteModels = false;

  const transcriber = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
    device: "cpu",
    dtype: "q8"
  });

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

  console.log(`${nonSpeechCases.length} real Whisper non-speech cases passed`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
