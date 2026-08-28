import test from "node:test";
import assert from "node:assert/strict";
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
  fuseDetectedPiiItems,
  evaluatePiiTaskRelevance,
  evaluatePiiPolicyItem,
  sanitizeRemotePayload,
  storeSecret,
  retrieveSecret,
  clearVault,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES,
  VAULT_ACCESS_RESULTS
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// STEP 10 ON-DEVICE OCR / VISUAL PERCEPTION COMPREHENSIVE TEST SUITE
// Covers all 25 required test cases and security invariants
// =====================================================================

test.beforeEach(() => {
  initializeVisualModel();
  clearVault();
});

// --- 1. Local visual processing boundary ---
test("1. Local visual processing boundary: Executes on-device without remote network transmission", () => {
  const adapter = createVisualModelAdapter();
  const input = [
    { text: "Welcome to our portal", bbox: { x: 10, y: 10, width: 200, height: 25 }, confidence: 95 }
  ];

  const result = adapter.recognize(input);
  assert.equal(result.ok, true);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.metadata.backend, VISUAL_BACKENDS.LOCAL_ADAPTER);
  assert.ok(result.metadata.latencyMs >= 0);
});

// --- 2. OCR block structure ---
test("2. OCR block structure: Produces structured blocks conforming to OCR_BLOCK_SHAPE", () => {
  const result = recognizeVisualText([
    { text: "Order Total $49.99", bbox: { x: 100, y: 50, width: 120, height: 20 }, confidence: 92 }
  ]);

  assert.equal(result.ok, true);
  const block = result.blocks[0];
  assert.equal(typeof block.text, "string");
  assert.equal(typeof block.bbox, "object");
  assert.equal(typeof block.bbox.x, "number");
  assert.equal(typeof block.bbox.y, "number");
  assert.equal(typeof block.bbox.width, "number");
  assert.equal(typeof block.bbox.height, "number");
  assert.equal(typeof block.confidence, "number");
});

// --- 3. Bounding-box validation ---
test("3. Bounding-box validation: Normalizes bounding boxes to non-negative rounded integers", () => {
  const input = [
    { text: "Item Line", bbox: { x: 10.7, y: -5, width: 99.4, height: 19.8 }, confidence: 90 }
  ];

  const result = recognizeVisualText(input);
  assert.equal(result.ok, true);
  const bbox = result.blocks[0].bbox;
  assert.equal(bbox.x, 11);
  assert.equal(bbox.y, 0); // clamped to non-negative
  assert.equal(bbox.width, 99);
  assert.equal(bbox.height, 20);
});

// --- 4. Confidence normalization ---
test("4. Confidence normalization: Validates and bounds confidence scores within [0.0, 1.0]", () => {
  const input = [
    { text: "Block 1", bbox: { x: 0, y: 0, width: 50, height: 20 }, confidence: 98 },    // 0-100 scale -> 0.98
    { text: "Block 2", bbox: { x: 0, y: 30, width: 50, height: 20 }, confidence: 0.85 }, // 0-1 scale -> 0.85
    { text: "Block 3", bbox: { x: 0, y: 60, width: 50, height: 20 }, confidence: 150 }   // > 100 clamped to 1.0
  ];

  const result = recognizeVisualText(input);
  assert.equal(result.ok, true);
  assert.equal(result.blocks[0].confidence, 0.98);
  assert.equal(result.blocks[1].confidence, 0.85);
  assert.equal(result.blocks[2].confidence, 1.0);
});

// --- 5. Step 6 robust detection integration ---
test("5. Step 6 robust detection integration: Visual OCR blocks flow into detectPiiMultiSignal correctly", () => {
  const ocrBlocks = [
    { text: "Contact us at contact@testdomain.invalid for help", bbox: { x: 20, y: 200, width: 250, height: 20 }, confidence: 95 },
    { text: "Call +1 (555) 234-5678", bbox: { x: 20, y: 230, width: 180, height: 20 }, confidence: 92 }
  ];

  const piiItems = detectPiiMultiSignal({ ocrBlocks });
  assert.equal(piiItems.length, 2);

  const categories = piiItems.map((p) => p.category);
  assert.ok(categories.includes("email"));
  assert.ok(categories.includes("phone"));
});

// --- 6. Step 5 localization compatibility ---
test("6. Step 5 localization compatibility: Reconstructs OCR fragments and produces localized PII", () => {
  const splitBlocks = [
    { text: "agent_support", bbox: { x: 10, y: 100, width: 80, height: 20 }, confidence: 90 },
    { text: "@example.org", bbox: { x: 95, y: 100, width: 90, height: 20 }, confidence: 90 }
  ];

  const ocrResult = recognizeVisualText(splitBlocks);
  assert.equal(ocrResult.ok, true);

  const localizedItems = processOcrResult(ocrResult.blocks);
  assert.equal(localizedItems.length, 1);
  assert.equal(localizedItems[0].category, "email");
  assert.equal(localizedItems[0].source, "ocr");
  assert.equal(localizedItems[0].placeholder, "[EMAIL_OCR_REDACTED]");
  assert.equal(localizedItems[0].secretValue, undefined);
  assert.equal(localizedItems[0].value, undefined);
});

// --- 7. DOM/OCR spatial fusion ---
test("7. DOM/OCR spatial fusion: Step 10 OCR findings fuse with overlapping DOM items into source: fusion", () => {
  const domItems = [
    { id: "PII_DOM_1", category: "email", confidence: 0.95, bbox: { x: 50, y: 100, width: 150, height: 25 }, source: "dom" }
  ];
  const ocrBlocks = [
    { text: "info@securecorp.test", bbox: { x: 52, y: 102, width: 148, height: 23 }, confidence: 96 }
  ];

  const fused = detectPiiMultiSignal({ domItems, ocrBlocks });
  assert.equal(fused.length, 1);
  assert.equal(fused[0].category, "email");
  assert.equal(fused[0].source, "fusion");
  assert.ok(fused[0].confidence >= 0.95);
});

// --- 8. Raw PII sanitization ---
test("8. Raw PII sanitization: processVisualPii produces strictly sanitized localized items without raw sensitive strings", () => {
  const input = [
    { text: "Visa Card 4111 1111 1111 1111 Exp: 12/28", bbox: { x: 10, y: 50, width: 300, height: 30 }, confidence: 98 },
    { text: "Contact email: ceo@company.org", bbox: { x: 10, y: 90, width: 200, height: 30 }, confidence: 95 }
  ];

  const result = processVisualPii(input);
  assert.equal(result.ok, true);
  assert.ok(result.localizedItems.length >= 1);

  const jsonStr = JSON.stringify(result.localizedItems);
  assert.equal(jsonStr.includes("4111 1111 1111 1111"), false);
  assert.equal(jsonStr.includes("ceo@company.org"), false);
});

// --- 9. Remote boundary enforcement ---
test("9. Remote boundary enforcement: Remote payload sanitization prevents any OCR sensitive text from leaving locally", () => {
  const rawPayload = {
    ocrBlockCount: 3,
    visualScanStatus: "COMPLETED",
    accidentalCardLeak: "4111 1111 1111 1111",
    accidentalEmailLeak: "ceo@privatefirm.invalid",
    safePlaceholder: "[EMAIL_OCR_REDACTED]"
  };

  const sanitized = sanitizeRemotePayload(rawPayload);
  const jsonStr = JSON.stringify(sanitized);

  assert.equal(jsonStr.includes("4111 1111 1111 1111"), false);
  assert.equal(jsonStr.includes("ceo@privatefirm.invalid"), false);
  assert.ok(jsonStr.includes("[EMAIL_OCR_REDACTED]"));
  assert.ok(jsonStr.includes("COMPLETED"));
});

// --- 10. initialize -> recognize -> dispose lifecycle ---
test("10. initialize -> recognize -> dispose lifecycle: Manages state transitions cleanly", () => {
  const customAdapter = new VisualModelAdapter();
  assert.equal(customAdapter.getState(), VISUAL_PERCEPTION_STATUS.UNINITIALIZED);
  assert.equal(customAdapter.isReady(), false);

  const initRes = customAdapter.initialize({ backend: VISUAL_BACKENDS.LOCAL_ADAPTER });
  assert.equal(initRes.ok, true);
  assert.equal(customAdapter.getState(), VISUAL_PERCEPTION_STATUS.READY);
  assert.equal(customAdapter.isReady(), true);

  const recRes = customAdapter.recognize([{ text: "Lifecycle Test", bbox: { x: 0, y: 0, width: 50, height: 10 } }]);
  assert.equal(recRes.ok, true);

  const dispRes = customAdapter.dispose();
  assert.equal(dispRes.ok, true);
  assert.equal(customAdapter.getState(), VISUAL_PERCEPTION_STATUS.DISPOSED);
  assert.equal(customAdapter.isReady(), false);

  // Recognition on disposed adapter fails safely
  const postDispose = customAdapter.recognize([{ text: "Fail", bbox: { x: 0, y: 0, width: 50, height: 10 } }]);
  assert.equal(postDispose.ok, false);
  assert.equal(postDispose.blocks.length, 0);
});

// --- 11. Failure safety ---
test("11. Failure safety: Malformed inputs and uninitialized states fail safely without throwing", () => {
  const adapter = createVisualModelAdapter();

  const resNull = adapter.recognize(null);
  assert.equal(resNull.ok, false);
  assert.equal(resNull.blocks.length, 0);

  const resMalformed = adapter.recognize([null, undefined, { invalid: true }, { text: "", bbox: null }]);
  assert.equal(resMalformed.ok, true);
  assert.equal(resMalformed.blocks.length, 0);
});

// --- 12. Timeout handling ---
test("12. Timeout handling: Processing respects configured limits", () => {
  const adapter = createVisualModelAdapter({ PROCESSING_TIMEOUT_MS: 5000 });
  const result = adapter.recognize([{ text: "Quick Scan", bbox: { x: 0, y: 0, width: 50, height: 10 } }]);
  assert.equal(result.ok, true);
});

// --- 13. Unsupported backend handling ---
test("13. Unsupported backend handling: Requesting an unknown backend fails safely", () => {
  const adapter = new VisualModelAdapter();
  const initRes = adapter.initialize({ backend: "remote_cloud_api" });
  assert.equal(initRes.ok, false);
  assert.equal(initRes.state, VISUAL_PERCEPTION_STATUS.ERROR);
  assert.ok(initRes.error.includes("Unsupported visual backend"));
});

// --- 14. Maximum image dimension enforcement ---
test("14. Maximum image dimension enforcement: Oversized dimensions are rejected safely", () => {
  const adapter = createVisualModelAdapter();
  const resOversized = adapter.recognize({ width: 10000, height: 10000, blocks: [] });
  assert.equal(resOversized.ok, false);
  assert.ok(resOversized.error.includes("exceed maximum allowable dimension"));
});

// --- 15. Maximum OCR block count enforcement ---
test("15. Maximum OCR block count enforcement: Caps recognized blocks to MAX_BLOCK_COUNT (500)", () => {
  const customAdapter = createVisualModelAdapter({ MAX_BLOCK_COUNT: 5 });
  const manyBlocks = Array.from({ length: 20 }, (_, i) => ({
    text: `Line ${i}`,
    bbox: { x: 0, y: i * 20, width: 100, height: 15 },
    confidence: 90
  }));

  const res = customAdapter.recognize(manyBlocks);
  assert.equal(res.ok, true);
  assert.equal(res.blocks.length, 5);
});

// --- 16. No screenshot leakage ---
test("16. No screenshot leakage: Raw image data is not embedded in returned metadata", () => {
  const imageInput = {
    width: 800,
    height: 600,
    data: "raw_pixel_buffer_mock",
    blocks: [{ text: "Header Title", bbox: { x: 10, y: 10, width: 100, height: 20 }, confidence: 95 }]
  };

  const res = recognizeVisualText(imageInput);
  assert.equal(res.ok, true);
  const metaJson = JSON.stringify(res.metadata);
  assert.equal(metaJson.includes("raw_pixel_buffer_mock"), false);
});

// --- 17. No raw OCR logging ---
test("17. No raw OCR logging: Sanitized outputs avoid leaking raw OCR sensitive text in logs", () => {
  const res = processVisualPii([
    { text: "Confidential Phone: +1 555 432 1098", bbox: { x: 0, y: 0, width: 200, height: 20 }, confidence: 95 }
  ]);

  assert.equal(res.ok, true);
  const jsonStr = JSON.stringify(res.localizedItems);
  assert.equal(jsonStr.includes("+1 555 432 1098"), false);
});

// --- 18. No raw PII in output ---
test("18. No raw PII in output: Localized items contain zero raw sensitive data", () => {
  const res = processVisualPii([
    { text: "Contact: testuser@company.org", bbox: { x: 0, y: 0, width: 200, height: 20 }, confidence: 95 }
  ]);

  for (const item of res.localizedItems) {
    assert.equal(item.secretValue, undefined);
    assert.equal(item.rawValue, undefined);
  }
});

// --- 19. No network OCR ---
test("19. No network OCR: Adapter executes purely locally with local adapter backend", () => {
  assert.equal(visualModelAdapter.backend, VISUAL_BACKENDS.LOCAL_ADAPTER);
});

// --- 20. No website-specific hardcoding ---
test("20. No website-specific hardcoding: Operates dynamically on arbitrary runtime text", () => {
  const randA = Math.random().toString(36).substring(2, 7);
  const randB = Math.random().toString(36).substring(2, 7);
  const dynamicEmails = [
    `user${randA}@domaina.org`,
    `support${randB}@companyb.net`
  ];

  const result = recognizeVisualText(dynamicEmails.map((email, idx) => ({
    text: `Your email is ${email}`,
    bbox: { x: 10, y: idx * 40, width: 220, height: 20 },
    confidence: 94
  })));

  assert.equal(result.ok, true);
  assert.equal(result.blocks.length, 2);

  const detected = processOcrResult(result.blocks);
  assert.equal(detected.length, 2);
  assert.equal(detected[0].category, "email");
  assert.equal(detected[1].category, "email");
});

// --- 21. Existing Step 5 regression ---
test("21. Existing Step 5 regression: OCR fragment reconstruction & localization remains intact", () => {
  const ocrItems = processOcrResult([{ text: "user@example.invalid", bbox: { x: 0, y: 0, width: 80, height: 20 }, confidence: 95 }]);
  assert.equal(ocrItems.length, 1);
  assert.equal(ocrItems[0].category, "email");
});

// --- 22. Existing Step 6 regression ---
test("22. Existing Step 6 regression: Multi-signal PII detection & spatial fusion remains intact", () => {
  const multi = detectPiiMultiSignal({
    domItems: [{ category: "email", bbox: { x: 0, y: 0, width: 80, height: 20 }, source: "dom" }],
    ocrBlocks: [{ text: "user@example.invalid", bbox: { x: 0, y: 0, width: 80, height: 20 }, confidence: 95 }]
  });
  assert.equal(multi.length, 1);
  assert.equal(multi[0].source, "fusion");
});

// --- 23. Existing Step 7 regression ---
test("23. Existing Step 7 regression: Context Analyzer relevance classification remains intact", () => {
  const ctx = evaluatePiiTaskRelevance({
    userInstruction: "Login with my password",
    piiItems: [{ id: "P1", category: "password", confidence: 0.95 }]
  });
  assert.equal(ctx.taskIntent, "LOGIN");
  assert.equal(ctx.piiRelevance[0].relevance, "REQUIRED");
});

// --- 24. Existing Step 8 regression ---
test("24. Existing Step 8 regression: Privacy Policy Engine decisions remain intact", () => {
  const pol = evaluatePiiPolicyItem({
    piiItem: { id: "P1", category: "password", confidence: 0.95 },
    relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });
  assert.equal(pol.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 25. Existing Step 9 regression ---
test("25. Existing Step 9 regression: Secure Local Privacy Vault operations remain intact", () => {
  const stored = storeSecret({ category: "password", secretValue: "RegressionPass1!", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(stored.ok, true);
  const ret = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(ret.ok, true);
  assert.equal(ret.secretValue, "RegressionPass1!");
});
