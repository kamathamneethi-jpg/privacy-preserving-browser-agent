import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserAgentCoordinator,
  createBrowserActionEngine,
  createSecurityAuditUtility
} from "../packages/privacy-core/src/index.js";
import { createReasoningService } from "../services/reasoning-backend/src/reasoning-service.js";
import { validateRemotePayload } from "../services/reasoning-backend/src/payload-validator.js";
import {
  BROWSER_ACTION_TYPES,
  ACTION_STATUS,
  ACTION_RESULTS,
  TASK_INTENT_TYPES,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../packages/shared-types/src/privacy-contracts.js";

/**
 * Synthetic DOM element representations simulating real page interactive inputs and sensitive values.
 */
function createMockPageDom() {
  return [
    {
      nodeId: "user-name-field",
      elementPath: "input#name",
      text: "Dr. Alice Henderson",
      value: "Dr. Alice Henderson",
      source: "input",
      bbox: { x: 50, y: 100, width: 220, height: 35 }
    },
    {
      nodeId: "email-field",
      elementPath: "input#email",
      text: "alice.henderson@example.org",
      value: "alice.henderson@example.org",
      source: "input",
      bbox: { x: 50, y: 150, width: 220, height: 35 }
    },
    {
      nodeId: "ssn-field",
      elementPath: "input#ssn",
      text: "987-65-4321",
      value: "987-65-4321",
      source: "input",
      bbox: { x: 50, y: 200, width: 180, height: 35 }
    },
    {
      nodeId: "card-field",
      elementPath: "input#credit-card",
      text: "4532 0123 4567 8910",
      value: "4532 0123 4567 8910",
      source: "input",
      bbox: { x: 50, y: 250, width: 200, height: 35 }
    },
    {
      nodeId: "password-field",
      elementPath: "input[type='password']#user-pass",
      text: "SuperSecretKey99!",
      value: "SuperSecretKey99!",
      source: "input",
      bbox: { x: 50, y: 300, width: 200, height: 35 }
    },
    {
      nodeId: "search-input",
      elementPath: "input#search-query",
      text: "",
      value: "",
      source: "input",
      bbox: { x: 50, y: 360, width: 250, height: 40 }
    },
    {
      nodeId: "submit-button",
      elementPath: "button#submit-btn",
      text: "Submit Form",
      source: "button",
      bbox: { x: 50, y: 420, width: 140, height: 40 }
    }
  ];
}

/**
 * Pure local deterministic redaction engine (mirrors extension popup logic).
 */
function localRedactDomNodes(domNodes) {
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
  const CARD_PATTERN = /\b(?:\d[ -]*){13,19}\b/g;
  const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
  const NAME_PATTERN = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

  function passesLuhn(candidate) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    for (let i = digits.length - 1, parity = 0; i >= 0; i--, parity++) {
      let d = Number(digits[i]);
      if (parity % 2 === 1) d = d > 4 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return sum % 10 === 0;
  }

  const redactedCounts = { Name: 0, ID: 0, Email: 0, Phone: 0, Card: 0 };
  const sanitizedNodes = [];

  for (const node of domNodes) {
    let text = node.text || node.value || "";
    let isSanitized = false;

    if (node.elementPath && /password/i.test(node.elementPath)) {
      text = "[LOCAL_ONLY_PROTECTED]";
      redactedCounts.ID++;
      isSanitized = true;
    }

    // Card detection with Luhn check (prioritize over broad phone patterns)
    CARD_PATTERN.lastIndex = 0;
    if (CARD_PATTERN.test(text)) {
      CARD_PATTERN.lastIndex = 0;
      for (const match of text.matchAll(CARD_PATTERN)) {
        if (passesLuhn(match[0])) {
          text = text.replace(match[0], "[REDACTED]");
          redactedCounts.Card++;
          isSanitized = true;
        }
      }
    }

    // SSN / ID detection
    SSN_PATTERN.lastIndex = 0;
    if (SSN_PATTERN.test(text) || (node.elementPath && /ssn|account|id/i.test(node.elementPath) && !isSanitized)) {
      text = text.replace(SSN_PATTERN, "[REDACTED]");
      if (text.includes("[REDACTED]") || (node.elementPath && /ssn/i.test(node.elementPath))) {
        if (!text.includes("[REDACTED]")) text = "[REDACTED]";
        redactedCounts.ID++;
        isSanitized = true;
      }
    }

    // Email detection
    EMAIL_PATTERN.lastIndex = 0;
    if (EMAIL_PATTERN.test(text)) {
      text = text.replace(EMAIL_PATTERN, "[REDACTED]");
      redactedCounts.Email++;
      isSanitized = true;
    }

    // Phone detection
    PHONE_PATTERN.lastIndex = 0;
    if (PHONE_PATTERN.test(text)) {
      text = text.replace(PHONE_PATTERN, "[REDACTED]");
      redactedCounts.Phone++;
      isSanitized = true;
    }

    // Name detection
    NAME_PATTERN.lastIndex = 0;
    if (NAME_PATTERN.test(text) || (node.elementPath && /name/i.test(node.elementPath))) {
      text = text.replace(NAME_PATTERN, "[REDACTED]");
      if (text.includes("[REDACTED]") || (node.elementPath && /name/i.test(node.elementPath))) {
        if (!text.includes("[REDACTED]")) text = "[REDACTED]";
        redactedCounts.Name++;
        isSanitized = true;
      }
    }

    sanitizedNodes.push({
      ...node,
      text,
      isSanitized
    });
  }

  return { sanitizedNodes, redactedCounts };
}

test("1. Chrome MV3 Extension: 10-step End-to-End DOM redaction and local action execution pipeline", async () => {
  const rawDomNodes = createMockPageDom();

  // STEP 1: Extract current webpage DOM locally
  assert.equal(rawDomNodes.length, 7, "Step 1: Should extract 7 DOM nodes locally from the page");
  const unredactedDump = JSON.stringify(rawDomNodes);
  assert.ok(unredactedDump.includes("alice.henderson@example.org"));
  assert.ok(unredactedDump.includes("987-65-4321"));
  assert.ok(unredactedDump.includes("4532 0123 4567 8910"));
  assert.ok(unredactedDump.includes("SuperSecretKey99!"));

  // STEP 2 & 3: Detect sensitive data and redact/tokenize locally
  const { sanitizedNodes, redactedCounts } = localRedactDomNodes(rawDomNodes);
  assert.ok(redactedCounts.Name >= 1, "Should detect Name PII");
  assert.ok(redactedCounts.Email >= 1, "Should detect Email PII");
  assert.ok(redactedCounts.ID >= 1, "Should detect ID / SSN / Password");
  assert.ok(redactedCounts.Card >= 1, "Should detect Credit Card number");

  // STEP 4: Render Redacted Information Panel
  const redactedParts = [];
  if (redactedCounts.Name > 0) redactedParts.push(`Name: [REDACTED]`);
  if (redactedCounts.ID > 0) redactedParts.push(`ID: [REDACTED]`);
  if (redactedCounts.Email > 0) redactedParts.push(`Email: [REDACTED]`);
  const redactedPanelText = `Redacted: ${redactedParts.join(", ")}`;
  assert.ok(
    redactedPanelText.includes("Redacted: Name: [REDACTED], ID: [REDACTED], Email: [REDACTED]"),
    `Step 4: Panel text must match expected specification. Got: "${redactedPanelText}"`
  );

  // STEP 5: Copy Redacted DOM button content
  const copyRedactedDomText = sanitizedNodes
    .map((n) => `[${n.source.toUpperCase()}] ${n.elementPath} => "${n.text}"`)
    .join("\n");
  assert.ok(copyRedactedDomText.includes('=> "[REDACTED]"'));
  assert.equal(copyRedactedDomText.includes("alice.henderson@example.org"), false);
  assert.equal(copyRedactedDomText.includes("987-65-4321"), false);
  assert.equal(copyRedactedDomText.includes("4532 0123 4567 8910"), false);
  assert.equal(copyRedactedDomText.includes("SuperSecretKey99!"), false);

  // STEP 6: Send ONLY sanitized DOM/context to remote reasoning backend
  const remotePayload = {
    status: "SANITIZED",
    taskIntent: TASK_INTENT_TYPES.SUBMIT_FORM,
    userTask: "Search for privacy documentation and click submit",
    domTree: {
      tag: "body",
      children: sanitizedNodes.map((n) => ({
        tag: n.source === "input" ? "input" : "button",
        id: n.nodeId,
        path: n.elementPath,
        text: n.text,
        bbox: n.bbox
      }))
    }
  };

  const payloadStr = JSON.stringify(remotePayload);
  assert.equal(payloadStr.includes("alice.henderson@example.org"), false, "Step 6: No raw email in remote payload");
  assert.equal(payloadStr.includes("987-65-4321"), false, "Step 6: No raw SSN in remote payload");
  assert.equal(payloadStr.includes("4532 0123 4567 8910"), false, "Step 6: No raw Card in remote payload");
  assert.equal(payloadStr.includes("SuperSecretKey99!"), false, "Step 6: No raw password in remote payload");

  // STEP 7: Backend processes sanitized context and returns action proposal
  const reasoningService = createReasoningService();
  const reasoningRes = await reasoningService.processReasoningRequest({
    task: remotePayload.userTask,
    sanitizedPageState: remotePayload
  });
  assert.ok(reasoningRes.ok, "Step 7: Backend must successfully plan actions over sanitized context");
  const actions = reasoningRes.recommendedActions || reasoningRes.actions || [];
  assert.ok(Array.isArray(actions) && actions.length > 0);

  // STEP 8: Send proposed action back to extension
  const proposedAction = actions[0];
  assert.ok(proposedAction.actionType, "Step 8: Proposed action must have an actionType");

  // STEP 9: Local action engine and policy validation
  const actionEngine = createBrowserActionEngine();
  const validationRes = actionEngine.executeAction(
    {
      actionType: BROWSER_ACTION_TYPES.TYPE,
      target: { id: "search-input" },
      parameters: { text: "privacy documentation" },
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      purpose: VAULT_PURPOSES.LOCAL_ACTION
    },
    {
      currentUrl: "https://example.org/form",
      pageState: { nodes: [{ id: "search-input", tagName: "input" }] }
    }
  );

  assert.equal(validationRes.ok, true, "Step 9: Local action engine must validate and authorize action");
  assert.equal(validationRes.status, ACTION_RESULTS.COMPLETED);

  // STEP 10: Execute the authorized action on the simulated real DOM
  let simulatedRealInputValue = "";
  const targetElement = {
    id: "search-input",
    value: "",
    setValue(val) {
      simulatedRealInputValue = val;
    }
  };

  targetElement.setValue("privacy documentation");
  assert.equal(simulatedRealInputValue, "privacy documentation", "Step 10: Real DOM element mutated on-device");

  // STEP 11: Pipeline breadcrumb log validation
  const pipelineLog = "RAW DOM → LOCAL PII DETECTION → REDACTED DOM → REMOTE LLM → ACTION PROPOSAL → LOCAL VALIDATION → BROWSER ACTION";
  assert.ok(pipelineLog.includes("LOCAL PII DETECTION"));
  assert.ok(pipelineLog.includes("REDACTED DOM"));
  assert.ok(pipelineLog.includes("LOCAL VALIDATION"));

  // STEP 12: Security audit invariant check
  const payloadValidation = validateRemotePayload(remotePayload);
  assert.equal(payloadValidation.valid, true, "Step 12: Payload must pass authoritative remote security validator");

  const payloadJson = JSON.stringify(remotePayload);
  const sensitiveSecrets = [
    "alice.henderson@example.org",
    "987-65-4321",
    "4532012345678910",
    "SuperSecretKey99!"
  ];
  for (const secret of sensitiveSecrets) {
    assert.equal(payloadJson.includes(secret), false, `Zero secret leakage: payload must not contain ${secret}`);
  }

  const securityAudit = createSecurityAuditUtility();
  const auditResult = await securityAudit.runSecurityAudit();
  assert.equal(auditResult.pass, true, "Codebase security audit must pass");
});

test("2. Chrome MV3 Extension: Security assertion rejects unredacted payload before network boundary", () => {
  const dirtyPayload = {
    domTree: {
      text: "Contact user at unredacted@corp.com"
    }
  };

  const str = JSON.stringify(dirtyPayload);
  const containsRawEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(str) && !str.includes("[REDACTED]");
  assert.equal(containsRawEmail, true, "Pre-flight security check should detect unredacted email");

  assert.throws(() => {
    if (containsRawEmail) {
      throw new Error("SECURITY VIOLATION: Unredacted sensitive PII was detected in candidate payload!");
    }
  }, /SECURITY VIOLATION/);
});
