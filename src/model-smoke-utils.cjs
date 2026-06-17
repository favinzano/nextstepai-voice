const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const MODEL_FILE_PATTERN = /\.onnx(?:_data(?:_\d+)?)?$/i;

async function createIsolatedModelCache(prefix = "nextstepai-model-smoke-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function findModelFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findModelFiles(entryPath));
    else if (entry.isFile() && MODEL_FILE_PATTERN.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function modelFileUrl(cacheDir, filePath) {
  const relativePath = path.relative(cacheDir, filePath).split(path.sep).map(encodeURIComponent);
  assert.ok(relativePath.length >= 3, `Ruta de modelo inesperada: ${filePath}`);
  const owner = relativePath.shift();
  const repository = relativePath.shift();
  return `https://huggingface.co/${owner}/${repository}/resolve/main/${relativePath.join("/")}`;
}

async function expectedRemoteSize(url) {
  const headers = {};
  const token = process.env.HF_TOKEN || process.env.HF_ACCESS_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
  assert.ok(response.ok, `No fue posible verificar el tamaño remoto (${response.status}): ${url}`);

  const sizeHeader = response.headers.get("x-linked-size") || response.headers.get("content-length");
  const expectedSize = Number(sizeHeader);
  assert.ok(Number.isSafeInteger(expectedSize) && expectedSize > 0, `Hugging Face no informó un tamaño válido: ${url}`);
  return expectedSize;
}

async function verifyModelDownloads(cacheDir, modelId) {
  const modelDir = path.join(cacheDir, ...modelId.split("/"));
  const modelFiles = await findModelFiles(modelDir);
  assert.ok(modelFiles.length > 0, `${modelId}: no se descargaron archivos ONNX.`);

  for (const filePath of modelFiles) {
    const actualSize = (await fs.stat(filePath)).size;
    const expectedSize = await expectedRemoteSize(modelFileUrl(cacheDir, filePath));
    assert.equal(actualSize, expectedSize, `${modelId}: descarga incompleta o corrupta: ${path.basename(filePath)}`);
    console.log(`${modelId}: integridad verificada para ${path.basename(filePath)} (${actualSize} bytes)`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MODEL_LOCK_ERROR_PATTERN = /system error number 13/i;
const MODEL_LOCK_MAX_ATTEMPTS = 5;
const MODEL_LOCK_RETRY_DELAY_MS = 3000;

// Windows antivirus/Defender can briefly lock freshly downloaded .onnx files,
// causing onnxruntime-node to fail with "system error number 13" even though
// the download itself succeeded. Retry the load in place before falling back
// to a full re-download attempt.
async function loadPipelineWithRetry(pipeline, task, model, options) {
  for (let attempt = 1; attempt <= MODEL_LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await pipeline(task, model, options);
    } catch (error) {
      if (attempt === MODEL_LOCK_MAX_ATTEMPTS || !MODEL_LOCK_ERROR_PATTERN.test(String(error?.message ?? error))) throw error;
      console.warn(`Carga del modelo bloqueada (system error number 13), reintento ${attempt}/${MODEL_LOCK_MAX_ATTEMPTS} en ${MODEL_LOCK_RETRY_DELAY_MS}ms`);
      await delay(MODEL_LOCK_RETRY_DELAY_MS);
    }
  }
}

module.exports = {
  createIsolatedModelCache,
  verifyModelDownloads,
  loadPipelineWithRetry
};
