const fs = require("node:fs/promises");
const path = require("node:path");

const REQUIRED_FREE_BYTES = Object.freeze({
  fast: 300 * 1024 * 1024,
  accurate: 750 * 1024 * 1024
});

function getModelCacheDir(userDataDir) {
  return path.join(userDataDir, "models");
}

async function ensureModelCache(userDataDir, profileId) {
  const cacheDir = getModelCacheDir(userDataDir);
  await fs.mkdir(cacheDir, { recursive: true });

  if (typeof fs.statfs === "function") {
    const stats = await fs.statfs(cacheDir);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const required = REQUIRED_FREE_BYTES[profileId] || REQUIRED_FREE_BYTES.fast;
    if (available < required) {
      const requiredMb = Math.ceil(required / 1024 / 1024);
      throw new Error(`Espacio insuficiente. Libera al menos ${requiredMb} MB para preparar el modelo.`);
    }
  }

  return cacheDir;
}

async function clearModelCache(userDataDir) {
  const cacheDir = getModelCacheDir(userDataDir);
  await fs.rm(cacheDir, { recursive: true, force: true });
  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

async function directorySize(directory) {
  let total = 0;
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) total += await directorySize(entryPath);
      else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return total;
}

module.exports = {
  REQUIRED_FREE_BYTES,
  clearModelCache,
  directorySize,
  ensureModelCache,
  getModelCacheDir
};
