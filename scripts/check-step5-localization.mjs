import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findPiiMatches, processOcrResult, createLocalizedPiiItem } from "../packages/privacy-core/src/index.js";

const extensionPiiSrc = await readFile(resolve("apps/extension/src/content-pii.js"), "utf8");
const ocrServiceSrc = await readFile(resolve("apps/extension/src/ocr-service.js"), "utf8");

// Check DOM bounding box computation keywords in content-pii.js
if (!extensionPiiSrc.includes("getBoundingClientRect") || !extensionPiiSrc.includes("localizedItems")) {
  console.error("Extension PII content script must extract bounding boxes and localizedItems.");
  process.exit(1);
}

// Check OCR service localization
if (!ocrServiceSrc.includes("processOcrBlocks") || !ocrServiceSrc.includes("source: \"ocr\"")) {
  console.error("OCR service must define processOcrBlocks and set source to 'ocr'.");
  process.exit(1);
}

// Test sample OCR processing
const sampleOcr = [
  { text: "Contact test@agency.gov", bbox: { x: 50, y: 100, width: 200, height: 30 }, confidence: 96 }
];
const localized = processOcrResult(sampleOcr);

if (localized.length !== 1 || localized[0].category !== "email" || localized[0].source !== "ocr") {
  console.error("OCR PII localization test failed.");
  process.exit(1);
}

if (JSON.stringify(localized[0]).includes("test@agency.gov")) {
  console.error("Raw sensitive value leaked in localized output.");
  process.exit(1);
}

console.log("Step 5 verification passed: DOM and OCR PII localization, bounding boxes, and non-raw token boundaries are intact.");
