import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  REMOTE_REASONING_REQUEST_SHAPE,
  REMOTE_REASONING_RESPONSE_SHAPE,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  VAULT_PURPOSES
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  ReasoningService,
  MockTestReasoningProvider,
  createReasoningService,
  validateRemotePayload,
  validateReasoningResponse,
  REASONING_SERVICE_VERSION,
  REASONING_CONFIG
} from "../services/reasoning-backend/src/index.js";
import {
  buildSanitizedReasoningPayload,
  createBrowserActionEngine,
  ACTION_RESULTS
} from "../packages/privacy-core/src/index.js";

// --- 1. Export & Contract Verification ---

test("1. Step 15 Remote Reasoning contracts exist and adhere to immutability rules", () => {
  assert.equal(REMOTE_REASONING_STATUS.READY, "READY");
  assert.equal(REMOTE_REASONING_STATUS.DISPOSED, "DISPOSED");
  assert.equal(REASONING_PROVIDER_TYPES.REAL_REMOTE, "REAL_REMOTE");
  assert.equal(REASONING_PROVIDER_TYPES.MOCK_TEST, "MOCK_TEST");
  assert.equal(REMOTE_REASONING_REQUEST_SHAPE.protocolVersion, "string");
  assert.equal(REMOTE_REASONING_RESPONSE_SHAPE.recommendedActions, "array");
  assert.throws(() => { REMOTE_REASONING_STATUS.NEW_PROP = "test"; }, TypeError);
});

test("2. Reasoning configuration contains defaults, bounds, and limits", () => {
  assert.equal(REASONING_SERVICE_VERSION, "1.0.0");
  assert.equal(REASONING_CONFIG.DEFAULT_PROVIDER, REASONING_PROVIDER_TYPES.MOCK_TEST);
  assert.equal(REASONING_CONFIG.REQUEST_TIMEOUT_MS, 5000);
  assert.equal(REASONING_CONFIG.MAX_PAYLOAD_BYTES, 250000);
  assert.equal(REASONING_CONFIG.MAX_RECOMMENDED_ACTIONS, 10);
  assert.equal(REASONING_CONFIG.ALLOW_RAW_SECRETS, false);
});

// --- 2. Reasoning Service Lifecycle ---

test("3. ReasoningService instantiation and initialize lifecycle", () => {
  const service = new ReasoningService();
  assert.equal(service.getServiceStatus(), REMOTE_REASONING_STATUS.UNINITIALIZED);

  const initRes = service.initialize();
  assert.equal(initRes.ok, true);
  assert.equal(initRes.state, REMOTE_REASONING_STATUS.READY);
  assert.equal(initRes.providerType, REASONING_PROVIDER_TYPES.MOCK_TEST);
  assert.equal(service.getServiceStatus(), REMOTE_REASONING_STATUS.READY);
});

// --- 3. Independent Authoritative Payload Validation (Does NOT trust status metadata alone!) ---

test("4. Valid Step 11 sanitized payload accepted by payload validator", () => {
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "div", children: [{ id: "input_1", tagName: "input" }] },
    taskIntent: "SEARCH_QUERY"
  });

  const res = validateRemotePayload(sanitized.payload);
  assert.equal(res.valid, true);
});

test("5. Payload with status: 'SANITIZED' BUT containing raw password is REJECTED", () => {
  // Proves backend does NOT trust status: "SANITIZED" metadata alone!
  const maliciousPayload = {
    status: "SANITIZED",
    version: "1.0.0",
    taskIntent: "LOGIN",
    rawPassword: "SuperSecretPassword123!", // Raw password!
    domTree: { tagName: "form" }
  };

  const res = validateRemotePayload(maliciousPayload);
  assert.equal(res.valid, false);
  assert.match(res.error, /prohibited field|security failure|raw password/i);
});

test("6. Payload containing raw credit card number (Luhn pass) is REJECTED", () => {
  const payloadWithCard = {
    status: "SANITIZED",
    taskIntent: "CHECKOUT",
    data: "Please charge card 4532 0123 4567 8910 immediately"
  };

  const res = validateRemotePayload(payloadWithCard);
  assert.equal(res.valid, false);
  assert.match(res.error, /unmasked payment card/i);
});

test("7. Payload containing unmasked raw email address is REJECTED", () => {
  const payloadWithEmail = {
    status: "SANITIZED",
    taskIntent: "CONTACT",
    text: "User contact is john.doe@example.com for notification"
  };

  const res = validateRemotePayload(payloadWithEmail);
  assert.equal(res.valid, false);
  assert.match(res.error, /unmasked email address/i);
});

test("8. Payload containing unmasked raw phone number is REJECTED", () => {
  const payloadWithPhone = {
    status: "SANITIZED",
    taskIntent: "CONTACT",
    text: "Call support at +1 (555) 019-2834 now"
  };

  const res = validateRemotePayload(payloadWithPhone);
  assert.equal(res.valid, false);
  assert.match(res.error, /unmasked phone number/i);
});

test("9. Payload containing raw OTP or vault secret keyword is REJECTED", () => {
  const payloadWithSecret = {
    status: "SANITIZED",
    taskIntent: "VERIFY",
    vaultSecret: "123456"
  };

  const res = validateRemotePayload(payloadWithSecret);
  assert.equal(res.valid, false);
  assert.match(res.error, /prohibited field/i);
});

test("10. Payload containing raw DOM node or Element object is REJECTED", () => {
  const mockNode = { nodeType: 1, ownerDocument: {}, tagName: "DIV" };
  const payloadWithDom = {
    status: "SANITIZED",
    domElement: mockNode
  };

  const res = validateRemotePayload(payloadWithDom);
  assert.equal(res.valid, false);
  assert.match(res.error, /raw DOM node/i);
});

test("11. Payload containing raw screenshot or image data URL is REJECTED", () => {
  const payloadWithImage = {
    status: "SANITIZED",
    screenshot: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  };

  const res = validateRemotePayload(payloadWithImage);
  assert.equal(res.valid, false);
  assert.match(res.error, /screenshot or image buffer/i);
});

test("12. Redacted placeholders ([EMAIL_REDACTED], [LOCAL_ONLY]) and opaque tokens ({{TOKEN_...}}) are ACCEPTED", () => {
  const validSanitizedPayload = {
    status: "SANITIZED",
    taskIntent: "FORM_FILL",
    fields: [
      { id: "email_1", placeholder: "[EMAIL_REDACTED]" },
      { id: "pwd_1", placeholder: "[LOCAL_ONLY_PROTECTED]" },
      { id: "card_1", token: "{{TOKEN_PAYMENT_CARD_123}}" }
    ]
  };

  const res = validateRemotePayload(validSanitizedPayload);
  assert.equal(res.valid, true);
});

test("13. Oversized payload exceeding MAX_PAYLOAD_BYTES is REJECTED", () => {
  const hugePayload = {
    status: "SANITIZED",
    taskIntent: "BULK",
    hugeData: "A".repeat(260000) // Exceeds 250 KB limit
  };

  const res = validateRemotePayload(hugePayload);
  assert.equal(res.valid, false);
  assert.match(res.error, /exceeds maximum limit/i);
});

// --- 4. Remote Response Security Validation ---

test("14. Remote response with script injection (<script>, eval) is REJECTED", () => {
  const maliciousResponse = {
    ok: true,
    status: "COMPLETED",
    recommendedActions: [
      { actionType: "CLICK", target: { id: "<script>alert('hack')</script>" } }
    ]
  };

  const res = validateReasoningResponse(maliciousResponse);
  assert.equal(res.valid, false);
  assert.match(res.error, /script injection/i);
});

test("15. Remote response attempting secret request (rawPassword) is REJECTED", () => {
  const secretRequestResponse = {
    ok: true,
    status: "COMPLETED",
    recommendedActions: [
      { actionType: "TYPE", target: { id: "input1" }, rawPassword: "true" }
    ]
  };

  const res = validateReasoningResponse(secretRequestResponse);
  assert.equal(res.valid, false);
  assert.match(res.error, /raw vault secrets/i);
});

test("16. Remote response attempting direct DOM execution is REJECTED", () => {
  const directExecutionResponse = {
    ok: true,
    status: "COMPLETED",
    recommendedActions: [
      { actionType: "CLICK", executeDirectly: true }
    ]
  };

  const res = validateReasoningResponse(directExecutionResponse);
  assert.equal(res.valid, false);
  assert.match(res.error, /directly execute DOM/i);
});

// --- 5. Service & Provider Execution ---

test("17. ReasoningService processes valid Step 11 payload cleanly via MockTestReasoningProvider", async () => {
  const service = createReasoningService();
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "form", children: [{ id: "query_input", tagName: "input" }] },
    taskIntent: "SEARCH_QUERY"
  });

  const res = await service.processReasoningRequest(sanitized.payload);
  assert.equal(res.ok, true);
  assert.equal(res.status, REMOTE_REASONING_STATUS.COMPLETED);
  assert.ok(Array.isArray(res.recommendedActions));
  assert.equal(res.metadata.providerType, REASONING_PROVIDER_TYPES.MOCK_TEST);
  assert.ok(typeof res.executionTimeMs === "number");
});

test("18. ReasoningService rejects un-sanitized / malicious request safely", async () => {
  const service = createReasoningService();
  const res = await service.processReasoningRequest({
    status: "SANITIZED",
    rawPassword: "UnsafePassword123"
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.match(res.error, /prohibited field/i);
});

// --- 6. Integration Boundaries: Step 11 -> Step 15 -> Step 14 ---

test("19. Step 11 -> Step 15 -> Step 14 full integration pipeline operates securely", async () => {
  // Step 11: Generate sanitized payload
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "div", children: [{ id: "submit_btn", tagName: "button" }] },
    taskIntent: "SUBMIT_FORM"
  });
  assert.equal(sanitized.ok, true);

  // Step 15: Process payload via ReasoningService -> Returns action proposal
  const service = createReasoningService();
  const reasoningRes = await service.processReasoningRequest(sanitized.payload);
  assert.equal(reasoningRes.ok, true);
  assert.ok(reasoningRes.recommendedActions.length > 0);

  // Step 14: Route action proposal into Step 14 BrowserActionEngine for validation & local execution
  const actionEngine = createBrowserActionEngine();
  const actionProposal = reasoningRes.recommendedActions[0];

  const executionRes = actionEngine.executeAction(actionProposal, {
    pageState: { nodes: [{ id: actionProposal.target?.id }] }
  });

  assert.equal(executionRes.ok, true);
  assert.equal(executionRes.status, ACTION_RESULTS.COMPLETED);
});

test("20. Step 15 does NOT modify packages/privacy-core/src/index.js (zero privacy-core coupling)", async () => {
  const privacyCoreSrc = await readFile(resolve("packages/privacy-core/src/index.js"), "utf8");
  assert.equal(privacyCoreSrc.includes("ReasoningService"), false, "privacy-core index.js must NOT export ReasoningService.");
  assert.equal(privacyCoreSrc.includes("services/reasoning-backend"), false, "privacy-core index.js must NOT import from reasoning-backend.");
});

// --- 7. Security, Non-Hardcoding & Disposal ---

test("21. Static inspection: ReasoningService source contains zero hardcoded site rules", async () => {
  const src = await readFile(resolve("services/reasoning-backend/src/reasoning-service.js"), "utf8");
  const hardcodedSites = ["facebook.com", "google.com", "amazon.com", "bankofamerica.com"];
  for (const site of hardcodedSites) {
    assert.equal(src.includes(site), false, `Source must not contain hardcoded site '${site}'.`);
  }
});

test("22. Service disposal resets status cleanly to DISPOSED", () => {
  const service = createReasoningService();
  assert.equal(service.getServiceStatus(), REMOTE_REASONING_STATUS.READY);

  const dispRes = service.dispose();
  assert.equal(dispRes.ok, true);
  assert.equal(service.getServiceStatus(), REMOTE_REASONING_STATUS.DISPOSED);
});
