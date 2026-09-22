import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateMixedContentDemo,
  formatReviewerDecisionBadge,
  assertCrossRepresentationConsistency,
  VISUALIZATION_COLORS
} from "../packages/privacy-core/src/reviewer-transparency-engine.js";

import {
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  SENSITIVITY_LEVELS,
  VAULT_PURPOSES
} from "../packages/shared-types/src/privacy-contracts.js";

import {
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy
} from "../packages/privacy-core/src/policy-engine.js";

import {
  SanitizedContextBuilder
} from "../packages/privacy-core/src/sanitized-context-builder.js";

import {
  redactDomNodes,
  redactTextString
} from "../packages/privacy-core/src/dom-redactor.js";

import {
  redactImageLocally
} from "../packages/privacy-core/src/image-redactor.js";

import {
  createLocalPrivacyVault
} from "../packages/privacy-core/src/privacy-vault.js";

import {
  sanitizeTelemetryString,
  sanitizeTelemetryTask,
  createSafePrivacyDecisionTelemetry,
  sanitizeTelemetryData,
  assertNoTelemetryLeaks
} from "../packages/privacy-core/src/telemetry-sanitizer.js";

import { PiiCategory } from "../packages/privacy-core/src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

test("Phase 6 Suite — End-to-End Privacy Validation & Reviewer Visualization", async (t) => {

  await t.test("Test A — ALLOW Consistency: Public safe data is preserved consistently across DOM, Screenshot, Remote Payload, and Telemetry", () => {
    const publicTitle = "Ergonomic Mechanical Keyboard";
    const publicItem = {
      id: "item_pub_title_01",
      category: "product_title",
      text: publicTitle,
      confidence: 0.99,
      bbox: { x: 50, y: 100, width: 200, height: 30 }
    };
    const relevanceItem = {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
      semanticRole: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
      sensitivity: SENSITIVITY_LEVELS.LOW
    };

    const decision = evaluatePiiPolicyItem({
      piiItem: publicItem,
      relevanceItem,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    assert.equal(decision.decision, POLICY_ACTIONS.ALLOW);

    // 1. Badge representation
    const badge = formatReviewerDecisionBadge(decision);
    assert.equal(badge.color, VISUALIZATION_COLORS.ALLOW);
    assert.equal(badge.action, POLICY_ACTIONS.ALLOW);
    assert.equal(badge.icon, "🟢");

    // 2. DOM sanitization preserves text
    const domNode = {
      nodeId: "dom_1",
      elementPath: "body/div/h1",
      text: publicTitle,
      bbox: publicItem.bbox
    };
    const domResult = redactDomNodes([domNode], [{ ...publicItem, nodeId: "dom_1", start: 0, end: publicTitle.length, type: "product_title" }], () => decision);
    assert.equal(domResult.sanitizedNodes[0].text, publicTitle, "Allowed text must be preserved in DOM");
    assert.equal(domResult.summary.totalRedactions, 0);

    // 3. Screenshot sanitization preserves pixels
    const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
    const imageResult = redactImageLocally(mockImage, [{ ...publicItem, policyDecision: decision }]);
    assert.equal(imageResult.redactedCount, 0, "ALLOW must not mask screenshot pixels");

    // 4. Remote reasoning payload preserves node text
    const builder = new SanitizedContextBuilder();
    builder.initialize();
    const contextResult = builder.buildSanitizedContext({
      domTree: { tag: "h1", text: publicTitle, attributes: {} },
      piiItems: [publicItem],
      policyDecisions: [decision],
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    assert.ok(contextResult.ok);
    assert.equal(contextResult.payload.domTree.text, publicTitle);

    // 5. Telemetry metadata contains safe category & zero secrets
    const telemetry = createSafePrivacyDecisionTelemetry(decision);
    assert.equal(telemetry.decision, POLICY_ACTIONS.ALLOW);
    assert.equal(telemetry.category, "product_title");
    assert.equal(telemetry.value, undefined);

    // 6. Cross-representation assertion
    assert.ok(assertCrossRepresentationConsistency(decision, {
      domMasked: false,
      screenshotMasked: false,
      remotePayload: publicTitle
    }));
  });

  await t.test("Test B — TOKENIZE Consistency: Sensitive necessary entity is replaced with opaque token, masked in screenshot, and vault-stored", () => {
    const rawEmail = "customer.delivery@sampledomain.test";
    const vault = createLocalPrivacyVault();

    const emailItem = {
      id: "item_email_tok_01",
      category: PiiCategory.EMAIL,
      text: rawEmail,
      confidence: 0.98,
      bbox: { x: 100, y: 150, width: 220, height: 25 }
    };
    const relevanceItem = {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.RECIPIENT,
      sensitivity: SENSITIVITY_LEVELS.MEDIUM
    };

    const decision = evaluatePiiPolicyItem({
      piiItem: emailItem,
      relevanceItem,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    assert.equal(decision.decision, POLICY_ACTIONS.TOKENIZE);
    assert.ok(decision.token.startsWith("PII_TOKEN_EMAIL_"));

    // 1. Vault storage
    const storeRes = vault.storeSecretWithToken(decision.token, {
      category: PiiCategory.EMAIL,
      secretValue: rawEmail,
      purpose: VAULT_PURPOSES.LOCAL_ACTION
    });
    assert.ok(storeRes.ok);

    const retrieveRes = vault.retrieveSecretByToken(decision.token, {
      purpose: VAULT_PURPOSES.LOCAL_ACTION,
      authorization: { authorizationGranted: true }
    });
    assert.ok(retrieveRes.ok);
    assert.equal(retrieveRes.secretValue, rawEmail);

    // 2. Badge representation
    const badge = formatReviewerDecisionBadge(decision);
    assert.equal(badge.color, VISUALIZATION_COLORS.TOKENIZE);
    assert.equal(badge.action, POLICY_ACTIONS.TOKENIZE);
    assert.equal(badge.icon, "🔴");

    // 3. DOM sanitization replaces raw value with token
    const domNode = {
      nodeId: "dom_email_node",
      elementPath: "body/form/input",
      text: rawEmail,
      bbox: emailItem.bbox
    };
    const domResult = redactDomNodes([domNode], [{ ...emailItem, nodeId: "dom_email_node", start: 0, end: rawEmail.length, type: PiiCategory.EMAIL }], () => decision);
    assert.ok(domResult.sanitizedNodes[0].text.includes(decision.token));
    assert.ok(!domResult.sanitizedNodes[0].text.includes(rawEmail));

    // 4. Remote payload contains token
    const builder = new SanitizedContextBuilder();
    builder.initialize();
    const contextResult = builder.buildSanitizedContext({
      domTree: { tag: "input", text: rawEmail, attributes: { value: rawEmail } },
      piiItems: [emailItem],
      policyDecisions: [decision],
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    assert.ok(contextResult.ok);
    const serializedPayload = JSON.stringify(contextResult.payload);
    assert.ok(!serializedPayload.includes(rawEmail));

    // 5. Screenshot masking
    const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
    const imageResult = redactImageLocally(mockImage, [{ ...emailItem, policyDecision: decision }]);
    assert.equal(imageResult.redactedCount, 1);
    assert.ok(imageResult.sanitizedImage.drawOperations.length > 0);

    // 6. Telemetry metadata contains opaque token & zero raw email
    const telemetry = createSafePrivacyDecisionTelemetry(decision);
    assert.equal(telemetry.decision, POLICY_ACTIONS.TOKENIZE);
    assert.equal(telemetry.token, decision.token);
    assert.equal(telemetry.value, undefined);
    assert.ok(!JSON.stringify(telemetry).includes(rawEmail));

    // 7. Cross-representation assertion
    assert.ok(assertCrossRepresentationConsistency(decision, {
      screenshotMasked: true,
      remotePayload: decision.token
    }));
  });

  await t.test("Test C — REDACT Consistency: Sensitive unnecessary entity is redacted completely from DOM, screenshot, remote payload, and telemetry", () => {
    const rawPhone = "+1-555-0199";
    const phoneItem = {
      id: "item_phone_redact_01",
      category: PiiCategory.PHONE,
      text: rawPhone,
      confidence: 0.95,
      bbox: { x: 50, y: 50, width: 150, height: 25 }
    };
    const relevanceItem = {
      taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT,
      taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
      sensitivity: SENSITIVITY_LEVELS.MEDIUM
    };

    const decision = evaluatePiiPolicyItem({
      piiItem: phoneItem,
      relevanceItem,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    assert.equal(decision.decision, POLICY_ACTIONS.REDACT);

    // 1. Badge representation
    const badge = formatReviewerDecisionBadge(decision);
    assert.equal(badge.color, VISUALIZATION_COLORS.REDACT);
    assert.equal(badge.action, POLICY_ACTIONS.REDACT);
    assert.equal(badge.icon, "⚫");

    // 2. DOM sanitization redacts text
    const domNode = {
      nodeId: "dom_phone_node",
      elementPath: "body/footer/p",
      text: `Support hotline: ${rawPhone}`,
      bbox: phoneItem.bbox
    };
    const domResult = redactDomNodes([domNode], [{ ...phoneItem, nodeId: "dom_phone_node", start: 17, end: 17 + rawPhone.length, type: PiiCategory.PHONE }], () => decision);
    assert.ok(domResult.sanitizedNodes[0].text.includes("[REDACTED]"));
    assert.ok(!domResult.sanitizedNodes[0].text.includes(rawPhone));

    // 3. Remote payload contains redaction
    const builder = new SanitizedContextBuilder();
    builder.initialize();
    const contextResult = builder.buildSanitizedContext({
      domTree: { tag: "p", text: `Support hotline: ${rawPhone}`, attributes: {} },
      piiItems: [phoneItem],
      policyDecisions: [decision],
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    assert.ok(contextResult.ok);
    const serializedPayload = JSON.stringify(contextResult.payload);
    assert.ok(!serializedPayload.includes(rawPhone));

    // 4. Screenshot masking
    const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
    const imageResult = redactImageLocally(mockImage, [{ ...phoneItem, policyDecision: decision }]);
    assert.equal(imageResult.redactedCount, 1);

    // 5. Telemetry metadata contains no raw phone
    const telemetry = createSafePrivacyDecisionTelemetry(decision);
    assert.equal(telemetry.decision, POLICY_ACTIONS.REDACT);
    assert.equal(telemetry.value, undefined);
    assert.ok(!JSON.stringify(telemetry).includes(rawPhone));

    // 6. Cross-representation assertion
    assert.ok(assertCrossRepresentationConsistency(decision, {
      screenshotMasked: true,
      remotePayload: "[REDACTED]"
    }));
  });

  await t.test("Test D — LOCAL_ONLY Consistency: Critical secret is strictly isolated on-device, never tokenized for remote egress", () => {
    const rawPassword = "SuperSecretMasterKey!2026";
    const passItem = {
      id: "item_pass_crit_01",
      category: PiiCategory.PASSWORD_FIELD,
      text: rawPassword,
      confidence: 0.99,
      bbox: { x: 200, y: 200, width: 180, height: 40 }
    };
    const relevanceItem = {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
      semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
      sensitivity: SENSITIVITY_LEVELS.CRITICAL
    };

    const decision = evaluatePiiPolicyItem({
      piiItem: passItem,
      relevanceItem,
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
    });

    assert.equal(decision.decision, POLICY_ACTIONS.LOCAL_ONLY);

    // 1. Badge representation
    const badge = formatReviewerDecisionBadge(decision);
    assert.equal(badge.color, VISUALIZATION_COLORS.LOCAL_ONLY);
    assert.equal(badge.action, POLICY_ACTIONS.LOCAL_ONLY);
    assert.equal(badge.icon, "🔒");

    // 2. DOM sanitization protects password
    const domNode = {
      nodeId: "dom_pass_node",
      elementPath: "body/form/input",
      text: rawPassword,
      bbox: passItem.bbox
    };
    const domResult = redactDomNodes([domNode], [{ ...passItem, nodeId: "dom_pass_node", start: 0, end: rawPassword.length, type: PiiCategory.PASSWORD_FIELD }], () => decision);
    assert.ok(domResult.sanitizedNodes[0].text.includes("[LOCAL_ONLY_PROTECTED]"));
    assert.ok(!domResult.sanitizedNodes[0].text.includes(rawPassword));

    // 3. Remote payload strictly excludes raw password
    const builder = new SanitizedContextBuilder();
    builder.initialize();
    const contextResult = builder.buildSanitizedContext({
      domTree: { tag: "input", text: rawPassword, attributes: { type: "password", value: rawPassword } },
      piiItems: [passItem],
      policyDecisions: [decision],
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    assert.ok(contextResult.ok);
    const serializedPayload = JSON.stringify(contextResult.payload);
    assert.ok(!serializedPayload.includes(rawPassword));

    // 4. Screenshot masking
    const mockImage = { width: 800, height: 600, data: null, drawOperations: [] };
    const imageResult = redactImageLocally(mockImage, [{ ...passItem, policyDecision: decision }]);
    assert.equal(imageResult.redactedCount, 1);

    // 5. Telemetry safety
    const telemetry = createSafePrivacyDecisionTelemetry(decision);
    assert.equal(telemetry.decision, POLICY_ACTIONS.LOCAL_ONLY);
    assert.equal(telemetry.value, undefined);
    assert.ok(!JSON.stringify(telemetry).includes(rawPassword));

    // 6. Cross-representation assertion
    assert.ok(assertCrossRepresentationConsistency(decision, {
      screenshotMasked: true,
      remotePayload: "[PROTECTED_LOCAL_SECRET]"
    }));
  });

  await t.test("Test E — Cross-Representation Raw-Value Sentinel Search: Sentinels never appear in outbound representations", () => {
    const SECRET_SENTINEL = "PHASE6_SECRET_SENTINEL_9X7Q";
    const EMAIL_SENTINEL = "PHASE6_EMAIL_SENTINEL_4M2K@domain.test";
    const PASSWORD_SENTINEL = "PHASE6_PASSWORD_SENTINEL_8P3R";

    const piiItems = [
      { id: "pii_e_1", category: PiiCategory.PASSWORD_FIELD, text: PASSWORD_SENTINEL, confidence: 0.99, bbox: { x: 10, y: 10, width: 50, height: 20 } },
      { id: "pii_e_2", category: PiiCategory.EMAIL, text: EMAIL_SENTINEL, confidence: 0.98, bbox: { x: 10, y: 40, width: 50, height: 20 } },
      { id: "pii_e_3", category: PiiCategory.SECRET_KEY, text: SECRET_SENTINEL, confidence: 0.99, bbox: { x: 10, y: 70, width: 50, height: 20 } }
    ];

    const relevanceItems = [
      { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY, semanticRole: SEMANTIC_ROLES.AUTH_SECRET, sensitivity: SENSITIVITY_LEVELS.CRITICAL },
      { taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED, taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED, semanticRole: SEMANTIC_ROLES.RECIPIENT, sensitivity: SENSITIVITY_LEVELS.MEDIUM },
      { taskRelevance: TASK_RELEVANCE_LEVELS.IRRELEVANT, taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY, semanticRole: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER, sensitivity: SENSITIVITY_LEVELS.HIGH }
    ];

    const decisions = piiItems.map((piiItem, i) => evaluatePiiPolicyItem({
      piiItem,
      relevanceItem: relevanceItems[i],
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    }));

    // 1. Sanitized DOM
    const rawDomNodes = [
      { nodeId: "node_p", text: `Password is ${PASSWORD_SENTINEL}` },
      { nodeId: "node_e", text: `Email is ${EMAIL_SENTINEL}` },
      { nodeId: "node_s", text: `Key is ${SECRET_SENTINEL}` }
    ];
    const detections = [
      { nodeId: "node_p", start: 12, end: 12 + PASSWORD_SENTINEL.length, type: PiiCategory.PASSWORD_FIELD, policyDecision: decisions[0] },
      { nodeId: "node_e", start: 9, end: 9 + EMAIL_SENTINEL.length, type: PiiCategory.EMAIL, policyDecision: decisions[1] },
      { nodeId: "node_s", start: 7, end: 7 + SECRET_SENTINEL.length, type: PiiCategory.SECRET_KEY, policyDecision: decisions[2] }
    ];
    const sanitizedDom = redactDomNodes(rawDomNodes, detections, (det) => det.policyDecision);
    const serializedDom = JSON.stringify(sanitizedDom);

    assert.ok(!serializedDom.includes(PASSWORD_SENTINEL), "Password sentinel must not appear in sanitized DOM");
    assert.ok(!serializedDom.includes(EMAIL_SENTINEL), "Email sentinel must not appear in sanitized DOM");
    assert.ok(!serializedDom.includes(SECRET_SENTINEL), "Secret sentinel must not appear in sanitized DOM");

    // 2. Remote Payload
    const builder = new SanitizedContextBuilder();
    builder.initialize();
    const contextResult = builder.buildSanitizedContext({
      domTree: {
        tag: "div",
        children: [
          { tag: "input", attributes: { type: "password", value: PASSWORD_SENTINEL } },
          { tag: "span", text: EMAIL_SENTINEL },
          { tag: "span", text: SECRET_SENTINEL }
        ]
      },
      piiItems,
      policyDecisions: decisions,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    const serializedPayload = JSON.stringify(contextResult.payload);

    assert.ok(!serializedPayload.includes(PASSWORD_SENTINEL), "Password sentinel must not appear in remote payload");
    assert.ok(!serializedPayload.includes(EMAIL_SENTINEL), "Email sentinel must not appear in remote payload");
    assert.ok(!serializedPayload.includes(SECRET_SENTINEL), "Secret sentinel must not appear in remote payload");

    // 3. Telemetry records
    const telemetryRecords = decisions.map(createSafePrivacyDecisionTelemetry);
    const serializedTelemetry = JSON.stringify(telemetryRecords);

    assert.ok(!serializedTelemetry.includes(PASSWORD_SENTINEL), "Password sentinel must not appear in telemetry");
    assert.ok(!serializedTelemetry.includes(EMAIL_SENTINEL), "Email sentinel must not appear in telemetry");
    assert.ok(!serializedTelemetry.includes(SECRET_SENTINEL), "Secret sentinel must not appear in telemetry");
  });

  await t.test("Test F — Decision Consistency: PolicyEngine is single authoritative decision across all 7 synthetic classes", () => {
    const demo = evaluateMixedContentDemo();

    assert.equal(demo.totalEvaluated, 7);
    assert.equal(demo.allConsistent, true);

    const allowItems = demo.matrix.filter((r) => r.decision === POLICY_ACTIONS.ALLOW);
    const tokenizeItems = demo.matrix.filter((r) => r.decision === POLICY_ACTIONS.TOKENIZE);
    const redactItems = demo.matrix.filter((r) => r.decision === POLICY_ACTIONS.REDACT);
    const localOnlyItems = demo.matrix.filter((r) => r.decision === POLICY_ACTIONS.LOCAL_ONLY);

    assert.equal(allowItems.length, 3, "3 public items must be ALLOW");
    assert.equal(tokenizeItems.length, 1, "1 necessary email must be TOKENIZE");
    assert.equal(redactItems.length, 1, "1 unnecessary phone must be REDACT");
    assert.equal(localOnlyItems.length, 2, "2 auth secrets (pass + otp) must be LOCAL_ONLY");

    for (const item of demo.matrix) {
      assert.ok(item.badge, "Badge metadata must be present");
      assert.ok(item.telemetry, "Safe telemetry metadata must be present");
      assert.equal(item.telemetry.value, undefined, "Telemetry must never contain raw secret");
    }
  });

  await t.test("Test G — Color/Policy Separation: Modifying visualization colors or badges never alters the underlying PolicyDecision", () => {
    const item = {
      id: "item_color_test_01",
      category: PiiCategory.EMAIL,
      confidence: 0.95
    };
    const relevance = {
      taskRelevance: TASK_RELEVANCE_LEVELS.REQUIRED,
      taskNecessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      semanticRole: SEMANTIC_ROLES.RECIPIENT,
      sensitivity: SENSITIVITY_LEVELS.MEDIUM
    };

    const originalDecision = evaluatePiiPolicyItem({
      piiItem: item,
      relevanceItem: relevance,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    assert.equal(originalDecision.decision, POLICY_ACTIONS.TOKENIZE);

    const badge = formatReviewerDecisionBadge(originalDecision);
    // Mutate badge object
    badge.color = "GREEN";
    badge.label = "ALLOW";

    // Underlying decision must remain untouched
    assert.equal(originalDecision.decision, POLICY_ACTIONS.TOKENIZE);

    // Re-evaluating decision produces identical result regardless of UI state
    const reEvaluatedDecision = evaluatePiiPolicyItem({
      piiItem: item,
      relevanceItem: relevance,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });
    assert.equal(reEvaluatedDecision.decision, POLICY_ACTIONS.TOKENIZE);
  });

  await t.test("Test H — Source-Level Hardcoding Audit: Verify zero hardcoded demo-specific branches in active Phase 6 code", () => {
    const phase6Files = [
      path.join(REPO_ROOT, "packages", "privacy-core", "src", "reviewer-transparency-engine.js")
    ];

    const prohibitedPatterns = [
      /task\s*===\s*["']/,
      /task\s*==\s*["']/,
      /task\.includes\(/,
      /url\.includes\(/,
      /window\.location\.hostname/,
      /location\.hostname/
    ];

    for (const file of phase6Files) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");

      for (const pattern of prohibitedPatterns) {
        assert.ok(!pattern.test(content), `File ${file} must not contain prohibited hardcoded pattern ${pattern}`);
      }
    }
  });

  await t.test("Test I — Phase 5 Telemetry Safety Regression Check: Telemetry sanitizer remains leak-free", () => {
    const validVisaCard = "4111-1111-1111-1111";
    const sanitized = sanitizeTelemetryString(`Order processed with payment card ${validVisaCard}`);
    assert.ok(!sanitized.includes("4111"));
    assert.ok(sanitized.includes("[CARD_NUMBER_REDACTED]"));

    const safeTask = sanitizeTelemetryTask(`Buy item and send confirmation to ashri@example.com with password SecretPass!2026`);
    assert.ok(!safeTask.sanitizedTask.includes("ashri@example.com"));
    assert.ok(!safeTask.sanitizedTask.includes("SecretPass!2026"));
    assert.ok(assertNoTelemetryLeaks(safeTask, ["ashri@example.com", "SecretPass!2026"]));
  });

  await t.test("Test J — High-Entropy Limitation Validation: Document and validate boundary limitation for unknown unstructured strings", () => {
    // High-entropy random strings without category signals or recognizable patterns
    const unstructuredHighEntropyToken = "qX9zW7vK2mP4tL8r";
    const telemetryString = `Custom debug flag: ${unstructuredHighEntropyToken}`;

    const sanitized = sanitizeTelemetryString(telemetryString);

    // Documented limitation: Strings without structural PII signals (e.g. not email, not luhn card, not uuid, not jwt)
    // are passed through unless flagged by hybrid PII detector / entity scanner.
    assert.ok(typeof sanitized === "string");
    // Assert that the system behaves deterministically
    assert.ok(sanitized.includes("Custom debug flag:"));
  });

});
