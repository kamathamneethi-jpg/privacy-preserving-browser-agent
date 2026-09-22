import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTaskIntent,
  evaluatePiiTaskRelevance,
  inferSemanticRole,
  determineTaskNecessity,
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  SENSITIVITY_LEVELS,
  PiiCategory
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// 1. RELEVANCE != NECESSITY SEPARATION TESTS
// =====================================================================

test("1. Relevance != Necessity: Password required for login has LOCAL_EXECUTION_ONLY necessity (never remote)", () => {
  const piiItems = [{ id: "PII_PASS", category: "password_field", confidence: 0.95 }];
  const domSemantics = [{ category: "password_field", type: "password", name: "user_password" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Login to account with my credentials",
    piiItems,
    domSemantics
  });

  const passItem = result.piiRelevance[0];
  assert.equal(passItem.taskRelevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.equal(passItem.taskNecessity, TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY);
  assert.notEqual(passItem.taskNecessity, TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED);
  assert.equal(passItem.semanticRole, SEMANTIC_ROLES.AUTH_SECRET);
});

test("2. Relevance != Necessity: Email required for login has REMOTE_REASONING_REQUIRED necessity", () => {
  const piiItems = [{ id: "PII_EMAIL", category: "email", confidence: 0.98 }];
  const domSemantics = [{ category: "email", type: "email", autocomplete: "username" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Sign in with my email user@test.com",
    piiItems,
    domSemantics
  });

  const emailItem = result.piiRelevance[0];
  assert.equal(emailItem.taskRelevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.equal(emailItem.taskNecessity, TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED);
  assert.equal(emailItem.semanticRole, SEMANTIC_ROLES.ACCOUNT_IDENTIFIER);
});

test("3. Relevance != Necessity: Public product title has CONTEXTUAL_REFERENCE necessity", () => {
  const piiItems = [{ id: "TITLE_1", category: "product_title", confidence: 0.99 }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Search for noise cancelling headphones under $200",
    piiItems
  });

  const titleItem = result.piiRelevance[0];
  assert.equal(titleItem.taskNecessity, TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE);
  assert.equal(titleItem.semanticRole, SEMANTIC_ROLES.PUBLIC_ATTRIBUTE);
});

test("4. Relevance != Necessity: Irrelevant phone on read task has UNNECESSARY necessity", () => {
  const piiItems = [{ id: "PII_PHONE", category: "phone", confidence: 0.92 }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Read news article about space exploration",
    piiItems
  });

  const phoneItem = result.piiRelevance[0];
  assert.equal(phoneItem.taskRelevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
  assert.equal(phoneItem.taskNecessity, TASK_NECESSITY_LEVELS.UNNECESSARY);
});

// =====================================================================
// 2. SAME ENTITY UNDER DIFFERENT CONTEXTS -> DIFFERENT SEMANTIC ROLES
// =====================================================================

test("5. Multi-Signal Role: Email in recipient context resolves to RECIPIENT", () => {
  const item = { id: "E1", category: "email", type: "email" };
  const domSemantics = [{ category: "email", name: "send_to_email", placeholder: "Recipient Email" }];

  const inferred = inferSemanticRole(item, domSemantics, { intent: TASK_INTENT_TYPES.CONTACT });
  assert.equal(inferred.role, SEMANTIC_ROLES.RECIPIENT);
  assert.ok(inferred.roleEvidence.includes("RECIPIENT_CONTEXT"));
});

test("6. Multi-Signal Role: Email in login context resolves to ACCOUNT_IDENTIFIER", () => {
  const item = { id: "E2", category: "email", type: "email" };
  const domSemantics = [{ category: "email", autocomplete: "username", name: "login_user" }];

  const inferred = inferSemanticRole(item, domSemantics, { intent: TASK_INTENT_TYPES.LOGIN });
  assert.equal(inferred.role, SEMANTIC_ROLES.ACCOUNT_IDENTIFIER);
  assert.ok(inferred.roleEvidence.includes("AUTOCOMPLETE_USER_ID") || inferred.roleEvidence.includes("ACCOUNT_IDENTIFIER_CATEGORY"));
});

test("7. Multi-Signal Role: Address in shipping vs billing context", () => {
  const shipItem = { id: "A1", category: "address" };
  const shipDom = [{ category: "address", autocomplete: "shipping street-address", name: "shipping_street" }];
  const shipInferred = inferSemanticRole(shipItem, shipDom, {});
  assert.equal(shipInferred.role, SEMANTIC_ROLES.SHIPPING_INFO);

  const billItem = { id: "A2", category: "address" };
  const billDom = [{ category: "address", name: "billing_address_line1" }];
  const billInferred = inferSemanticRole(billItem, billDom, {});
  assert.equal(billInferred.role, SEMANTIC_ROLES.BILLING_INFO);
});

// =====================================================================
// 3. UNSEEN / SYNTHETIC TASKS (GENERALIZATION WITHOUT HARDCODED STRINGS)
// =====================================================================

test("8. Unseen Task Generalization: 'Dispatch monthly newsletter to client list' classifies recipient context", () => {
  const piiItems = [
    { id: "P1", category: "email", confidence: 0.95 },
    { id: "P2", category: "password", confidence: 0.98 }
  ];
  const domSemantics = [
    { category: "email", name: "recipient_address" },
    { category: "password", type: "password" }
  ];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Dispatch monthly newsletter to client list, do not use password",
    piiItems,
    domSemantics
  });

  const emailItem = result.piiRelevance.find((r) => r.category === "email");
  const passItem = result.piiRelevance.find((r) => r.category === "password_field" || r.category === "password");

  assert.equal(emailItem.semanticRole, SEMANTIC_ROLES.RECIPIENT);
  assert.equal(passItem.taskRelevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
  assert.equal(passItem.taskNecessity, TASK_NECESSITY_LEVELS.UNNECESSARY);
});

test("9. Unseen Task Generalization: 'Synchronize identity credentials with auth gateway'", () => {
  const piiItems = [{ id: "AUTH_1", category: "password_field", confidence: 0.95 }];
  const domSemantics = [{ category: "password_field", type: "password" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Synchronize identity credentials with auth gateway",
    piiItems,
    domSemantics
  });

  const authItem = result.piiRelevance[0];
  assert.equal(authItem.semanticRole, SEMANTIC_ROLES.AUTH_SECRET);
  assert.equal(authItem.taskNecessity, TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY);
});

// =====================================================================
// 4. AMBIGUITY & UNCERTAINTY HANDLING
// =====================================================================

test("10. Ambiguous Context: Unknown category with zero DOM evidence defaults safely", () => {
  const necessity = determineTaskNecessity({
    category: "custom_unrecognized_blob",
    relevance: TASK_RELEVANCE_LEVELS.UNKNOWN,
    semanticRole: SEMANTIC_ROLES.UNKNOWN
  });

  assert.equal(necessity.necessity, TASK_NECESSITY_LEVELS.UNKNOWN);
  assert.ok(necessity.necessityConfidence <= 0.60);
});

// =====================================================================
// 5. SECURITY & ZERO RAW SECRETS IN METADATA
// =====================================================================

test("11. Security Invariant: ContextAnalyzer output strictly contains zero raw secrets in evidence/reasons", () => {
  const rawSecret = "superSecretPassword123!";
  const rawEmail = "victim_personal@internal.corp";

  const piiItems = [
    { id: "P_PASS", category: "password_field", confidence: 0.99 },
    { id: "P_EMAIL", category: "email", confidence: 0.98 }
  ];
  const domSemantics = [
    { category: "password_field", type: "password", name: "pwd" },
    { category: "email", type: "email", name: "user_email" }
  ];

  const result = evaluatePiiTaskRelevance({
    userInstruction: `Authenticate with email ${rawEmail} and password ${rawSecret}`,
    piiItems,
    domSemantics
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(rawSecret), false, "Raw password must NEVER appear in output");
  assert.equal(serialized.includes(rawEmail), false, "Raw email must NEVER appear in output");

  for (const item of result.piiRelevance) {
    assert.ok(Array.isArray(item.evidence), "Evidence must be an array of structural tokens");
    for (const ev of item.evidence) {
      assert.equal(typeof ev, "string");
      assert.equal(ev.includes(rawSecret), false);
      assert.equal(ev.includes(rawEmail), false);
    }
  }
});
