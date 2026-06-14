'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const UPX_FLAGS = '--best';

function warn(message) {
  console.warn(`[compress-natives] ${message}`);
}

function resolveOnnxRuntimeDllDirectory() {
  try {
    const packageJson = require.resolve('onnxruntime-node/package.json');
    return path.join(path.dirname(packageJson), 'bin', 'napi-v3', 'win32', 'x64');
  } catch {
    return path.resolve(
      __dirname,
      '..',
      'node_modules',
      'onnxruntime-node',
      'bin',
      'napi-v3',
      'win32',
      'x64',
    );
  }
}

function runUpx(command, cwd) {
  return execSync(`upx ${command}`, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

if (process.platform !== 'win32') {
  warn('Se omite UPX porque este paso solo procesa DLL de Windows x64.');
  process.exit(0);
}

try {
  runUpx('--version', process.cwd());
} catch {
  warn('UPX no esta instalado o no esta disponible en PATH; el empaquetado continuara sin comprimir DLL.');
  process.exit(0);
}

const dllDirectory = resolveOnnxRuntimeDllDirectory();
if (!fs.existsSync(dllDirectory)) {
  warn(`No se encontro el directorio de DLL de onnxruntime-node: ${dllDirectory}`);
  process.exit(0);
}

const dllNames = fs
  .readdirSync(dllDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^[A-Za-z0-9_.-]+\.dll$/i.test(entry.name))
  .map((entry) => entry.name);

if (dllNames.length === 0) {
  warn(`No se encontraron DLL para comprimir en: ${dllDirectory}`);
  process.exit(0);
}

const backupDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nextstepai-upx-'));

try {
  for (const dllName of dllNames) {
    const dllPath = path.join(dllDirectory, dllName);
    const backupPath = path.join(backupDirectory, dllName);
    const originalBytes = fs.statSync(dllPath).size;

    fs.copyFileSync(dllPath, backupPath);

    try {
      // dllName is restricted above to prevent shell metacharacters in execSync.
      runUpx(`${UPX_FLAGS} -- "${dllName}"`, dllDirectory);
      runUpx(`-t -- "${dllName}"`, dllDirectory);

      const compressedBytes = fs.statSync(dllPath).size;
      const savedPercent = ((1 - compressedBytes / originalBytes) * 100).toFixed(1);
      console.log(
        `[compress-natives] ${dllName}: ${originalBytes} -> ${compressedBytes} bytes (${savedPercent}% menos)`,
      );
    } catch (error) {
      fs.copyFileSync(backupPath, dllPath);
      const detail = error.stderr?.trim() || error.message;
      warn(`UPX no pudo comprimir/verificar ${dllName}; se restauro el original. ${detail}`);
    }
  }
} finally {
  fs.rmSync(backupDirectory, { recursive: true, force: true });
}
