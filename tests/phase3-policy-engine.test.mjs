import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy,
  generateOpaqueToken,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  PROCESSING_DESTINATIONS,
  SENSITIVITY_LEVELS,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  PiiCategory,
  POLICY_VERSION
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// 1. CRITICAL SECURITY TESTS (TESTS A - C)
// =====================================================================

test("Test A — Critical secret override: Password with REMOTE_REASONING_REQUIRED yields LOCAL_ONLY", () => {
  const piiItem = { id: "P_PASS", category: "password", confidence: 0.99 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED, // Adversarial attempt to request remote reasoning
    semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
    relevanceConfidence: 0.99
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(decision.token, undefined, "Critical secret must NEVER receive an opaque token for remote export");
  assert.equal(decision.placeholder, "[LOCAL_ONLY_PROTECTED]");
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CRITICAL_SECRET_LOCAL_ONLY));
});

test("Test B — OTP override: One-time passcode yields LOCAL_ONLY across remote destinations", () => {
  const piiItem = { id: "P_OTP", category: "otp", confidence: 0.95 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
    relevanceConfidence: 0.95
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(decision.token, undefined);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED));
});

test("Test C — CVV override: Card verification code yields LOCAL_ONLY", () => {
  const piiItem = { id: "P_CVV", category: "cvv", confidence: 0.96 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
    relevanceConfidence: 0.95
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(decision.token, undefined);
});

// =====================================================================
// 2. SENSITIVE DATA REASONING & TOKENIZATION (TESTS D - E)
// =====================================================================

test("Test D — Sensitive remote reasoning: Email required for task yields TOKENIZE with opaque token", () => {
  const piiItem = { id: "P_EMAIL", category: "email", confidence: 0.98 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.94
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.TOKENIZE);
  assert.ok(typeof decision.token === "string" && decision.token.startsWith("PII_TOKEN_EMAIL_"));
  assert.equal(decision.token.includes("user@example.com"), false);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.TOKENIZATION_PREFERRED));
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CONFIDENTIAL_DATA_TOKENIZED));
});

test("Test E — Irrelevant sensitive data: Unnecessary phone number yields REDACT", () => {
  const piiItem = { id: "P_PHONE", category: "phone", confidence: 0.92 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
    taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.90
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.REDACT);
  assert.equal(decision.token, undefined);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.TASK_IRRELEVANT) || decision.reasonCodes.includes(POLICY_REASON_CODES.UNNECESSARY_DATA_REDACTED));
});

// =====================================================================
// 3. PUBLIC SAFE CONTEXT (TESTS F & I)
// =====================================================================

test("Test F & I — Public safe context: Product title and price yield ALLOW and avoid blanket redaction", () => {
  const titleItem = { id: "TITLE_1", category: "product_title", confidence: 0.99 };
  const titleRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
    semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
    relevanceConfidence: 0.95
  };

  const titleDecision = evaluatePiiPolicyItem({
    piiItem: titleItem,
    relevanceItem: titleRel,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(titleDecision.decision, POLICY_ACTIONS.ALLOW);
  assert.ok(titleDecision.reasonCodes.includes(POLICY_REASON_CODES.PUBLIC_DATA_ALLOWED));

  const priceItem = { id: "PRICE_1", category: "price", confidence: 0.99 };
  const priceRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
    semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
    relevanceConfidence: 0.95
  };

  const priceDecision = evaluatePiiPolicyItem({
    piiItem: priceItem,
    relevanceItem: priceRel,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(priceDecision.decision, POLICY_ACTIONS.ALLOW);
});

// =====================================================================
// 4. UNCERTAINTY, LOW CONFIDENCE & DESTINATION GUARDS (TESTS G - H)
// =====================================================================

test("Test G — Unknown destination: Yields safe REDACT", () => {
  const piiItem = { id: "P_EMAIL", category: "email", confidence: 0.98 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.90
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: "UNKNOWN_EXTERNAL_NETWORK"
  });

  assert.equal(decision.decision, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.UNKNOWN_DESTINATION));
});

test("Test H — Low confidence: Detection or relevance below threshold yields safe REDACT", () => {
  const piiItem = { id: "P_LOW_CONF", category: "email", confidence: 0.40 }; // below 0.60 threshold
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.95
  };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOW_DETECTION_CONFIDENCE));
});

// =====================================================================
// 5. SEMANTIC ROLE & NECESSITY VARIATIONS (TESTS J - K)
// =====================================================================

test("Test J — Same category, different semantic roles: Email as ACCOUNT_IDENTIFIER vs RECIPIENT", () => {
  const accountEmail = { id: "E_ACC", category: "email", confidence: 0.95 };
  const accountRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.95
  };

  const accDecision = evaluatePiiPolicyItem({ piiItem: accountEmail, relevanceItem: accountRel });
  assert.equal(accDecision.decision, POLICY_ACTIONS.TOKENIZE);
  assert.equal(accDecision.semanticRole, SEMANTIC_ROLES.ACCOUNT_IDENTIFIER);

  const recipientEmail = { id: "E_REC", category: "email", confidence: 0.95 };
  const recipientRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.RECIPIENT,
    relevanceConfidence: 0.95
  };

  const recDecision = evaluatePiiPolicyItem({ piiItem: recipientEmail, relevanceItem: recipientRel });
  assert.equal(recDecision.decision, POLICY_ACTIONS.TOKENIZE);
  assert.equal(recDecision.semanticRole, SEMANTIC_ROLES.RECIPIENT);
});

test("Test K — Same entity, different necessity: Address required for shipping yields TOKENIZE, unnecessary yields REDACT", () => {
  const addressItem = { id: "ADDR_1", category: "address", confidence: 0.92 };

  // Case 1: Required for shipping
  const shipRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.SHIPPING_INFO,
    relevanceConfidence: 0.92
  };
  const shipDecision = evaluatePiiPolicyItem({ piiItem: addressItem, relevanceItem: shipRel });
  assert.equal(shipDecision.decision, POLICY_ACTIONS.TOKENIZE);

  // Case 2: Unnecessary address on article page
  const unnecRel = {
    taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
    taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
    semanticRole: SEMANTIC_ROLES.SHIPPING_INFO,
    relevanceConfidence: 0.92
  };
  const unnecDecision = evaluatePiiPolicyItem({ piiItem: addressItem, relevanceItem: unnecRel });
  assert.equal(unnecDecision.decision, POLICY_ACTIONS.REDACT);
});

// =====================================================================
// 6. PHASE 3.1 GENERALIZATION & UNSEEN COMBINATIONS MATRIX
// =====================================================================

test("Phase 3.1 Generalization Matrix — Exercises unseen combinations across dimensions", () => {
  // 1. EMAIL + ACCOUNT_IDENTIFIER + LOCAL_EXECUTION_ONLY -> LOCAL_ONLY
  const d1 = evaluatePiiPolicyItem({
    piiItem: { id: "p1", category: "email", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
      semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d1.decision, POLICY_ACTIONS.LOCAL_ONLY);

  // 2. EMAIL + RECIPIENT + REMOTE_REASONING_REQUIRED -> TOKENIZE
  const d2 = evaluatePiiPolicyItem({
    piiItem: { id: "p2", category: "email", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.RECIPIENT,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d2.decision, POLICY_ACTIONS.TOKENIZE);

  // 3. EMAIL + RECIPIENT + UNNECESSARY -> REDACT
  const d3 = evaluatePiiPolicyItem({
    piiItem: { id: "p3", category: "email", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
      taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      semanticRole: SEMANTIC_ROLES.RECIPIENT,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d3.decision, POLICY_ACTIONS.REDACT);

  // 4. ADDRESS + SHIPPING_INFO + REMOTE_REASONING_REQUIRED -> TOKENIZE
  const d4 = evaluatePiiPolicyItem({
    piiItem: { id: "p4", category: "address", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.SHIPPING_INFO,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d4.decision, POLICY_ACTIONS.TOKENIZE);

  // 5. ADDRESS + BILLING_INFO + UNNECESSARY -> REDACT
  const d5 = evaluatePiiPolicyItem({
    piiItem: { id: "p5", category: "address", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
      taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      semanticRole: SEMANTIC_ROLES.BILLING_INFO,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d5.decision, POLICY_ACTIONS.REDACT);

  // 6. PUBLIC_ATTRIBUTE + CONTEXTUAL_REFERENCE -> ALLOW
  const d6 = evaluatePiiPolicyItem({
    piiItem: { id: "p6", category: "product_title", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
      semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d6.decision, POLICY_ACTIONS.ALLOW);

  // 7. PUBLIC_ATTRIBUTE + UNNECESSARY -> REDACT (Strict minimization)
  const d7 = evaluatePiiPolicyItem({
    piiItem: { id: "p7", category: "product_title", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
      taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d7.decision, POLICY_ACTIONS.REDACT, "Public attribute that is unnecessary must be redacted under minimization");

  // 8. GENERAL_DATA + UNKNOWN -> REDACT
  const d8 = evaluatePiiPolicyItem({
    piiItem: { id: "p8", category: "custom_entity", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.UNKNOWN,
      taskNecessity: TASK_NECESSITY_LEVELS.UNKNOWN,
      semanticRole: SEMANTIC_ROLES.GENERAL_DATA,
      relevanceConfidence: 0.50
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(d8.decision, POLICY_ACTIONS.REDACT);
});

// =====================================================================
// 7. DETERMINISM & CONFIDENCE TESTS
// =====================================================================

test("Phase 3.1 Determinism — Repeated 100x evaluation produces strictly identical policy decisions", () => {
  const input = {
    piiItem: { id: "det_1", category: "email", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
      relevanceConfidence: 0.95
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  };

  const baseline = evaluatePiiPolicyItem(input);

  for (let i = 0; i < 100; i++) {
    const next = evaluatePiiPolicyItem(input);
    assert.equal(next.decision, baseline.decision);
    assert.equal(next.action, baseline.action);
    assert.equal(next.category, baseline.category);
    assert.equal(next.taskNecessity, baseline.taskNecessity);
    assert.equal(next.taskRelevance, baseline.taskRelevance);
    assert.equal(next.semanticRole, baseline.semanticRole);
    assert.equal(next.policyConfidence, baseline.policyConfidence);
    assert.deepEqual(next.reasonCodes, baseline.reasonCodes);
  }
});

test("Phase 3.1 Low Necessity Confidence — Low necessity confidence triggers safe REDACT", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "p_low_nec", category: "email", confidence: 0.95 },
    relevanceItem: {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
      relevanceConfidence: 0.95,
      necessityConfidence: 0.35 // Below 0.60 threshold
    },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.decision, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOW_POLICY_CONFIDENCE));
});

test("Phase 3.1 Local Execution vs Remote Disclosure — Invariant enforcement", () => {
  const piiItem = { id: "p_local_exec", category: "email", confidence: 0.95 };
  const relevanceItem = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.95
  };

  // 1. Sent to Remote -> LOCAL_ONLY (Never ALLOW or TOKENIZE)
  const remoteDec = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(remoteDec.decision, POLICY_ACTIONS.LOCAL_ONLY);

  // 2. Sent to Local Browser with user authorization -> ALLOW
  const localAuthDec = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(localAuthDec.decision, POLICY_ACTIONS.ALLOW);

  // 3. Sent to Local Browser without authorization -> LOCAL_ONLY
  const localUnauthDec = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: false }
  });
  assert.equal(localUnauthDec.decision, POLICY_ACTIONS.LOCAL_ONLY);
});

// =====================================================================
// 8. ZERO RAW SECRET LEAKAGE (TEST L)
// =====================================================================

test("Test L — Zero Raw Secret Leakage: Complete serialization asserts zero raw secrets in all fields", () => {
  const secretPassword = "superSecretPassword_xyz99!";
  const secretCard = "4111 2222 3333 4444";
  const secretEmail = "top_secret_agent@classified.gov";

  const piiItems = [
    { id: "P1", category: "password", confidence: 0.99, value: secretPassword },
    { id: "P2", category: "payment_card", confidence: 0.98, value: secretCard },
    { id: "P3", category: "email", confidence: 0.98, value: secretEmail }
  ];

  const batchDecisions = evaluateBatchPrivacyPolicy({
    piiItems,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  const serialized = JSON.stringify(batchDecisions);

  assert.equal(serialized.includes(secretPassword), false, "Raw password must NEVER appear in policy decision");
  assert.equal(serialized.includes(secretCard), false, "Raw card number must NEVER appear in policy decision");
  assert.equal(serialized.includes(secretEmail), false, "Raw email must NEVER appear in policy decision");

  for (const dec of batchDecisions) {
    assert.ok(dec.decision, "Each item must have a decision");
    assert.ok(dec.id, "Each item must have an id");
    assert.ok(dec.category, "Each item must have a category");
    assert.ok(Array.isArray(dec.reasonCodes), "Each item must have structured reason codes");
  }
});
