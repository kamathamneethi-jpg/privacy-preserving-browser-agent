import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VisualModelAdapter,
  createVisualModelAdapter,
  visualModelAdapter,
  initializeVisualModel,
  recognizeVisualText,
  processVisualPii,
  disposeVisualModel,
  VISUAL_MODEL_VERSION,
  VISUAL_CONFIG,
  VISUAL_PERCEPTION_STATUS,
  VISUAL_BACKENDS,
  processOcrResult,
  detectPiiMultiSignal,
  evaluatePiiTaskRelevance,
  evaluatePiiPolicyItem,
  storeSecret,
  retrieveSecret,
  clearVault,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../packages/privacy-core/src/index.js";

const visualSrc = await readFile(resolve("packages/privacy-core/src/visual-model-adapter.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/visual-config.js"), "utf8");

// 1. Verify required visual exports exist
const requiredExports = [
  "VisualModelAdapter",
  "createVisualModelAdapter",
  "visualModelAdapter",
  "initializeVisualModel",
  "recognizeVisualText",
  "processVisualPii",
  "disposeVisualModel"
];
for (const exp of requiredExports) {
  if (!visualSrc.includes(exp)) {
    console.error(`visual-model-adapter.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify visual contracts and configs
if (!VISUAL_PERCEPTION_STATUS.READY || !VISUAL_PERCEPTION_STATUS.DISPOSED) {
  console.error("Visual perception status must define READY and DISPOSED.");
  process.exit(1);
}

if (!VISUAL_BACKENDS.LOCAL_ADAPTER || !VISUAL_BACKENDS.WASM) {
  console.error("Visual backends must define LOCAL_ADAPTER and WASM.");
  process.exit(1);
}

if (!VISUAL_CONFIG.MAX_IMAGE_DIMENSION || VISUAL_CONFIG.MIN_OCR_CONFIDENCE !== 0.60) {
  console.error("Visual configuration is invalid or missing defaults.");
  process.exit(1);
}

// 3. Test local visual recognition
initializeVisualModel();
const scanResult = recognizeVisualText([
  { text: "Contact: billing@secure-service.invalid", bbox: { x: 15.6, y: -2, width: 240.2, height: 22.4 }, confidence: 96 }
]);

if (!scanResult.ok || scanResult.blocks.length !== 1) {
  console.error("Local visual recognition failed.");
  process.exit(1);
}

const block = scanResult.blocks[0];
if (block.bbox.x !== 16 || block.bbox.y !== 0 || block.confidence !== 0.96) {
  console.error("Visual recognition failed to normalize bbox or confidence.");
  process.exit(1);
}

// 4. Test Step 5 & 6 Integration (PII detection and fusion)
const piiResult = processVisualPii([
  { text: "Support email: help@company.invalid", bbox: { x: 20, y: 50, width: 200, height: 20 }, confidence: 95 }
]);

if (!piiResult.ok || piiResult.localizedItems.length !== 1 || piiResult.localizedItems[0].category !== "email") {
  console.error("Visual PII processing failed to localize email.");
  process.exit(1);
}

const fused = detectPiiMultiSignal({
  domItems: [{ category: "email", bbox: { x: 18, y: 0, width: 235, height: 20 }, source: "dom" }],
  ocrBlocks: scanResult.blocks
});

if (fused.length !== 1 || fused[0].source !== "fusion") {
  console.error("Step 10 OCR failed to fuse with DOM finding.");
  process.exit(1);
}

// 5. Test raw PII sanitization in output
if (JSON.stringify(piiResult.localizedItems).includes("help@company.invalid")) {
  console.error("Localized items leaked raw PII in output object.");
  process.exit(1);
}

// 6. Test lifecycle management
const customAdapter = new VisualModelAdapter();
if (customAdapter.isReady()) {
  console.error("Adapter should not be ready before initialization.");
  process.exit(1);
}
customAdapter.initialize();
if (!customAdapter.isReady()) {
  console.error("Adapter failed to reach READY state after initialize.");
  process.exit(1);
}
customAdapter.dispose();
if (customAdapter.isReady() || customAdapter.getState() !== VISUAL_PERCEPTION_STATUS.DISPOSED) {
  console.error("Adapter failed to dispose properly.");
  process.exit(1);
}

// 7. Backward Compatibility - Steps 5, 6, 7, 8, 9
const ocr = processOcrResult([{ text: "info@domain.invalid", bbox: { x: 0, y: 0, width: 50, height: 20 }, confidence: 95 }]);
if (ocr.length !== 1 || ocr[0].category !== "email") {
  console.error("Step 5 OCR localization integrity failed.");
  process.exit(1);
}

const relevance = evaluatePiiTaskRelevance({ userInstruction: "Login with my password", piiItems: [{ id: "P1", category: "password", confidence: 0.95 }] });
if (relevance.piiRelevance[0].relevance !== "REQUIRED") {
  console.error("Step 7 Context Analyzer integrity failed.");
  process.exit(1);
}

const policy = evaluatePiiPolicyItem({ piiItem: { id: "P1", category: "password", confidence: 0.95 }, relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 }, destination: PROCESSING_DESTINATIONS.REMOTE_REASONING });
if (policy.action !== POLICY_ACTIONS.LOCAL_ONLY) {
  console.error("Step 8 Policy Engine integrity failed.");
  process.exit(1);
}

clearVault();
const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });
const retrieved = retrieveSecret({ vaultId: stored.vaultId, purpose: VAULT_PURPOSES.LOGIN, destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER, authorization: { authorizationGranted: true } });
if (!retrieved.ok || retrieved.secretValue !== "Pass123!") {
  console.error("Step 9 Vault integrity failed.");
  process.exit(1);
}

console.log("Step 10 verification passed: On-Device OCR / Visual Model Adapter, local perception, lifecycle, bbox/confidence normalization, DOM fusion, zero raw PII leakage, and backward compatibility verified.");
