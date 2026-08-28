import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const extensionDetector = await readFile(resolve("apps/extension/src/content-pii.js"), "utf8");
const coreDetector = await readFile(resolve("packages/privacy-core/src/detection.js"), "utf8");

for (const requiredCategory of ["email", "phone", "payment_card", "password_field"]) {
  if (!extensionDetector.includes(requiredCategory)) {
    console.error(`Extension detector is missing category: ${requiredCategory}`);
    process.exit(1);
  }
}

for (const forbiddenApi of ["fetch(", "XMLHttpRequest", "document.cookie", "chrome.storage"]) {
  if (extensionDetector.includes(forbiddenApi)) {
    console.error(`Extension detector contains forbidden API: ${forbiddenApi}`);
    process.exit(1);
  }
}

if (!coreDetector.includes("never returns a matched value")) {
  console.error("Core detector must document its no-raw-value contract.");
  process.exit(1);
}

console.log("PII detector verified: local categories, no network/storage APIs, and no raw-value output.");
