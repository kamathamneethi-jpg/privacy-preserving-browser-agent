import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  detectPiiMultiSignal,
  PiiCategory,
  analyzeDomElementSemantics,
  calculateMultiSignalConfidence,
  DETECTION_CONFIG
} from "../packages/privacy-core/src/index.js";

const detectionSrc = await readFile(resolve("packages/privacy-core/src/detection.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/config.js"), "utf8");
const fusionSrc = await readFile(resolve("packages/privacy-core/src/fusion.js"), "utf8");

// 1. Verify required categories are defined
for (const cat of ["EMAIL", "PHONE", "PERSON_NAME", "ADDRESS", "PASSWORD_FIELD", "PAYMENT_CARD", "ACCOUNT_IDENTIFIER", "OTP"]) {
  if (!(cat in PiiCategory)) {
    console.error(`Missing required PII category constant: ${cat}`);
    process.exit(1);
  }
}

// 2. Verify fusion module exists and handles spatial overlap
if (!fusionSrc.includes("areBoundingBoxesOverlapping") || !fusionSrc.includes("fuseDetectedPiiItems")) {
  console.error("Fusion module must define bounding box spatial overlap and fusion engine.");
  process.exit(1);
}

// 3. Verify confidence capping below MAX_CONFIDENCE
const maxConfScore = calculateMultiSignalConfidence("email", ["PATTERN", "DOM_SEMANTIC", "OCR_VISUAL", "CHECKSUM"]);
if (maxConfScore >= 0.99 || maxConfScore > DETECTION_CONFIG.MAX_CONFIDENCE) {
  console.error(`Confidence score must be capped below 0.99. Got: ${maxConfScore}`);
  process.exit(1);
}

// 4. Test multi-signal DOM + OCR fusion
const fused = detectPiiMultiSignal({
  domItems: [{ category: "email", bbox: { x: 50, y: 50, width: 100, height: 20 }, source: "dom" }],
  ocrBlocks: [{ text: "sample@domain.org", bbox: { x: 52, y: 51, width: 98, height: 18 } }]
});

if (fused.length !== 1 || fused[0].source !== "fusion") {
  console.error("Multi-signal DOM + OCR spatial fusion failed.");
  process.exit(1);
}

// 5. Verify no raw sensitive text in JSON output
if (JSON.stringify(fused).includes("sample@domain.org")) {
  console.error("Raw sensitive value leaked in multi-signal detection output.");
  process.exit(1);
}

console.log("Step 6 verification passed: Multi-signal detection, 8 categories, evidence confidence capping, spatial fusion, and zero raw-value leakage verified.");
