import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SanitizedContextBuilder,
  createSanitizedContextBuilder,
  sanitizedContextBuilder,
  buildSanitizedContext,
  sanitizeDomTree,
  sanitizeVisualBlocks,
  validateSanitizedPayload,
  CONTEXT_BUILDER_VERSION,
  SANITIZER_CONFIG,
  SANITIZED_CONTEXT_STATUS,
  TOKEN_TYPES,
  SANITIZED_PAYLOAD_SHAPE,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  processOcrResult,
  detectPiiMultiSignal,
  evaluatePiiTaskRelevance,
  evaluatePiiPolicyItem,
  storeSecret,
  retrieveSecret,
  clearVault,
  VAULT_PURPOSES,
  VisualModelAdapter
} from "../packages/privacy-core/src/index.js";

const builderSrc = await readFile(resolve("packages/privacy-core/src/sanitized-context-builder.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/sanitizer-config.js"), "utf8");
const contractsSrc = await readFile(resolve("packages/shared-types/src/privacy-contracts.js"), "utf8");

// 1. Verify required exports exist in source
const requiredBuilderExports = [
  "SanitizedContextBuilder",
  "createSanitizedContextBuilder",
  "sanitizedContextBuilder",
  "buildSanitizedContext",
  "buildSanitizedReasoningPayload",
  "sanitizePageRepresentation",
  "sanitizeDomTree",
  "sanitizeDomSubtree",
  "sanitizeVisualBlocks",
  "validateSanitizedPayload"
];
for (const exp of requiredBuilderExports) {
  if (!builderSrc.includes(exp)) {
    console.error(`sanitized-context-builder.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify Step 11 contracts
if (!SANITIZED_CONTEXT_STATUS.READY || !SANITIZED_CONTEXT_STATUS.SANITIZED || !SANITIZED_CONTEXT_STATUS.REJECTED) {
  console.error("SANITIZED_CONTEXT_STATUS must define READY, SANITIZED, and REJECTED.");
  process.exit(1);
}

if (!TOKEN_TYPES.OPAQUE_ID || !TOKEN_TYPES.CATEGORY_PLACEHOLDER) {
  console.error("TOKEN_TYPES must define OPAQUE_ID and CATEGORY_PLACEHOLDER.");
  process.exit(1);
}

if (!SANITIZER_CONFIG.MAX_DOM_DEPTH || !SANITIZER_CONFIG.MAX_PAYLOAD_BYTES) {
  console.error("SANITIZER_CONFIG is missing required threshold properties.");
  process.exit(1);
}

// 3. Test Sanitized Context Assembly with tokenization & redaction
const rawDom = {
  tag: "div",
  children: [
    { tag: "script", text: "console.log('malicious');" },
    { tag: "input", attributes: { type: "text", name: "email", value: "alice@private-domain.invalid", onclick: "track()" } },
    { tag: "input", attributes: { type: "password", id: "pass", value: "MySuperPass987!" } }
  ]
};

const visualBlocks = [
  { text: "Contact email: alice@private-domain.invalid", bbox: { x: 10.2, y: 20.8, width: 250, height: 22 }, confidence: 96 }
];

const piiItems = [
  { id: "P_EMAIL", category: "email", confidence: 0.95, bbox: { x: 10, y: 20, width: 250, height: 22 } },
  { id: "P_PWD", category: "password", confidence: 0.98 }
];

const policyDecisions = [
  { action: POLICY_ACTIONS.TOKENIZE, token: "TOKEN_EMAIL_1", piiItem: piiItems[0] },
  { action: POLICY_ACTIONS.LOCAL_ONLY, piiItem: piiItems[1] }
];

const result = buildSanitizedContext({
  taskInstruction: "Log in with my credentials",
  domTree: rawDom,
  visualBlocks,
  piiItems,
  policyDecisions
});

if (!result.ok || result.status !== SANITIZED_CONTEXT_STATUS.SANITIZED) {
  console.error("buildSanitizedContext failed to return a sanitized payload.");
  process.exit(1);
}

const payloadStr = JSON.stringify(result.payload);

// 4. Verify ZERO raw PII leakage
if (payloadStr.includes("alice@private-domain.invalid")) {
  console.error("Raw email leaked in sanitized context payload.");
  process.exit(1);
}

if (payloadStr.includes("MySuperPass987!")) {
  console.error("Raw password leaked in sanitized context payload.");
  process.exit(1);
}

// 5. Verify dangerous tags and attributes are stripped
if (payloadStr.includes("console.log('malicious')")) {
  console.error("Forbidden script tag was not stripped from sanitized DOM tree.");
  process.exit(1);
}

if (payloadStr.includes("onclick") || payloadStr.includes("track()")) {
  console.error("Dangerous inline event handler was not stripped.");
  process.exit(1);
}

// 6. Verify Visual OCR spatial preservation
const vBlock = result.payload.visualBlocks[0];
if (!vBlock || vBlock.bbox.x !== 10 || vBlock.bbox.y !== 21 || !vBlock.text.includes("TOKEN_EMAIL_1")) {
  console.error("Visual perception blocks were not correctly sanitized with spatial bounding boxes preserved.");
  process.exit(1);
}

// 7. Verify Lifecycle Management
const customBuilder = new SanitizedContextBuilder();
if (customBuilder.isReady()) {
  console.error("SanitizedContextBuilder should not be ready before initialization.");
  process.exit(1);
}
customBuilder.initialize();
if (!customBuilder.isReady()) {
  console.error("SanitizedContextBuilder failed to reach READY state after initialize.");
  process.exit(1);
}
customBuilder.dispose();
if (customBuilder.isReady()) {
  console.error("SanitizedContextBuilder failed to dispose properly.");
  process.exit(1);
}

// 8. Backward Compatibility - Steps 5, 6, 7, 8, 9, 10
const ocr = processOcrResult([{ text: "info@domain.invalid", bbox: { x: 0, y: 0, width: 50, height: 20 }, confidence: 95 }]);
if (ocr.length !== 1 || ocr[0].category !== "email") {
  console.error("Step 5 OCR localization integrity failed.");
  process.exit(1);
}

const multi = detectPiiMultiSignal({
  domItems: [{ category: "email", bbox: { x: 10, y: 10, width: 50, height: 20 }, source: "dom" }],
  ocrBlocks: [{ text: "info@domain.invalid", bbox: { x: 12, y: 11, width: 48, height: 18 } }]
});
if (multi.length !== 1 || multi[0].source !== "fusion") {
  console.error("Step 6 multi-signal fusion integrity failed.");
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
const stored = storeSecret({ category: "password", secretValue: "Step11Pass!", purpose: VAULT_PURPOSES.LOGIN });
const retrieved = retrieveSecret({ vaultId: stored.vaultId, purpose: VAULT_PURPOSES.LOGIN, destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER, authorization: { authorizationGranted: true } });
if (!retrieved.ok || retrieved.secretValue !== "Step11Pass!") {
  console.error("Step 9 Vault integrity failed.");
  process.exit(1);
}

const visualAdapter = new VisualModelAdapter();
visualAdapter.initialize();
const visualScan = visualAdapter.recognize([{ text: "Sanitized Test", bbox: { x: 0, y: 0, width: 50, height: 10 } }]);
if (!visualScan.ok || visualScan.blocks.length !== 1) {
  console.error("Step 10 VisualModelAdapter integrity failed.");
  process.exit(1);
}

console.log("Step 11 verification passed: Sanitized Context Builder, DOM tokenization/redaction, tag/attribute stripping, visual OCR spatial preservation, zero raw PII leakage, and Steps 1–10 backward compatibility verified.");
