import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeTelemetryString,
  sanitizeTelemetryTask,
  sanitizeTelemetryError,
  createSafePrivacyDecisionTelemetry,
  sanitizeTelemetryData,
  assertNoTelemetryLeaks,
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  PiiCategory,
  createLocalPrivacyVault,
  VAULT_PURPOSES,
  GoalParser
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// PHASE 5: TELEMETRY SAFETY & OBSERVABILITY INVARIANT TEST SUITE
// =====================================================================

const SENTINEL_EMAIL = "TEST_TELEMETRY_EMAIL_982341@example.test";
const SENTINEL_PASSWORD = "TEST_TELEMETRY_PASSWORD_982341";
const SENTINEL_CVV = "TEST_TELEMETRY_CVV_982341";
const SENTINEL_ADDRESS = "TEST_TELEMETRY_ADDRESS_982341 123 Main Street";
const SENTINEL_OTP = "TEST_TELEMETRY_OTP_982341";
const ALL_SENTINELS = [SENTINEL_EMAIL, SENTINEL_PASSWORD, SENTINEL_CVV, SENTINEL_ADDRESS, SENTINEL_OTP];

test("Test A: Safe privacy decision telemetry for ALLOW, TOKENIZE, REDACT, LOCAL_ONLY", () => {
  // 1. ALLOW decision
  const allowDecision = evaluatePiiPolicyItem({
    piiItem: { category: "product_title", id: "p1", confidence: 0.98 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  const allowTele = createSafePrivacyDecisionTelemetry(allowDecision);
  assert.equal(allowTele.decision, POLICY_ACTIONS.ALLOW);
  assert.equal(allowTele.category, "product_title");
  assert.equal(typeof allowTele.reasonCodes, "object");

  // 2. TOKENIZE decision
  const tokenizeDecision = evaluatePiiPolicyItem({
    piiItem: { category: PiiCategory.EMAIL, id: "e1", confidence: 0.98 },
    relevanceItem: { taskRelevance: "REQUIRED", taskNecessity: "REMOTE_REASONING_REQUIRED", semanticRole: "recipient" },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  const tokenizeTele = createSafePrivacyDecisionTelemetry(tokenizeDecision);
  assert.equal(tokenizeTele.decision, POLICY_ACTIONS.TOKENIZE);
  assert.ok(tokenizeTele.token && tokenizeTele.token.startsWith("PII_TOKEN_EMAIL_"));
  assert.equal(tokenizeTele.value, undefined, "Must NOT contain raw email value");

  // 3. REDACT decision
  const redactDecision = evaluatePiiPolicyItem({
    piiItem: { category: PiiCategory.PHONE, id: "ph1", confidence: 0.98 },
    relevanceItem: { taskRelevance: "IRRELEVANT", taskNecessity: "UNNECESSARY" },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  const redactTele = createSafePrivacyDecisionTelemetry(redactDecision);
  assert.equal(redactTele.decision, POLICY_ACTIONS.REDACT);
  assert.equal(redactTele.value, undefined);

  // 4. LOCAL_ONLY decision
  const localDecision = evaluatePiiPolicyItem({
    piiItem: { category: PiiCategory.PASSWORD_FIELD, id: "pwd1", confidence: 0.98 },
    relevanceItem: { taskRelevance: "REQUIRED", taskNecessity: "LOCAL_EXECUTION_ONLY" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });
  const localTele = createSafePrivacyDecisionTelemetry(localDecision);
  assert.equal(localTele.decision, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(localTele.value, undefined);

  // Zero raw sentinels in any telemetry output
  assertNoTelemetryLeaks([allowTele, tokenizeTele, redactTele, localTele], ALL_SENTINELS);
});

test("Test B: Raw user task protection (Sentinels must NOT leak raw)", () => {
  const sensitiveTask = `Send an email to ${SENTINEL_EMAIL} using password ${SENTINEL_PASSWORD} and verify code ${SENTINEL_OTP}`;
  const parsedGoal = GoalParser.parse(sensitiveTask);

  const safeTaskTelemetry = sanitizeTelemetryTask(sensitiveTask, parsedGoal);

  assert.equal(typeof safeTaskTelemetry.sanitizedTask, "string");
  assert.ok(!safeTaskTelemetry.sanitizedTask.includes(SENTINEL_PASSWORD), "Password sentinel must be scrubbed from task");
  assert.ok(!safeTaskTelemetry.sanitizedTask.includes(SENTINEL_EMAIL), "Email sentinel must be scrubbed from task");
  assert.ok(!safeTaskTelemetry.sanitizedTask.includes(SENTINEL_OTP), "OTP sentinel must be scrubbed from task");
  assert.equal(safeTaskTelemetry.hasSanitizedSecrets, true);

  // Assert no leaks in entire object
  assertNoTelemetryLeaks(safeTaskTelemetry, ALL_SENTINELS);
});

test("Test C: Error object protection (Nested errors & contexts must NOT leak secrets)", () => {
  const rawError = new Error(`Authentication failed for user ${SENTINEL_EMAIL} with secret ${SENTINEL_PASSWORD} on https://auth.test/login?token=${SENTINEL_CVV}`);
  rawError.code = "ERR_AUTH_REJECTED";
  rawError.component = "browser_action_engine";

  const safeError = sanitizeTelemetryError(rawError);

  assert.equal(safeError.errorType, "Error");
  assert.equal(safeError.code, "ERR_AUTH_REJECTED");
  assert.equal(safeError.component, "browser_action_engine");
  assert.ok(!safeError.message.includes(SENTINEL_EMAIL), "Error message must scrub email");
  assert.ok(!safeError.message.includes(SENTINEL_PASSWORD), "Error message must scrub password");
  assert.ok(!safeError.message.includes(SENTINEL_CVV), "Error message must scrub URL token");

  assertNoTelemetryLeaks(safeError, ALL_SENTINELS);
});

test("Test D: PrivacyVault isolation (Vault contents & secrets must NOT leak into telemetry)", () => {
  const vault = createLocalPrivacyVault({ ttlMs: 60000 });
  vault.storeSecret({
    category: PiiCategory.PASSWORD_FIELD,
    secretValue: SENTINEL_PASSWORD,
    purpose: VAULT_PURPOSES.LOGIN
  });

  const rawVaultData = {
    event: "vault_status_check",
    vaultInstance: vault,
    entry: {
      secretValue: SENTINEL_PASSWORD,
      category: PiiCategory.PASSWORD_FIELD,
      purpose: VAULT_PURPOSES.LOGIN
    }
  };

  const sanitized = sanitizeTelemetryData(rawVaultData);

  assert.ok(!JSON.stringify(sanitized).includes(SENTINEL_PASSWORD), "Raw password in vault data must NOT leak");
  assert.equal(sanitized.entry.isVaultProtected, true);
  assert.equal(sanitized.entry.secretValue, undefined, "secretValue property must be stripped");

  assertNoTelemetryLeaks(sanitized, ALL_SENTINELS);
});

test("Test E: Token mapping protection (Token -> secret mappings must NOT leak)", () => {
  const tokenMapping = {
    event: "token_dispatch",
    token: "PII_TOKEN_EMAIL_7k9a2m",
    category: "email",
    value: SENTINEL_EMAIL
  };

  const sanitized = sanitizeTelemetryData(tokenMapping);

  assert.equal(sanitized.token, "PII_TOKEN_EMAIL_7k9a2m");
  assert.equal(sanitized.value, "[PROTECTED_SECRET_MAPPING]");
  assert.ok(!JSON.stringify(sanitized).includes(SENTINEL_EMAIL), "Raw email mapping must NOT leak");

  assertNoTelemetryLeaks(sanitized, [SENTINEL_EMAIL]);
});

test("Test F: Nested serialization test (Deeply nested objects must NOT leak)", () => {
  const nestedPayload = {
    stage: "STEP_1_EXECUTION",
    event: "ACTION_ATTEMPT",
    data: {
      action: "TYPE",
      target: "el_4",
      parameters: {
        userInput: SENTINEL_PASSWORD,
        details: {
          auth: {
            password: SENTINEL_PASSWORD,
            email: SENTINEL_EMAIL,
            cvv: SENTINEL_CVV
          }
        }
      }
    }
  };

  const sanitized = sanitizeTelemetryData(nestedPayload);
  const serialized = JSON.stringify(sanitized);

  assert.ok(!serialized.includes(SENTINEL_PASSWORD), "Nested password must be sanitized");
  assert.ok(!serialized.includes(SENTINEL_EMAIL), "Nested email must be sanitized");
  assert.ok(!serialized.includes(SENTINEL_CVV), "Nested CVV must be sanitized");

  assertNoTelemetryLeaks(sanitized, ALL_SENTINELS);
});

test("Test G: Arrays, Maps, Sets and structured metadata safety", () => {
  const complexData = {
    secretsList: [SENTINEL_PASSWORD, SENTINEL_EMAIL, `Visit ${SENTINEL_ADDRESS}`],
    secretMap: new Map([["password", SENTINEL_PASSWORD], ["safeKey", "safeValue"]]),
    secretSet: new Set([SENTINEL_OTP, "public_item"])
  };

  const sanitized = sanitizeTelemetryData(complexData);
  const serialized = JSON.stringify(sanitized);

  assert.ok(!serialized.includes(SENTINEL_PASSWORD));
  assert.ok(!serialized.includes(SENTINEL_EMAIL));
  assert.ok(!serialized.includes(SENTINEL_ADDRESS));
  assert.ok(!serialized.includes(SENTINEL_OTP));
  assert.ok(serialized.includes("safeValue"), "Non-sensitive data should be preserved");

  assertNoTelemetryLeaks(sanitized, ALL_SENTINELS);
});

test("Test H: Telemetry minimization (Only required metadata emitted, not bulk raw buffers)", () => {
  const bulkyEvent = {
    stage: "MULTIMODAL_PERCEPTION",
    event: "PAGE_SCANNED",
    data: {
      elementCount: 42,
      rawDom: "<html><body><input type='password' value='secret123'/></body></html>",
      rawScreenshot: Buffer.alloc(1024, 0).toString("base64")
    }
  };

  const sanitized = sanitizeTelemetryData(bulkyEvent);

  assert.equal(sanitized.data.elementCount, 42);
  assert.equal(sanitized.data.rawDom, "[RAW_DOM_REDACTED_FROM_TELEMETRY]");
  assert.equal(sanitized.data.rawScreenshot, "[RAW_SCREENSHOT_REDACTED_FROM_TELEMETRY]");
});

test("Test I: Existing diagnostic functionality remains available where safe", () => {
  const safeDiagnostics = {
    stage: "ACTION_PLANNING",
    event: "CLICK_PLANNED",
    level: "info",
    data: {
      actionType: "CLICK",
      target: "el_10",
      isFilter: true,
      filterName: "SIZE",
      filterValue: "9",
      reasoningSummary: "Apply filter facet for size 9"
    }
  };

  const sanitized = sanitizeTelemetryData(safeDiagnostics);

  assert.equal(sanitized.stage, "ACTION_PLANNING");
  assert.equal(sanitized.event, "CLICK_PLANNED");
  assert.equal(sanitized.data.actionType, "CLICK");
  assert.equal(sanitized.data.target, "el_10");
  assert.equal(sanitized.data.filterName, "SIZE");
  assert.equal(sanitized.data.filterValue, "9");
});

test("Test J: Phase 4 regression check (Unified sanitization contracts remain intact)", () => {
  const items = [
    { id: "e1", category: PiiCategory.EMAIL, confidence: 0.95 },
    { id: "p1", category: PiiCategory.PASSWORD_FIELD, confidence: 0.98 },
    { id: "pub1", category: "product_title", confidence: 0.99 }
  ];

  const decisions = evaluateBatchPrivacyPolicy({
    piiItems: items,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    contextAnalysis: {
      piiRelevance: [
        { id: "e1", category: PiiCategory.EMAIL, taskRelevance: "REQUIRED", taskNecessity: "REMOTE_REASONING_REQUIRED", semanticRole: "recipient" },
        { id: "p1", category: PiiCategory.PASSWORD_FIELD, taskRelevance: "REQUIRED", taskNecessity: "LOCAL_EXECUTION_ONLY", semanticRole: "authentication_secret" },
        { id: "pub1", category: "product_title", taskRelevance: "REQUIRED", taskNecessity: "CONTEXTUAL_REFERENCE", semanticRole: "public_attribute" }
      ]
    }
  });

  const emailDecision = decisions.find((d) => d.category === PiiCategory.EMAIL);
  const passwordDecision = decisions.find((d) => d.category === PiiCategory.PASSWORD_FIELD);
  const publicDecision = decisions.find((d) => d.category === "product_title");

  assert.equal(emailDecision.action, POLICY_ACTIONS.TOKENIZE);
  assert.equal(passwordDecision.action, POLICY_ACTIONS.LOCAL_ONLY);
  assert.equal(publicDecision.action, POLICY_ACTIONS.ALLOW);

  // Now create safe telemetry for all decisions and verify zero leak
  const decisionTelemetry = decisions.map(createSafePrivacyDecisionTelemetry);
  assertNoTelemetryLeaks(decisionTelemetry, ALL_SENTINELS);
});
