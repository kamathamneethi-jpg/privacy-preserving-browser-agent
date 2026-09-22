import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy,
  SanitizedContextBuilder,
  redactTextString,
  redactDomNodes,
  redactImageLocally,
  evaluateImagePiiPolicy,
  createLocalPrivacyVault,
  MultimodalVisionAgent,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  PROCESSING_DESTINATIONS,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  VAULT_PURPOSES
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// 1. PHASE 4 TESTS: A. ALLOW ENFORCEMENT
// =====================================================================

test("Phase 4 Test A — ALLOW: Public product/price/title preserved across DOM, remote payload, and screenshot", () => {
  const publicItem = {
    id: "prod_title_1",
    category: "product_title",
    confidence: 0.99,
    bbox: { x: 50, y: 100, width: 200, height: 30 }
  };
  const relevance = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
    semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
    relevanceConfidence: 0.95
  };

  const policy = evaluatePiiPolicyItem({
    piiItem: publicItem,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(policy.decision, POLICY_ACTIONS.ALLOW);

  // 1. DOM sanitization preserves text
  const domNode = {
    nodeId: "n_title",
    elementPath: "body/div/h1",
    text: "Wireless Noise Cancelling Headphones",
    bbox: publicItem.bbox
  };
  const domResult = redactDomNodes([domNode], [{ ...publicItem, nodeId: "n_title", start: 0, end: 36, type: "product_title" }], () => policy);
  assert.equal(domResult.sanitizedNodes[0].text, "Wireless Noise Cancelling Headphones");
  assert.equal(domResult.summary.totalRedactions, 0);

  // 2. Screenshot sanitization preserves pixels (no redact fill)
  const imageDet = { ...publicItem, policyDecision: policy };
  const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
  const imageResult = redactImageLocally(mockImage, [imageDet]);
  assert.equal(imageResult.redactedCount, 0, "ALLOW must not mask screenshot pixels");
  assert.equal(imageResult.sanitizedImage.drawOperations.length, 0);

  // 3. Remote reasoning payload preserves DOM node
  const builder = new SanitizedContextBuilder();
  builder.initialize();
  const contextResult = builder.buildSanitizedContext({
    domTree: { tag: "h1", text: "Wireless Noise Cancelling Headphones", attributes: {} },
    piiItems: [publicItem],
    policyDecisions: [policy],
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.ok(contextResult.ok);
  assert.equal(contextResult.payload.domTree.text, "Wireless Noise Cancelling Headphones");
});

// =====================================================================
// 2. PHASE 4 TESTS: B. TOKENIZE ENFORCEMENT
// =====================================================================

test("Phase 4 Test B — TOKENIZE: Sensitive entity tokenized in DOM/remote, masked in screenshot, retained in vault", () => {
  const sentinelEmail = "alice.smith.sih2026@secure-domain.org";
  const piiItem = {
    id: "email_item_1",
    category: "email",
    confidence: 0.98,
    bbox: { x: 100, y: 150, width: 220, height: 25 }
  };
  const relevance = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.95
  };

  const policy = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(policy.decision, POLICY_ACTIONS.TOKENIZE);
  assert.ok(policy.token && policy.token.startsWith("PII_TOKEN_EMAIL_"));

  // 1. Vault retains raw value locally
  const vault = createLocalPrivacyVault();
  const vaultRes = vault.storeSecretWithToken(policy.token, {
    category: "email",
    secretValue: sentinelEmail,
    purpose: VAULT_PURPOSES.LOCAL_ACTION
  });
  assert.ok(vaultRes.ok);

  const retrieved = vault.retrieveSecretByToken(policy.token, {
    purpose: VAULT_PURPOSES.LOCAL_ACTION,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.ok(retrieved.ok);
  assert.equal(retrieved.secretValue, sentinelEmail);

  // 2. DOM text replaced with token
  const domNode = {
    nodeId: "n_email",
    elementPath: "body/div/span",
    text: `Contact: ${sentinelEmail}`,
    bbox: piiItem.bbox
  };
  const domResult = redactDomNodes([domNode], [{ ...piiItem, nodeId: "n_email", start: 9, end: 9 + sentinelEmail.length, type: "email" }], () => policy);
  assert.ok(domResult.sanitizedNodes[0].text.includes(policy.token));
  assert.equal(domResult.sanitizedNodes[0].text.includes(sentinelEmail), false, "Raw email must NOT exist in sanitized DOM");

  // 3. Screenshot masks original sensitive pixels
  const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
  const imageResult = redactImageLocally(mockImage, [{ ...piiItem, policyDecision: policy }]);
  assert.equal(imageResult.redactedCount, 1);
  assert.equal(imageResult.sanitizedImage.drawOperations.length, 1);
  assert.equal(imageResult.sanitizedImage.drawOperations[0].op, "fillRect");

  // 4. Remote payload contains only token
  const builder = new SanitizedContextBuilder();
  builder.initialize();
  const contextResult = builder.buildSanitizedContext({
    domTree: { tag: "input", attributes: { name: "email", value: sentinelEmail } },
    piiItems: [piiItem],
    policyDecisions: [policy],
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.ok(contextResult.ok);
  const serializedPayload = JSON.stringify(contextResult.payload);
  assert.equal(serializedPayload.includes(sentinelEmail), false, "Raw email must NOT exist anywhere in remote payload");
  assert.ok(serializedPayload.includes(policy.token), "Opaque token must be present in remote payload");
});

// =====================================================================
// 3. PHASE 4 TESTS: C. REDACT ENFORCEMENT
// =====================================================================

test("Phase 4 Test C — REDACT: Unnecessary sensitive entity redacted in DOM/remote and masked in screenshot", () => {
  const sentinelPhone = "+91-9876543210";
  const piiItem = {
    id: "phone_item_1",
    category: "phone",
    confidence: 0.95,
    bbox: { x: 80, y: 200, width: 140, height: 20 }
  };
  const relevance = {
    taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
    taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.90
  };

  const policy = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(policy.decision, POLICY_ACTIONS.REDACT);

  // 1. DOM redaction
  const domNode = {
    nodeId: "n_phone",
    elementPath: "body/footer/p",
    text: `Support Phone: ${sentinelPhone}`,
    bbox: piiItem.bbox
  };
  const domResult = redactDomNodes([domNode], [{ ...piiItem, nodeId: "n_phone", start: 15, end: 15 + sentinelPhone.length, type: "phone" }], () => policy);
  assert.equal(domResult.sanitizedNodes[0].text.includes(sentinelPhone), false);
  assert.ok(domResult.sanitizedNodes[0].text.includes("[REDACTED]"));

  // 2. Screenshot mask
  const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
  const imageResult = redactImageLocally(mockImage, [{ ...piiItem, policyDecision: policy }]);
  assert.equal(imageResult.redactedCount, 1);
  assert.equal(imageResult.sanitizedImage.drawOperations.length, 1);

  // 3. Remote payload
  const builder = new SanitizedContextBuilder();
  builder.initialize();
  const contextResult = builder.buildSanitizedContext({
    domTree: { tag: "input", attributes: { name: "phone", value: sentinelPhone } },
    piiItems: [piiItem],
    policyDecisions: [policy],
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.ok(contextResult.ok);
  const serialized = JSON.stringify(contextResult.payload);
  assert.equal(serialized.includes(sentinelPhone), false);
  assert.ok(serialized.includes("[PHONE_REDACTED]"));
});

// =====================================================================
// 4. PHASE 4 TESTS: D. LOCAL_ONLY ENFORCEMENT
// =====================================================================

test("Phase 4 Test D — LOCAL_ONLY: Password/OTP/CVV strictly absent from remote context and masked in screenshot", () => {
  const sentinelPassword = "superSecretPassword_alpha_99#";
  const piiItem = {
    id: "pass_item_1",
    category: "password",
    confidence: 0.99,
    bbox: { x: 120, y: 300, width: 180, height: 35 }
  };
  const relevance = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
    semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
    relevanceConfidence: 0.99
  };

  const policy = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(policy.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(policy.token, undefined);

  // 1. Screenshot masked
  const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
  const imageResult = redactImageLocally(mockImage, [{ ...piiItem, policyDecision: policy }]);
  assert.equal(imageResult.redactedCount, 1);
  assert.equal(imageResult.sanitizedImage.drawOperations.length, 1);

  // 2. DOM replaced with [LOCAL_ONLY_PROTECTED]
  const builder = new SanitizedContextBuilder();
  builder.initialize();
  const contextResult = builder.buildSanitizedContext({
    domTree: { tag: "input", attributes: { type: "password", name: "password", value: sentinelPassword } },
    piiItems: [piiItem],
    policyDecisions: [policy],
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.ok(contextResult.ok);
  const serialized = JSON.stringify(contextResult.payload);
  assert.equal(serialized.includes(sentinelPassword), false);
  assert.ok(serialized.includes("[LOCAL_ONLY_PROTECTED]"));
});

// =====================================================================
// 5. PHASE 4 TESTS: E. CROSS-CHANNEL CONSISTENCY
// =====================================================================

test("Phase 4 Test E — Cross-Channel Consistency: One PolicyDecision enforced identically across DOM, Screenshot, and Payload", () => {
  const testEntities = [
    {
      piiItem: { id: "p1", category: "product_title", confidence: 0.99, bbox: { x: 10, y: 10, width: 100, height: 20 } },
      relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE, semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE, relevanceConfidence: 0.99 },
      expectedDecision: POLICY_ACTIONS.ALLOW
    },
    {
      piiItem: { id: "p2", category: "email", confidence: 0.98, bbox: { x: 10, y: 50, width: 150, height: 20 } },
      relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED, semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER, relevanceConfidence: 0.95 },
      expectedDecision: POLICY_ACTIONS.TOKENIZE
    },
    {
      piiItem: { id: "p3", category: "phone", confidence: 0.95, bbox: { x: 10, y: 90, width: 120, height: 20 } },
      relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY, semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER, relevanceConfidence: 0.90 },
      expectedDecision: POLICY_ACTIONS.REDACT
    },
    {
      piiItem: { id: "p4", category: "password", confidence: 0.99, bbox: { x: 10, y: 130, width: 140, height: 25 } },
      relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY, semanticRole: SEMANTIC_ROLES.AUTH_SECRET, relevanceConfidence: 0.99 },
      expectedDecision: POLICY_ACTIONS.LOCAL_ONLY
    }
  ];

  for (const { piiItem, relevanceItem, expectedDecision } of testEntities) {
    const policy = evaluatePiiPolicyItem({
      piiItem,
      relevanceItem,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    assert.equal(policy.decision, expectedDecision, `Entity ${piiItem.category} policy decision mismatch`);

    // Channel 1: Screenshot evaluation
    const imagePolicy = evaluateImagePiiPolicy(piiItem, {
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
      relevanceItem
    });
    assert.equal(imagePolicy.decision, expectedDecision, `Screenshot policy decision mismatch for ${piiItem.category}`);

    // Channel 2: DOM sanitization
    const domNode = { nodeId: `n_${piiItem.id}`, elementPath: "div/span", text: `Value: sample_${piiItem.category}`, bbox: piiItem.bbox };
    const domRes = redactDomNodes([domNode], [{ ...piiItem, nodeId: `n_${piiItem.id}`, start: 7, end: 7 + `sample_${piiItem.category}`.length, type: piiItem.category }], () => policy);

    if (expectedDecision === POLICY_ACTIONS.ALLOW) {
      assert.equal(domRes.summary.totalRedactions, 0);
    } else {
      assert.ok(domRes.summary.totalRedactions > 0);
    }
  }
});

// =====================================================================
// 6. PHASE 4 TESTS: F. RAW-VALUE LEAK TEST (SENTINELS)
// =====================================================================

test("Phase 4 Test F — Raw-Value Leak Test: Unique sentinels cannot appear in outbound representations", () => {
  const sentinels = {
    email: "TEST_SECRET_EMAIL_987654@privacy-guard.org",
    password: "TEST_SECRET_PASSWORD_987654_xyz!",
    cvv: "987",
    card: "4111 2222 3333 4444"
  };

  const piiItems = [
    { id: "e1", category: "email", confidence: 0.99, value: sentinels.email, bbox: { x: 10, y: 10, width: 100, height: 20 } },
    { id: "p1", category: "password", confidence: 0.99, value: sentinels.password, bbox: { x: 10, y: 40, width: 100, height: 20 } },
    { id: "c1", category: "cvv", confidence: 0.99, value: sentinels.cvv, bbox: { x: 10, y: 70, width: 50, height: 20 } },
    { id: "cc1", category: "payment_card", confidence: 0.99, value: sentinels.card, bbox: { x: 10, y: 100, width: 160, height: 20 } }
  ];

  const batchPolicy = evaluateBatchPrivacyPolicy({
    piiItems,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  const builder = new SanitizedContextBuilder();
  builder.initialize();

  const contextResult = builder.buildSanitizedContext({
    domTree: {
      tag: "form",
      children: [
        { tag: "input", attributes: { name: "email", value: sentinels.email } },
        { tag: "input", attributes: { name: "password", type: "password", value: sentinels.password } },
        { tag: "input", attributes: { name: "cvv", value: sentinels.cvv } },
        { tag: "input", attributes: { name: "card", value: sentinels.card } }
      ]
    },
    piiItems,
    policyDecisions: batchPolicy,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.ok(contextResult.ok);
  const serialized = JSON.stringify(contextResult.payload);

  for (const [name, secret] of Object.entries(sentinels)) {
    assert.equal(serialized.includes(secret), false, `Sentinel secret '${name}' leaked in serialized remote payload!`);
  }

  // Multimodal Vision Messages assertion
  const messages = MultimodalVisionAgent.buildMultimodalMessages({
    goal: { summary: "Test task" },
    interactiveElements: [
      { id: "el_1", tag: "input", name: "email", value: sentinels.email },
      { id: "el_2", tag: "input", name: "password", value: sentinels.password }
    ],
    sanitizedDomContext: serialized,
    rawPiiValues: Object.values(sentinels)
  });

  const serializedMessages = JSON.stringify(messages);
  for (const [name, secret] of Object.entries(sentinels)) {
    assert.equal(serializedMessages.includes(secret), false, `Sentinel secret '${name}' leaked in MultimodalVisionAgent messages!`);
  }
});

// =====================================================================
// 7. PHASE 4 TESTS: G. DECISION IMMUTABILITY
// =====================================================================

test("Phase 4 Test G — Decision Immutability: Downstream sanitizers cannot alter policy decisions", () => {
  const policyAllow = Object.freeze(evaluatePiiPolicyItem({
    piiItem: { id: "p_title", category: "product_title", confidence: 0.99 },
    relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE, semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  }));

  const policyRedact = Object.freeze(evaluatePiiPolicyItem({
    piiItem: { id: "p_phone", category: "phone", confidence: 0.95 },
    relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY, semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  }));

  const policyLocalOnly = Object.freeze(evaluatePiiPolicyItem({
    piiItem: { id: "p_pass", category: "password", confidence: 0.99 },
    relevanceItem: { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY, semanticRole: SEMANTIC_ROLES.AUTH_SECRET },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  }));

  // Assert objects are frozen
  assert.ok(Object.isFrozen(policyAllow));
  assert.ok(Object.isFrozen(policyRedact));
  assert.ok(Object.isFrozen(policyLocalOnly));

  // Assert properties cannot be mutated
  assert.throws(() => {
    policyAllow.decision = POLICY_ACTIONS.TOKENIZE;
  }, /Cannot assign to read only property/);

  assert.throws(() => {
    policyRedact.decision = POLICY_ACTIONS.ALLOW;
  }, /Cannot assign to read only property/);

  assert.throws(() => {
    policyLocalOnly.decision = POLICY_ACTIONS.TOKENIZE;
  }, /Cannot assign to read only property/);
});

// =====================================================================
// 8. PHASE 4 TESTS: H. DESTINATION SEPARATION
// =====================================================================

test("Phase 4 Test H — Destination Separation: Local browser authorization does not authorize remote disclosure", () => {
  const sensitiveEmail = { id: "p_email_auth", category: "email", confidence: 0.95 };
  const relevance = {
    taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
    taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
    semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
    relevanceConfidence: 0.95
  };

  // 1. Local Browser destination with user authorization -> ALLOW (for local execution only)
  const localDecision = evaluatePiiPolicyItem({
    piiItem: sensitiveEmail,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(localDecision.decision, POLICY_ACTIONS.ALLOW);

  // 2. Remote Reasoning destination with same input -> LOCAL_ONLY (Never ALLOW or TOKENIZE)
  const remoteDecision = evaluatePiiPolicyItem({
    piiItem: sensitiveEmail,
    relevanceItem: relevance,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true } // Attempting to pass local auth to remote
  });
  assert.equal(remoteDecision.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(remoteDecision.token, undefined);
  assert.ok(remoteDecision.reasonCodes.includes(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED));
});
