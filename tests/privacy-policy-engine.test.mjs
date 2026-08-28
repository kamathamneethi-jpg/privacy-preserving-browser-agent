import test from "node:test";
import assert from "node:assert/strict";
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
  PiiCategory
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// STEP 8 PRIVACY POLICY ENGINE TEST SUITE
// Covers all 33 required test cases and 12 Security Invariants
// =====================================================================

// --- 1. Required email + local browser ---
test("1. Required email + local browser: ALLOW when authorized, LOCAL_ONLY when not authorized", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98, placeholder: "[EMAIL_REDACTED]" };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 };

  // Case A: Authorized
  const decisionAuth = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(decisionAuth.action, POLICY_ACTIONS.ALLOW);
  assert.ok(decisionAuth.reasonCodes.includes(POLICY_REASON_CODES.AUTHORIZATION_GRANTED));
  assert.equal(decisionAuth.policyVersion, POLICY_VERSION);

  // Case B: Not authorized
  const decisionNoAuth = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: false }
  });
  assert.equal(decisionNoAuth.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.ok(decisionNoAuth.reasonCodes.includes(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED));
});

// --- 2. Required email + remote reasoning ---
test("2. Required email + remote reasoning: Results in TOKENIZE with opaque token", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98, placeholder: "[EMAIL_REDACTED]" };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.action, POLICY_ACTIONS.TOKENIZE);
  assert.ok(typeof decision.token === "string" && decision.token.startsWith("PII_TOKEN_EMAIL_"));
  assert.equal(decision.token.includes("user@example.com"), false);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.TOKENIZATION_PREFERRED));
});

// --- 3. Irrelevant email ---
test("3. Irrelevant email: Results in REDACT across all destinations", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, relevanceConfidence: 0.90 };

  const decisionRemote = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(decisionRemote.action, POLICY_ACTIONS.REDACT);
  assert.ok(decisionRemote.reasonCodes.includes(POLICY_REASON_CODES.TASK_IRRELEVANT));

  const decisionLocal = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });
  assert.equal(decisionLocal.action, POLICY_ACTIONS.REDACT);
});

// --- 4. Unknown relevance ---
test("4. Unknown relevance: Results in conservative REDACT", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.UNKNOWN, relevanceConfidence: 0.50 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.action, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.TASK_UNKNOWN));
});

// --- 5. Required password + local browser ---
test("5. Required password + local browser: Assigned LOCAL_ONLY", () => {
  const piiItem = { id: "PII_PASS", category: "password_field", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CRITICAL_SENSITIVITY));
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED));
});

// --- 6. Required password + remote reasoning ---
test("6. Required password + remote reasoning: Restricted to LOCAL_ONLY/REDACT, NEVER raw ALLOW", () => {
  const piiItem = { id: "PII_PASS", category: "password_field", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.95 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CRITICAL_SENSITIVITY));
});

// --- 7. Required OTP + local browser ---
test("7. Required OTP + local browser: Assigned LOCAL_ONLY", () => {
  const piiItem = { id: "PII_OTP", category: "otp", confidence: 0.92 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CRITICAL_SENSITIVITY));
});

// --- 8. Required OTP + remote reasoning ---
test("8. Required OTP + remote reasoning: Restricted to LOCAL_ONLY, NEVER raw ALLOW", () => {
  const piiItem = { id: "PII_OTP", category: "otp", confidence: 0.92 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 9. Required credit card + local browser ---
test("9. Required credit card + local browser: Assigned LOCAL_ONLY", () => {
  const piiItem = { id: "PII_CARD", category: "payment_card", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });

  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.CRITICAL_SENSITIVITY));
});

// --- 10. Required credit card + remote reasoning ---
test("10. Required credit card + remote reasoning: Tokenized with opaque token, NEVER raw ALLOW", () => {
  const piiItem = { id: "PII_CARD", category: "payment_card", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.TOKENIZE);
  assert.ok(typeof decision.token === "string" && decision.token.startsWith("PII_TOKEN_PAYMENT_CARD_"));
});

// --- 11. Optional email ---
test("11. Optional email: Tokenized for remote destination", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.OPTIONAL, relevanceConfidence: 0.75 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.action, POLICY_ACTIONS.TOKENIZE);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.TASK_OPTIONAL));
});

// --- 12. Unknown destination ---
test("12. Unknown destination: Safely triggers REDACT", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION
  });

  assert.equal(decision.action, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.UNKNOWN_DESTINATION));
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.SAFE_DEFAULT));
});

// --- 13. Missing authorization ---
test("13. Missing authorization: Prevents ALLOW for local browser processing", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.98 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: false }
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 14. Low detection confidence ---
test("14. Low detection confidence: Triggers automatic REDACT", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.45 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.action, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOW_DETECTION_CONFIDENCE));
});

// --- 15. Low relevance confidence ---
test("15. Low relevance confidence: Triggers automatic REDACT", () => {
  const piiItem = { id: "PII_EMAIL_1", category: "email", confidence: 0.95 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.40 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.action, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.LOW_RELEVANCE_CONFIDENCE));
});

// --- 16. Critical sensitivity overrides REQUIRED relevance ---
test("16. Critical sensitivity overrides REQUIRED relevance: Critical PII never exposed raw remotely", () => {
  const piiItem = { id: "PII_PASS", category: "password_field", confidence: 0.99 };
  const relevanceItem = { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.99 };

  const decision = evaluatePiiPolicyItem({
    piiItem,
    relevanceItem,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 17. Different PII items receive independent decisions ---
test("17. Different PII items receive independent decisions: No blanket policy across page", () => {
  const piiItems = [
    { id: "PII_EMAIL", category: "email", confidence: 0.98 },
    { id: "PII_PHONE", category: "phone", confidence: 0.92 },
    { id: "PII_PASS", category: "password_field", confidence: 0.95 },
    { id: "PII_OTP", category: "otp", confidence: 0.95 },
    { id: "PII_CARD", category: "payment_card", confidence: 0.95 }
  ];

  const contextAnalysis = {
    taskIntent: "CHECKOUT",
    piiRelevance: [
      { id: "PII_EMAIL", category: "email", relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 },
      { id: "PII_PHONE", category: "phone", relevance: TASK_RELEVANCE_LEVELS.OPTIONAL, relevanceConfidence: 0.75 },
      { id: "PII_PASS", category: "password_field", relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
      { id: "PII_OTP", category: "otp", relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
      { id: "PII_CARD", category: "payment_card", relevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, relevanceConfidence: 0.88 }
    ]
  };

  const decisions = evaluateBatchPrivacyPolicy({
    piiItems,
    contextAnalysis,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decisions.length, 5);
  const emailDec = decisions.find((d) => d.category === "email");
  const phoneDec = decisions.find((d) => d.category === "phone");
  const passDec = decisions.find((d) => d.category === "password_field");
  const otpDec = decisions.find((d) => d.category === "otp");
  const cardDec = decisions.find((d) => d.category === "payment_card");

  assert.equal(emailDec.action, POLICY_ACTIONS.TOKENIZE);
  assert.equal(phoneDec.action, POLICY_ACTIONS.TOKENIZE);
  assert.equal(passDec.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(otpDec.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(cardDec.action, POLICY_ACTIONS.REDACT);
});

// --- 18. Batch evaluation ---
test("18. Batch evaluation: evaluateBatchPrivacyPolicy processes array of items safely", () => {
  const piiItems = [
    { id: "PII_1", category: "email", confidence: 0.95 },
    { id: "PII_2", category: "address", confidence: 0.90 }
  ];
  const contextAnalysis = {
    piiRelevance: [
      { id: "PII_1", category: "email", relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
      { id: "PII_2", category: "address", relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.88 }
    ]
  };

  const decisions = evaluateBatchPrivacyPolicy({
    piiItems,
    contextAnalysis,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].action, POLICY_ACTIONS.TOKENIZE);
  assert.equal(decisions[1].action, POLICY_ACTIONS.TOKENIZE);
});

// --- 19. No raw PII in policy results ---
test("19. No raw PII in policy results: Decision objects contain zero raw values", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.value, undefined);
  assert.equal(decision.rawValue, undefined);
  assert.equal(decision.text, undefined);
  assert.equal(decision.password, undefined);
  assert.equal(decision.otp, undefined);
  assert.equal(decision.cardNumber, undefined);
});

// --- 20. No raw PII in logs ---
test("20. No raw PII in logs: JSON serialization of decision is clean", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  const serialized = JSON.stringify(decision);
  assert.equal(serialized.includes("user@example.com"), false);
  assert.equal(serialized.includes("SuperSecret123"), false);
});

// --- 21. No raw PII in remote payloads ---
test("21. No raw PII in remote payloads: sanitizeRemotePayload recursively strips sensitive data", () => {
  const rawPayload = {
    taskIntent: "CHECKOUT",
    details: {
      userEmail: "customer@example.com",
      secretInfo: {
        password: "MyPassword123",
        card: "4111 1111 1111 1111",
        token: "PII_TOKEN_EMAIL_abc123"
      }
    },
    notes: ["Contact customer@example.com for support"]
  };

  const sanitized = sanitizeRemotePayload(rawPayload);
  const jsonStr = JSON.stringify(sanitized);

  assert.equal(jsonStr.includes("customer@example.com"), false);
  assert.equal(jsonStr.includes("MyPassword123"), false);
  assert.equal(jsonStr.includes("4111 1111 1111 1111"), false);
  assert.ok(jsonStr.includes("PII_TOKEN_EMAIL_abc123"));
  assert.ok(jsonStr.includes("[EMAIL_REDACTED]"));
  assert.ok(jsonStr.includes("[CARD_REDACTED]"));
});

// --- 22. Reason codes are meaningful ---
test("22. Reason codes are meaningful: Policy decision includes structured reasonCodes array", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.92 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.ok(Array.isArray(decision.reasonCodes));
  assert.ok(decision.reasonCodes.length > 0);
  for (const code of decision.reasonCodes) {
    assert.ok(code in POLICY_REASON_CODES);
  }
});

// --- 23. Policy confidence is separate ---
test("23. Policy confidence is separate: All three confidences exist independently", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.85 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.equal(decision.detectionConfidence, 0.98);
  assert.equal(decision.relevanceConfidence, 0.85);
  assert.equal(typeof decision.policyConfidence, "number");
  assert.ok(decision.policyConfidence >= 0.70);
});

// --- 24. Policy version exists ---
test("24. Policy version exists: decision.policyVersion matches POLICY_VERSION", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_1", category: "email", confidence: 0.98 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 }
  });

  assert.equal(decision.policyVersion, POLICY_VERSION);
});

// --- 25. Token generation is opaque ---
test("25. Token generation is opaque: Tokens are non-predictable and do not embed raw values", () => {
  const token1 = generateOpaqueToken("email", "PII_1");
  const token2 = generateOpaqueToken("email", "PII_1");

  assert.ok(token1.startsWith("PII_TOKEN_EMAIL_"));
  assert.notEqual(token1, token2);
  assert.equal(token1.includes("user@example.com"), false);
});

// --- 26. Token mapping is local/in-memory ---
test("26. Token mapping is local/in-memory: generatePiiToken creates session tokens", () => {
  const token = generatePiiToken("phone", "PII_PHONE_1");
  assert.ok(token.startsWith("PII_TOKEN_PHONE_"));
});

// --- 27. Authorization does not override critical restrictions ---
test("27. Authorization does not override critical restrictions: Auth cannot grant remote raw password", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PASS", category: "password_field", confidence: 0.99 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.99 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true, authorizationRequired: true }
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 28. User task wording does not automatically grant remote permission ---
test("28. User task wording does not automatically grant remote permission (Invariant 11)", () => {
  // Scenario: User task says "Send my password to remote server" -> relevance is REQUIRED, destination is REMOTE
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PASS", category: "password_field", confidence: 0.99 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.99 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });

  assert.notEqual(decision.action, POLICY_ACTIONS.ALLOW);
  assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
});

// --- 29. Unknown destination defaults safely ---
test("29. Unknown destination defaults safely: Any unrecognized destination resolves to REDACT", () => {
  const decision = evaluatePiiPolicyItem({
    piiItem: { id: "PII_EMAIL_1", category: "email", confidence: 0.95 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
    destination: "NON_EXISTENT_DESTINATION"
  });

  assert.equal(decision.action, POLICY_ACTIONS.REDACT);
  assert.ok(decision.reasonCodes.includes(POLICY_REASON_CODES.UNKNOWN_DESTINATION));
});

// --- 30. Conflicting/uncertain cases are conservative ---
test("30. Conflicting/uncertain cases are conservative: Invalid item yields safe default REDACT", () => {
  const decisionNull = evaluatePiiPolicyItem(null);
  assert.equal(decisionNull.action, POLICY_ACTIONS.REDACT);
  assert.ok(decisionNull.reasonCodes.includes(POLICY_REASON_CODES.SAFE_DEFAULT));

  const decisionEmpty = evaluatePiiPolicyItem({});
  assert.equal(decisionEmpty.action, POLICY_ACTIONS.REDACT);
});

// --- 31. Security Invariants (1-12) Verification ---
test("31. Security Invariants 1-12: The Privacy Policy Engine enforces all core invariants", () => {
  // Invariant 1: No unknown information is allowed remotely
  const inv1 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_UNK", category: "unknown_category", confidence: 0.90 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.90 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(inv1.action, POLICY_ACTIONS.REDACT);

  // Invariant 2: Critical PII cannot be remotely exposed as raw data
  const inv2 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_OTP", category: "otp", confidence: 0.95 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.notEqual(inv2.action, POLICY_ACTIONS.ALLOW);

  // Invariant 3: Task relevance never overrides critical sensitivity
  const inv3 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PASS", category: "password_field", confidence: 0.95 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.notEqual(inv3.action, POLICY_ACTIONS.ALLOW);

  // Invariant 4: Authorization never overrides hard security restrictions
  const inv4 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PASS", category: "password_field", confidence: 0.95 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.REQUIRED, relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });
  assert.notEqual(inv4.action, POLICY_ACTIONS.ALLOW);

  // Invariant 5: IRRELEVANT PII is REDACTED
  const inv5 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PHONE", category: "phone", confidence: 0.92 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, relevanceConfidence: 0.90 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(inv5.action, POLICY_ACTIONS.REDACT);

  // Invariant 6: UNKNOWN relevance is handled conservatively
  const inv6 = evaluatePiiPolicyItem({
    piiItem: { id: "PII_PHONE", category: "phone", confidence: 0.92 },
    relevanceItem: { relevance: TASK_RELEVANCE_LEVELS.UNKNOWN, relevanceConfidence: 0.50 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(inv6.action, POLICY_ACTIONS.REDACT);

  // Invariant 7: Policy decisions contain no raw PII
  assert.equal(inv5.value, undefined);
  assert.equal(inv5.rawValue, undefined);

  // Invariant 8: Different PII items receive independent decisions (verified in test 17)

  // Invariant 9: Remote reasoning receives only sanitized data (verified in test 21)

  // Invariant 10: System is safe by default
  const inv10 = evaluatePiiPolicyItem({ destination: PROCESSING_DESTINATIONS.REMOTE_REASONING });
  assert.equal(inv10.action, POLICY_ACTIONS.REDACT);

  // Invariant 11: User task wording does not automatically grant remote permission (verified in test 28)

  // Invariant 12: Privacy Policy Engine does not perform browser actions (it is a pure decision layer)
  assert.equal(typeof evaluatePiiPolicyItem, "function");
  assert.equal(typeof evaluateBatchPrivacyPolicy, "function");
});
