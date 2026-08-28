import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const extensionRoot = resolve("apps/extension");
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "src/content-metadata.js",
  "src/content-pii.js",
  "src/ocr-service.js",
  "src/popup.js",
  "src/popup.css"
];

const missing = [];
for (const file of requiredFiles) {
  try {
    await access(resolve(extensionRoot, file));
  } catch {
    missing.push(file);
  }
}

if (missing.length) {
  console.error(`Missing extension files:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(resolve(extensionRoot, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3 || manifest.action?.default_popup !== "popup.html") {
  console.error("Extension manifest must be Manifest V3 and define the popup.");
  process.exit(1);
}

const forbiddenPermissions = ["cookies", "webRequest", "declarativeNetRequest"];
if (manifest.permissions?.some((p) => forbiddenPermissions.includes(p))) {
  console.error("Extension manifest contains forbidden permissions.");
  process.exit(1);
}

console.log("Extension structure verified: Manifest V3 popup, local metadata, and OCR scripts are present.");
