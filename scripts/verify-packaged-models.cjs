const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const executable = path.join(root, "release", "win-unpacked", "NextStepAI Voice.exe");
const userData = path.join(root, ".tmp", "packaged-model-self-test");

assert.ok(fs.existsSync(executable), "Construye el release antes de probar los modelos empaquetados.");
fs.rmSync(userData, { recursive: true, force: true });

for (const profile of ["fast", "accurate"]) {
  const result = spawnSync(executable, [
    `--self-test-model=${profile}`,
    `--user-data-dir=${userData}`
  ], {
    encoding: "utf8",
    timeout: 20 * 60 * 1000,
    windowsHide: true
  });
  assert.equal(result.status, 0, `${profile}: ${result.stderr || result.error || "falló"}`);
  console.log(`Packaged ${profile} model self-test passed`);
}

const modelDir = path.join(userData, "models");
assert.ok(fs.existsSync(modelDir), "Los modelos empaquetados no utilizaron la caché de usuario esperada.");
console.log("Packaged model cache location verified.");
