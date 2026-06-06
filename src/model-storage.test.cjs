const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  clearModelCache,
  directorySize,
  ensureModelCache,
  getModelCacheDir
} = require("./model-storage.cjs");

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nextstepai-model-test-"));
  const cacheDir = getModelCacheDir(root);
  assert.equal(cacheDir, path.join(root, "models"));
  assert.equal(await ensureModelCache(root, "fast"), cacheDir);
  await fs.writeFile(path.join(cacheDir, "test.bin"), Buffer.alloc(1024));
  assert.equal(await directorySize(cacheDir), 1024);
  assert.equal(await clearModelCache(root), cacheDir);
  assert.equal(await directorySize(cacheDir), 0);
  await fs.rm(root, { recursive: true, force: true });
  console.log("5 model storage cases passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
