import test from "node:test";
import assert from "node:assert/strict";
import {
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  SECURITY_LEVELS,
  SENSITIVITY_LEVELS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  TASK_AWARE_POLICY_REASON_CODES,
  TASK_AWARE_POLICY_DECISION_SHAPE,
  PUBLIC_SAFE_CATEGORIES,
  DEFAULT_CATEGORY_ROLES,
  CATEGORY_SENSITIVITY_MAP,
  POLICY_CONFIG,
  POLICY_VERSION
} from "../packages/privacy-core/src/index.js";

test("Phase 1 Contract: TASK_NECESSITY_LEVELS is frozen and contains all required necessity levels", () => {
  assert.ok(Object.isFrozen(TASK_NECESSITY_LEVELS), "TASK_NECESSITY_LEVELS must be frozen");
  assert.equal(TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED, "REMOTE_REASONING_REQUIRED");
  assert.equal(TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY, "LOCAL_EXECUTION_ONLY");
  assert.equal(TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE, "CONTEXTUAL_REFERENCE");
  assert.equal(TASK_NECESSITY_LEVELS.UNNECESSARY, "UNNECESSARY");
  assert.equal(TASK_NECESSITY_LEVELS.UNKNOWN, "UNKNOWN");
});

test("Phase 1 Contract: SEMANTIC_ROLES is frozen and contains generalized semantic roles", () => {
  assert.ok(Object.isFrozen(SEMANTIC_ROLES), "SEMANTIC_ROLES must be frozen");
  assert.equal(SEMANTIC_ROLES.ACCOUNT_IDENTIFIER, "account_identifier");
  assert.equal(SEMANTIC_ROLES.RECIPIENT, "recipient");
  assert.equal(SEMANTIC_ROLES.SHIPPING_INFO, "shipping_information");
  assert.equal(SEMANTIC_ROLES.BILLING_INFO, "billing_information");
  assert.equal(SEMANTIC_ROLES.AUTH_SECRET, "authentication_secret");
  assert.equal(SEMANTIC_ROLES.SEARCH_TARGET, "search_target");
  assert.equal(SEMANTIC_ROLES.PUBLIC_ATTRIBUTE, "public_product_attribute");
  assert.equal(SEMANTIC_ROLES.CONTEXTUAL_REFERENCE, "contextual_reference");
  assert.equal(SEMANTIC_ROLES.GENERAL_DATA, "general_data");
  assert.equal(SEMANTIC_ROLES.UNKNOWN, "unknown");
});

test("Phase 1 Contract: SECURITY_LEVELS and SENSITIVITY_LEVELS are properly defined", () => {
  assert.ok(Object.isFrozen(SECURITY_LEVELS), "SECURITY_LEVELS must be frozen");
  assert.equal(SECURITY_LEVELS.PUBLIC, "PUBLIC");
  assert.equal(SECURITY_LEVELS.CONFIDENTIAL, "CONFIDENTIAL");
  assert.equal(SECURITY_LEVELS.RESTRICTED, "RESTRICTED");
  assert.equal(SECURITY_LEVELS.CRITICAL, "CRITICAL");

  assert.ok(Object.isFrozen(SENSITIVITY_LEVELS), "SENSITIVITY_LEVELS must be frozen");
  assert.equal(SENSITIVITY_LEVELS.PUBLIC, "PUBLIC");
  assert.equal(SENSITIVITY_LEVELS.LOW, "LOW");
  assert.equal(SENSITIVITY_LEVELS.MEDIUM, "MEDIUM");
  assert.equal(SENSITIVITY_LEVELS.HIGH, "HIGH");
  assert.equal(SENSITIVITY_LEVELS.CRITICAL, "CRITICAL");
});

test("Phase 1 Contract: TASK_AWARE_POLICY_DECISION_SHAPE contains all required schema keys", () => {
  assert.ok(Object.isFrozen(TASK_AWARE_POLICY_DECISION_SHAPE), "Shape must be frozen");
  const requiredKeys = [
    "id",
    "category",
    "sensitivity",
    "taskRelevance",
    "taskNecessity",
    "semanticRole",
    "destination",
    "decision",
    "token",
    "placeholder",
    "reason",
    "reasonCodes",
    "confidence"
  ];

  for (const key of requiredKeys) {
    assert.ok(key in TASK_AWARE_POLICY_DECISION_SHAPE, `Missing key in decision shape: ${key}`);
  }
});

test("Phase 1 Contract: POLICY_REASON_CODES contains all task-aware reason codes without breaking existing ones", () => {
  const expectedCodes = [
    "TASK_REQUIRED",
    "TASK_OPTIONAL",
    "TASK_IRRELEVANT",
    "TASK_UNKNOWN",
    "CRITICAL_SENSITIVITY",
    "HIGH_SENSITIVITY",
    "MEDIUM_SENSITIVITY",
    "REMOTE_DESTINATION",
    "LOCAL_DESTINATION",
    "UNKNOWN_DESTINATION",
    "SAFE_DEFAULT",
    "REMOTE_REASONING_REQUIRED",
    "LOCAL_EXECUTION_ONLY",
    "CONTEXTUAL_REFERENCE",
    "UNNECESSARY",
    "PUBLIC_DATA_ALLOWED",
    "SAFE_CONTEXT_ALLOWED",
    "CONFIDENTIAL_DATA_TOKENIZED",
    "CRITICAL_SECRET_LOCAL_ONLY",
    "UNNECESSARY_DATA_REDACTED",
    "MINIMIZATION_DEFAULT"
  ];

  for (const code of expectedCodes) {
    assert.equal(POLICY_REASON_CODES[code], code, `Missing reason code: ${code}`);
  }
  assert.strictEqual(TASK_AWARE_POLICY_REASON_CODES, POLICY_REASON_CODES);
});

test("Phase 1 Config: PUBLIC_SAFE_CATEGORIES defines safe non-PII attributes", () => {
  assert.ok(Object.isFrozen(PUBLIC_SAFE_CATEGORIES), "PUBLIC_SAFE_CATEGORIES must be frozen");
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("product_title"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("price"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("brand"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("color"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("specification"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("public_label"));
  assert.ok(PUBLIC_SAFE_CATEGORIES.includes("safe_context"));

  // Check sensitivity mapping
  for (const cat of PUBLIC_SAFE_CATEGORIES) {
    const sensitivity = CATEGORY_SENSITIVITY_MAP[cat];
    assert.ok(
      sensitivity === SENSITIVITY_LEVELS.LOW || sensitivity === SENSITIVITY_LEVELS.PUBLIC,
      `Safe category '${cat}' should have LOW or PUBLIC sensitivity, got: ${sensitivity}`
    );
  }
});

test("Phase 1 Config: DEFAULT_CATEGORY_ROLES maps categories to generalized semantic roles", () => {
  assert.ok(Object.isFrozen(DEFAULT_CATEGORY_ROLES), "DEFAULT_CATEGORY_ROLES must be frozen");
  assert.equal(DEFAULT_CATEGORY_ROLES.password, SEMANTIC_ROLES.AUTH_SECRET);
  assert.equal(DEFAULT_CATEGORY_ROLES.otp, SEMANTIC_ROLES.AUTH_SECRET);
  assert.equal(DEFAULT_CATEGORY_ROLES.credit_card, SEMANTIC_ROLES.BILLING_INFO);
  assert.equal(DEFAULT_CATEGORY_ROLES.address, SEMANTIC_ROLES.SHIPPING_INFO);
  assert.equal(DEFAULT_CATEGORY_ROLES.email, SEMANTIC_ROLES.ACCOUNT_IDENTIFIER);
  assert.equal(DEFAULT_CATEGORY_ROLES.product_title, SEMANTIC_ROLES.PUBLIC_ATTRIBUTE);
  assert.equal(DEFAULT_CATEGORY_ROLES.price, SEMANTIC_ROLES.PUBLIC_ATTRIBUTE);
});

test("Phase 1 Invariants: Existing policy actions and destinations remain preserved", () => {
  assert.equal(POLICY_ACTIONS.ALLOW, "ALLOW");
  assert.equal(POLICY_ACTIONS.TOKENIZE, "TOKENIZE");
  assert.equal(POLICY_ACTIONS.REDACT, "REDACT");
  assert.equal(POLICY_ACTIONS.LOCAL_ONLY, "LOCAL_ONLY");

  assert.equal(PROCESSING_DESTINATIONS.LOCAL_BROWSER, "LOCAL_BROWSER");
  assert.equal(PROCESSING_DESTINATIONS.LOCAL_EXTENSION, "LOCAL_EXTENSION");
  assert.equal(PROCESSING_DESTINATIONS.REMOTE_REASONING, "REMOTE_REASONING");
  assert.equal(PROCESSING_DESTINATIONS.REMOTE_SERVICE, "REMOTE_SERVICE");
  assert.equal(PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION, "UNKNOWN_DESTINATION");

  assert.equal(POLICY_VERSION, "1.0.0");
});
