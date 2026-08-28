import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy,
  sanitizeRemotePayload,
  generateOpaqueToken,
  generatePiiToken,
  POLICY_VERSION,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  PROCESSING_DESTINATIONS,
  SENSITIVITY_LEVELS,
  TASK_RELEVANCE_LEVELS,
  CATEGORY_SENSITIVITY_MAP,
  POLICY_CONFIG,
  PiiCategory,
  processOcrResult,
  detectPiiMultiSignal,
  evaluatePiiTaskRelevance
} from "../packages/privacy-core/src/index.js";

const engineSrc = await readFile(resolve("packages/privacy-core/src/policy-engine.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/policy-config.js"), "utf8");

// 1. Verify policy engine exports
if (
  !engineSrc.includes("evaluatePiiPolicyItem") ||
  !engineSrc.includes("evaluateBatchPrivacyPolicy") ||
  !engineSrc.includes("sanitizeRemotePayload") ||
  !engineSrc.includes("generateOpaqueToken")
) {
  console.error("policy-engine.js must export evaluatePiiPolicyItem, evaluateBatchPrivacyPolicy, sanitizeRemotePayload, and generateOpaqueToken.");
  process.exit(1);
}

// 2. Verify exact 4 official policy actions (REDACT, TOKENIZE, LOCAL_ONLY, ALLOW)
const actions = Object.values(POLICY_ACTIONS);
if (actions.length !== 4 || !actions.includes("REDACT") || !actions.includes("TOKENIZE") || !actions.includes("LOCAL_ONLY") || !actions.includes("ALLOW")) {
  console.error("Policy actions must strictly equal REDACT, TOKENIZE, LOCAL_ONLY, ALLOW.");
  process.exit(1);
}

// 3. Verify sensitivity levels exist and cover critical categories
if (!SENSITIVITY_LEVELS.CRITICAL || !SENSITIVITY_LEVELS.HIGH || !SENSITIVITY_LEVELS.MEDIUM) {
  console.error("Sensitivity levels must define CRITICAL, HIGH, MEDIUM.");
  process.exit(1);
}

if (
  CATEGORY_SENSITIVITY_MAP[PiiCategory.PASSWORD_FIELD] !== SENSITIVITY_LEVELS.CRITICAL ||
  CATEGORY_SENSITIVITY_MAP[PiiCategory.OTP] !== SENSITIVITY_LEVELS.CRITICAL ||
  CATEGORY_SENSITIVITY_MAP[PiiCategory.PAYMENT_CARD] !== SENSITIVITY_LEVELS.CRITICAL
) {
  console.error("Password, OTP, and Payment Card must be mapped to CRITICAL sensitivity.");
  process.exit(1);
}

// 4. Verify destination handling and safe defaults for unknown destinations
const unknownDestDecision = evaluatePiiPolicyItem({
  piiItem: { id: "PII_1", category: "email", confidence: 0.95 },
  relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
  destination: PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION
});

if (unknownDestDecision.action !== POLICY_ACTIONS.REDACT) {
  console.error("Unknown destination must default safely to REDACT.");
  process.exit(1);
}

// 5. Test Security Override & Invariant 11 (Critical PII + Remote Reasoning -> ALLOW FORBIDDEN)
const criticalRemoteDecision = evaluatePiiPolicyItem({
  piiItem: { id: "PII_PASS", category: "password_field", confidence: 0.99 },
  relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.99 },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
  authorization: { authorizationGranted: true }
});

if (criticalRemoteDecision.action === POLICY_ACTIONS.ALLOW) {
  console.error("CRITICAL SECURITY VIOLATION: Critical PII was granted ALLOW for remote destination.");
  process.exit(1);
}

if (criticalRemoteDecision.action !== POLICY_ACTIONS.LOCAL_ONLY && criticalRemoteDecision.action !== POLICY_ACTIONS.REDACT) {
  console.error("Critical PII remote restriction must resolve to LOCAL_ONLY or REDACT.");
  process.exit(1);
}

// 6. Test opaque token generation
const token = generateOpaqueToken("email", "PII_1");
if (!token.startsWith("PII_TOKEN_EMAIL_") || token.includes("user@example.com")) {
  console.error("Opaque token generation failed or leaked raw data.");
  process.exit(1);
}

// 7. Test payload sanitization
const payload = { intent: "TEST", pii: { value: "secret@example.com" }, sensitive: "4111 1111 1111 1111" };
const sanitized = sanitizeRemotePayload(payload);
if (JSON.stringify(sanitized).includes("secret@example.com") || JSON.stringify(sanitized).includes("4111 1111 1111 1111")) {
  console.error("Remote payload sanitization failed.");
  process.exit(1);
}

// 8. Test zero raw PII in policy decisions
const decision = evaluatePiiPolicyItem({
  piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
  relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
});

if (decision.value !== undefined || decision.rawValue !== undefined || decision.text !== undefined) {
  console.error("Policy decision object must not contain raw PII properties.");
  process.exit(1);
}

// 9. Verify Step 5 integrity (OCR & localization)
const sampleOcr = [{ text: "sample@domain.org", bbox: { x: 10, y: 10, width: 100, height: 20 }, confidence: 95 }];
const ocrResult = processOcrResult(sampleOcr);
if (ocrResult.length !== 1 || ocrResult[0].category !== "email" || ocrResult[0].source !== "ocr") {
  console.error("Step 5 backward compatibility check failed.");
  process.exit(1);
}

// 10. Verify Step 6 integrity (Multi-signal fusion)
const multiSignalResult = detectPiiMultiSignal({
  domItems: [{ category: "email", bbox: { x: 50, y: 50, width: 100, height: 20 }, source: "dom" }],
  ocrBlocks: [{ text: "sample@domain.org", bbox: { x: 52, y: 51, width: 98, height: 18 } }]
});
if (multiSignalResult.length !== 1 || multiSignalResult[0].source !== "fusion") {
  console.error("Step 6 backward compatibility check failed.");
  process.exit(1);
}

// 11. Verify Step 7 integrity (Context Analyzer)
const relevanceResult = evaluatePiiTaskRelevance({
  userInstruction: "Find my email address",
  piiItems: [{ id: "PII_1", category: "email", confidence: 0.98 }]
});
if (relevanceResult.piiRelevance[0].relevance !== TASK_RELEVANCE_LEVELS.REQUIRED) {
  console.error("Step 7 backward compatibility check failed.");
  process.exit(1);
}

console.log("Step 8 verification passed: Privacy Policy Engine, 4 actions, policy precedence, security overrides, opaque tokens, remote sanitization, and privacy invariants verified.");
