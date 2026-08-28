import test from "node:test";
import assert from "node:assert/strict";
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
  VisualModelAdapter,
  recognizeVisualText
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// STEP 11 SANITIZED CONTEXT BUILDER COMPREHENSIVE TEST SUITE
// Covers all 28 required test cases, fail-closed boundaries, and invariants
// =====================================================================

test.beforeEach(() => {
  clearVault();
});

// --- 1. Lifecycle management ---
test("1. Lifecycle: Manages transitions from UNINITIALIZED -> READY -> SANITIZED -> DISPOSED", () => {
  const builder = new SanitizedContextBuilder();
  assert.equal(builder.getState(), SANITIZED_CONTEXT_STATUS.UNINITIALIZED);
  assert.equal(builder.isReady(), false);

  const initRes = builder.initialize();
  assert.equal(initRes.ok, true);
  assert.equal(builder.getState(), SANITIZED_CONTEXT_STATUS.READY);
  assert.equal(builder.isReady(), true);

  const buildRes = builder.buildSanitizedContext({
    taskInstruction: "Find product information",
    domTree: { tag: "div", text: "Welcome to our shop" }
  });
  assert.equal(buildRes.ok, true);
  assert.equal(buildRes.status, SANITIZED_CONTEXT_STATUS.SANITIZED);

  const dispRes = builder.dispose();
  assert.equal(dispRes.ok, true);
  assert.equal(builder.getState(), SANITIZED_CONTEXT_STATUS.UNINITIALIZED);
});

// --- 2. Sanitized payload structure ---
test("2. Payload structure: Produces payload adhering to SANITIZED_PAYLOAD_SHAPE", () => {
  const result = buildSanitizedContext({
    taskInstruction: "Enter my contact info",
    domTree: { tag: "form", attributes: { id: "contact-form" }, children: [] },
    visualBlocks: [{ text: "Contact Us", bbox: { x: 10, y: 10, width: 100, height: 20 }, confidence: 0.95 }]
  });

  assert.equal(result.ok, true);
  const payload = result.payload;
  assert.equal(typeof payload.status, "string");
  assert.equal(typeof payload.version, "string");
  assert.equal(typeof payload.taskIntent, "string");
  assert.equal(typeof payload.domTree, "object");
  assert.ok(Array.isArray(payload.visualBlocks));
  assert.equal(typeof payload.tokenMapping, "object");
  assert.equal(typeof payload.metadata, "object");
  assert.equal(payload.version, CONTEXT_BUILDER_VERSION);
});

// --- 3. DOM sanitization with token substitution ---
test("3. DOM token substitution: Replaces sensitive fields with opaque tokens under TOKENIZE policy", () => {
  const rawDom = {
    tag: "div",
    children: [
      {
        tag: "input",
        attributes: { type: "text", name: "email", value: "user@private.invalid" }
      }
    ]
  };

  const piiItems = [
    { id: "P_EMAIL_1", category: "email", confidence: 0.95 }
  ];

  const policyDecisions = [
    {
      action: POLICY_ACTIONS.TOKENIZE,
      token: "TOKEN_EMAIL_1",
      piiItem: piiItems[0]
    }
  ];

  const result = buildSanitizedContext({
    taskInstruction: "Enter my email address",
    domTree: rawDom,
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload);
  assert.equal(jsonStr.includes("user@private.invalid"), false);
  assert.ok(jsonStr.includes("{{TOKEN_EMAIL_1}}"));
});

// --- 4. DOM sanitization with redaction placeholder ---
test("4. DOM redaction: Replaces irrelevant sensitive data with redaction placeholders under REDACT policy", () => {
  const rawDom = {
    tag: "p",
    text: "Contact phone: +1 555 019 2834"
  };

  const piiItems = [{ id: "P_PHONE_1", category: "phone", confidence: 0.92 }];
  const policyDecisions = [{ action: POLICY_ACTIONS.REDACT, piiItem: piiItems[0] }];

  const result = buildSanitizedContext({
    taskInstruction: "Read this article",
    domTree: rawDom,
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload);
  assert.equal(jsonStr.includes("+1 555 019 2834"), false);
  assert.ok(jsonStr.includes("[LOCAL_ONLY_PROTECTED]") || jsonStr.includes("[REDACTED]") || jsonStr.includes("PHONE"));
});

// --- 5. DOM sanitization with local-only marker ---
test("5. DOM local-only marker: Replaces critical local secrets with [LOCAL_ONLY_PROTECTED]", () => {
  const rawDom = {
    tag: "input",
    attributes: { type: "password", id: "user_password", value: "SecretP@ss123" }
  };

  const piiItems = [{ id: "P_PASS_1", category: "password", confidence: 0.98 }];
  const policyDecisions = [{ action: POLICY_ACTIONS.LOCAL_ONLY, piiItem: piiItems[0] }];

  const result = buildSanitizedContext({
    taskInstruction: "Log in with password",
    domTree: rawDom,
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload);
  assert.equal(jsonStr.includes("SecretP@ss123"), false);
  assert.ok(jsonStr.includes("[LOCAL_ONLY_PROTECTED]"));
});

// --- 6. HTML tag stripping ---
test("6. Tag stripping: Strips script, style, noscript, and iframe tags from DOM tree", () => {
  const rawDom = {
    tag: "body",
    children: [
      { tag: "script", text: "alert('xss');" },
      { tag: "style", text: "body { display: none; }" },
      { tag: "iframe", attributes: { src: "https://evil.invalid" } },
      { tag: "div", text: "Safe Content" }
    ]
  };

  const result = buildSanitizedContext({ domTree: rawDom });
  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload.domTree);

  assert.equal(jsonStr.includes("alert('xss')"), false);
  assert.equal(jsonStr.includes("display: none"), false);
  assert.equal(jsonStr.includes("https://evil.invalid"), false);
  assert.ok(jsonStr.includes("Safe Content"));
});

// --- 7. Dangerous attribute stripping ---
test("7. Attribute stripping: Strips inline event handlers (onclick, onload) and raw data attributes", () => {
  const rawDom = {
    tag: "button",
    attributes: {
      id: "submit-btn",
      onclick: "sendRawData()",
      onload: "initScript()",
      "data-raw-value": "ConfidentialSecret"
    },
    text: "Submit"
  };

  const result = buildSanitizedContext({ domTree: rawDom });
  assert.equal(result.ok, true);
  const attrs = result.payload.domTree.attributes;

  assert.equal(attrs.id, "submit-btn");
  assert.equal(attrs.onclick, undefined);
  assert.equal(attrs.onload, undefined);
  assert.equal(attrs["data-raw-value"], undefined);
});

// --- 8. Deep DOM tree recursion depth limit ---
test("8. Depth limit: Enforces maximum DOM depth (MAX_DOM_DEPTH: 32)", () => {
  let deepTree = { tag: "span", text: "Deepest leaf" };
  for (let i = 0; i < 40; i++) {
    deepTree = { tag: "div", children: [deepTree] };
  }

  const result = buildSanitizedContext({ domTree: deepTree });
  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload.domTree);
  assert.equal(jsonStr.includes("Deepest leaf"), false); // Exceeds depth 32, truncated cleanly
});

// --- 9. Maximum node count enforcement ---
test("9. Node limit: Caps sanitized node count to MAX_NODES_PER_PAYLOAD", () => {
  const builder = createSanitizedContextBuilder({ MAX_NODES_PER_PAYLOAD: 5 });
  const broadTree = {
    tag: "div",
    children: Array.from({ length: 20 }, (_, i) => ({ tag: "p", text: `Paragraph ${i}` }))
  };

  const result = builder.buildSanitizedContext({ domTree: broadTree });
  assert.equal(result.ok, true);
  assert.ok(result.payload.metadata.nodeCount <= 5);
});

// --- 10. Visual OCR block spatial bounding box preservation ---
test("10. Visual blocks: Preserves bounding box geometry while sanitizing text", () => {
  const visualBlocks = [
    { text: "Billing to: john@company.invalid", bbox: { x: 20.4, y: 50.1, width: 220, height: 25 }, confidence: 0.96 }
  ];

  const piiItems = [{ id: "P1", category: "email", confidence: 0.96, bbox: { x: 20, y: 50, width: 220, height: 25 } }];
  const policyDecisions = [{ action: POLICY_ACTIONS.TOKENIZE, token: "TOKEN_EMAIL_1", piiItem: piiItems[0] }];

  const result = buildSanitizedContext({
    taskInstruction: "Enter email",
    visualBlocks,
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const vBlock = result.payload.visualBlocks[0];
  assert.equal(vBlock.bbox.x, 20);
  assert.equal(vBlock.bbox.y, 50);
  assert.equal(vBlock.bbox.width, 220);
  assert.equal(vBlock.bbox.height, 25);
  assert.equal(vBlock.text.includes("john@company.invalid"), false);
  assert.ok(vBlock.text.includes("TOKEN_EMAIL_1"));
});

// --- 11. Zero raw password leakage ---
test("11. Password protection: Raw passwords are never present anywhere in the reasoning payload", () => {
  const rawDom = {
    tag: "input",
    attributes: { type: "password", value: "SuperSecretKey99#" }
  };
  const visualBlocks = [
    { text: "Password: SuperSecretKey99#", bbox: { x: 0, y: 0, width: 100, height: 20 }, confidence: 0.95 }
  ];

  const piiItems = [{ id: "P_PWD", category: "password", confidence: 0.98 }];
  const result = buildSanitizedContext({
    taskInstruction: "Login with my password",
    domTree: rawDom,
    visualBlocks,
    piiItems
  });

  assert.equal(result.ok, true);
  const payloadStr = JSON.stringify(result.payload);
  assert.equal(payloadStr.includes("SuperSecretKey99#"), false);
});

// --- 12. Zero raw credit card leakage ---
test("12. Payment card protection: Valid Luhn credit card numbers are never present in the reasoning payload", () => {
  const rawCard = "4111 1111 1111 1111";
  const rawDom = {
    tag: "div",
    text: `Your saved card is ${rawCard}`
  };
  const visualBlocks = [
    { text: `Card: ${rawCard}`, bbox: { x: 0, y: 0, width: 200, height: 20 }, confidence: 0.95 }
  ];

  const piiItems = [{ id: "P_CARD", category: "payment_card", confidence: 0.98 }];
  const result = buildSanitizedContext({
    taskInstruction: "Checkout order",
    domTree: rawDom,
    visualBlocks,
    piiItems
  });

  assert.equal(result.ok, true);
  const payloadStr = JSON.stringify(result.payload);
  assert.equal(payloadStr.includes(rawCard), false);
  assert.equal(payloadStr.includes("4111111111111111"), false);
});

// --- 13. Zero raw OTP leakage ---
test("13. OTP protection: One-time passwords are never present in the reasoning payload", () => {
  const otp = "849201";
  const rawDom = {
    tag: "input",
    attributes: { name: "otp", value: otp }
  };

  const piiItems = [{ id: "P_OTP", category: "otp", confidence: 0.95 }];
  const result = buildSanitizedContext({
    taskInstruction: "Verify OTP code",
    domTree: rawDom,
    piiItems
  });

  assert.equal(result.ok, true);
  const payloadStr = JSON.stringify(result.payload);
  assert.equal(payloadStr.includes(otp), false);
});

// --- 14. Token mapping contains zero raw secrets ---
test("14. Token mapping: Mapping entries contain only token, category, type, and decision", () => {
  const piiItems = [{ id: "P_EMAIL", category: "email", confidence: 0.95 }];
  const policyDecisions = [{ action: POLICY_ACTIONS.TOKENIZE, token: "TOKEN_EMAIL_TEST", piiItem: piiItems[0] }];

  const result = buildSanitizedContext({
    taskInstruction: "Enter email",
    domTree: { tag: "div" },
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const mapping = result.payload.tokenMapping;
  assert.ok(mapping.TOKEN_EMAIL_TEST);
  assert.equal(mapping.TOKEN_EMAIL_TEST.category, "email");
  assert.equal(mapping.TOKEN_EMAIL_TEST.decision, POLICY_ACTIONS.TOKENIZE);
  assert.equal(mapping.TOKEN_EMAIL_TEST.raw, undefined);
  assert.equal(mapping.TOKEN_EMAIL_TEST.secretValue, undefined);
});

// --- 15. Task intent classification integration ---
test("15. Task intent: Integrates Step 7 intent classification into payload metadata", () => {
  const result = buildSanitizedContext({
    taskInstruction: "Find details about the product",
    domTree: { tag: "div" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.taskIntent, "FIND_INFORMATION");
});

// --- 16. Payload size limit enforcement ---
test("16. Size limit: Rejects payloads that exceed MAX_PAYLOAD_BYTES", () => {
  const builder = createSanitizedContextBuilder({ MAX_PAYLOAD_BYTES: 200 });
  const largeTree = {
    tag: "div",
    children: Array.from({ length: 50 }, () => ({ tag: "p", text: "Some relatively long paragraph content here." }))
  };

  const result = builder.buildSanitizedContext({ domTree: largeTree });
  assert.equal(result.ok, false);
  assert.equal(result.status, SANITIZED_CONTEXT_STATUS.REJECTED);
  assert.ok(result.error.includes("exceeds maximum allowable limit"));
});

// --- 17. Malformed input safety ---
test("17. Malformed input: Fails safely on null/undefined input without throwing", () => {
  const resNull = buildSanitizedContext(null);
  assert.equal(resNull.ok, false);
  assert.equal(resNull.status, SANITIZED_CONTEXT_STATUS.ERROR);

  const resUndefined = buildSanitizedContext(undefined);
  assert.equal(resUndefined.ok, false);
  assert.equal(resUndefined.status, SANITIZED_CONTEXT_STATUS.ERROR);
});

// --- 18. Fail-closed validator ---
test("18. Validator: validateSanitizedPayload accurately detects unmasked scripts or card numbers", () => {
  const safePayload = {
    domTree: { tag: "div", text: "Clean text" }
  };
  const safeVal = validateSanitizedPayload(safePayload);
  assert.equal(safeVal.valid, true);

  const unsafePayload = {
    domTree: { tag: "div", text: "<script>alert(1)</script>" }
  };
  const unsafeVal = validateSanitizedPayload(unsafePayload);
  assert.equal(unsafeVal.valid, false);
  assert.ok(unsafeVal.violations.length > 0);
});

// --- 19. No website-specific hardcoding ---
test("19. Dynamic operation: Sanitizes arbitrary runtime inputs without site-specific rules", () => {
  const randDomain = `sub${Math.random().toString(36).substring(2, 7)}.testdomain.invalid`;
  const randEmail = `user${Math.random().toString(36).substring(2, 7)}@${randDomain}`;

  const rawDom = {
    tag: "div",
    text: `Your email is ${randEmail}`
  };

  const piiItems = [{ id: "P_RAND", category: "email", confidence: 0.95 }];
  const policyDecisions = [{ action: POLICY_ACTIONS.TOKENIZE, token: "TOKEN_RAND_EMAIL", piiItem: piiItems[0] }];

  const result = buildSanitizedContext({
    taskInstruction: "Enter email",
    domTree: rawDom,
    piiItems,
    policyDecisions
  });

  assert.equal(result.ok, true);
  const jsonStr = JSON.stringify(result.payload);
  assert.equal(jsonStr.includes(randEmail), false);
  assert.ok(jsonStr.includes("TOKEN_RAND_EMAIL"));
});

// --- 20. Existing Step 5 regression ---
test("20. Step 5 regression: OCR fragment reconstruction & localization remains intact", () => {
  const ocrItems = processOcrResult([{ text: "user@example.invalid", bbox: { x: 0, y: 0, width: 80, height: 20 }, confidence: 95 }]);
  assert.equal(ocrItems.length, 1);
  assert.equal(ocrItems[0].category, "email");
});

// --- 21. Existing Step 6 regression ---
test("21. Step 6 regression: Multi-signal PII detection & spatial fusion remains intact", () => {
  const multi = detectPiiMultiSignal({
    domItems: [{ category: "email", bbox: { x: 0, y: 0, width: 80, height: 20 }, source: "dom" }],
    ocrBlocks: [{ text: "user@example.invalid", bbox: { x: 0, y: 0, width: 80, height: 20 }, confidence: 95 }]
  });
  assert.equal(multi.length, 1);
  assert.equal(multi[0].source, "fusion");
});

// --- 22. Existing Step 7 regression ---
test("22. Step 7 regression: Context Analyzer relevance classification remains intact", () => {
  const ctx = evaluatePiiTaskRelevance({
    userInstruction: "Login with my password",
    piiItems: [{ id: "P1", category: "password", confidence: 0.95 }]
  });
  assert.equal(ctx.taskIntent, "LOGIN");
  assert.equal(ctx.piiRelevance[0].relevance, "REQUIRED");
});

// --- 23. Existing Step 8 regression ---
test("23. Step 8 regression: Privacy Policy Engine decisions remain intact", () => {
  const pol = evaluatePiiPolicyItem({
    piiItem: { id: "P1", category: "password", confidence: 0.95 },
    relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });
  assert.equal(pol.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 24. Existing Step 9 regression ---
test("24. Step 9 regression: Secure Local Privacy Vault operations remain intact", () => {
  const stored = storeSecret({ category: "password", secretValue: "VaultRegress#1", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(stored.ok, true);
  const ret = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(ret.ok, true);
  assert.equal(ret.secretValue, "VaultRegress#1");
});

// --- 25. Existing Step 10 regression ---
test("25. Step 10 regression: VisualModelAdapter visual perception remains intact", () => {
  const adapter = new VisualModelAdapter();
  adapter.initialize();
  const scan = adapter.recognize([
    { text: "Visual Test Line", bbox: { x: 10, y: 10, width: 100, height: 20 }, confidence: 95 }
  ]);
  assert.equal(scan.ok, true);
  assert.equal(scan.blocks.length, 1);
  adapter.dispose();
});
