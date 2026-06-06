const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const packageJson = require(path.join(root, "package.json"));
const installerName = `NextStepAI-Voice-Setup-${packageJson.version}-x64.exe`;
const installerPath = path.join(releaseDir, installerName);
const unpackedExe = path.join(releaseDir, "win-unpacked", "NextStepAI Voice.exe");

assert.ok(fs.existsSync(installerPath), `Falta el instalador: ${installerName}`);
assert.ok(fs.statSync(installerPath).size > 10 * 1024 * 1024, "El instalador parece incompleto.");
assert.ok(fs.existsSync(unpackedExe), "Falta el ejecutable desempaquetado.");

const hash = crypto.createHash("sha256").update(fs.readFileSync(installerPath)).digest("hex");
fs.writeFileSync(`${installerPath}.sha256`, `${hash}  ${installerName}\n`);
console.log(`Release verified: ${installerName}`);
console.log(`SHA-256: ${hash}`);
