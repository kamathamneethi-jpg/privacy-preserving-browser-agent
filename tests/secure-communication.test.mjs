import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SECURE_COMMUNICATION_STATUS,
  SECURE_TRANSPORT_TYPES,
  SECURE_REQUEST_SHAPE,
  SECURE_RESPONSE_SHAPE,
  AUTHENTICATION_STATUS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  VAULT_PURPOSES
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  SecureCommunicationClient,
  MockTestTransport,
  createSecureCommunicationClient,
  AuthenticationProvider,
  createAuthenticationProvider,
  SECURE_COMM_VERSION,
  SECURE_COMM_CONFIG,
  buildSanitizedReasoningPayload,
  createBrowserActionEngine,
  ACTION_RESULTS
} from "../packages/privacy-core/src/index.js";
import { ReasoningService, createReasoningService } from "../services/reasoning-backend/src/index.js";

// --- 1. Contract & Configuration Verification ---

test("1. Step 16 Secure Communication contracts exist and adhere to immutability rules", () => {
  assert.equal(SECURE_COMMUNICATION_STATUS.READY, "READY");
  assert.equal(SECURE_COMMUNICATION_STATUS.TRANSMITTING, "TRANSMITTING");
  assert.equal(SECURE_COMMUNICATION_STATUS.DISPOSED, "DISPOSED");
  assert.equal(SECURE_TRANSPORT_TYPES.REAL_REMOTE_TRANSPORT, "REAL_REMOTE_TRANSPORT");
  assert.equal(SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT, "MOCK_TEST_TRANSPORT");
  assert.equal(SECURE_REQUEST_SHAPE.correlationId, "string");
  assert.equal(SECURE_RESPONSE_SHAPE.recommendedActions, "array");
  assert.equal(AUTHENTICATION_STATUS.AUTHENTICATED, "AUTHENTICATED");
  assert.throws(() => { SECURE_COMMUNICATION_STATUS.NEW_PROP = "test"; }, TypeError);
});

test("2. Secure communication configuration contains defaults, retry rules, and timeouts", () => {
  assert.equal(SECURE_COMM_VERSION, "1.0.0");
  assert.equal(SECURE_COMM_CONFIG.DEFAULT_TRANSPORT, SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT);
  assert.equal(SECURE_COMM_CONFIG.REQUEST_TIMEOUT_MS, 5000);
  assert.equal(SECURE_COMM_CONFIG.MAX_REQUEST_SIZE_BYTES, 250000);
  assert.equal(SECURE_COMM_CONFIG.MAX_RETRIES, 3);
  assert.ok(SECURE_COMM_CONFIG.PERMITTED_REMOTE_PROTOCOLS.includes("https:"));
  assert.ok(SECURE_COMM_CONFIG.FORBIDDEN_PROTOCOLS.includes("http:"));
  assert.ok(SECURE_COMM_CONFIG.RETRYABLE_STATUS_CODES.includes(503));
  assert.ok(SECURE_COMM_CONFIG.NON_RETRYABLE_STATUS_CODES.includes(401));
});

// --- 2. Client Lifecycle & Authentication Provider ---

test("3. SecureCommunicationClient instantiation and initialize lifecycle", () => {
  const client = new SecureCommunicationClient();
  assert.equal(client.getClientStatus(), SECURE_COMMUNICATION_STATUS.UNINITIALIZED);

  const initRes = client.initialize();
  assert.equal(initRes.ok, true);
  assert.equal(initRes.state, SECURE_COMMUNICATION_STATUS.READY);
  assert.equal(initRes.transportType, SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT);
  assert.equal(client.getClientStatus(), SECURE_COMMUNICATION_STATUS.READY);
});

test("4. AuthenticationProvider runtime injection & credential clearing", () => {
  const auth = createAuthenticationProvider();
  assert.equal(auth.getAuthStatus(), AUTHENTICATION_STATUS.UNAUTHENTICATED);
  assert.deepEqual(auth.getAuthHeader(), {});

  auth.injectCredentials({ token: "runtime_secret_bearer_token_123" });
  assert.equal(auth.getAuthStatus(), AUTHENTICATION_STATUS.AUTHENTICATED);
  assert.deepEqual(auth.getAuthHeader(), { Authorization: "Bearer runtime_secret_bearer_token_123" });

  auth.clearCredentials();
  assert.equal(auth.getAuthStatus(), AUTHENTICATION_STATUS.UNAUTHENTICATED);
  assert.deepEqual(auth.getAuthHeader(), {});
});

// --- 3. Pre-Serialization Sanitization & PII Boundary Checks ---

test("5. Valid Step 11 sanitized payload accepted for transmission", async () => {
  const client = createSecureCommunicationClient();
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "form", children: [{ id: "search_input", tagName: "input" }] },
    taskIntent: "SEARCH_QUERY"
  });

  const res = await client.sendSanitizedPayload(sanitized.payload);
  assert.equal(res.ok, true);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.COMPLETED);
  assert.ok(Array.isArray(res.recommendedActions));
});

test("6. Raw DOM element object is rejected BEFORE serialization", async () => {
  let jsonSerialized = false;
  const mockRawPage = {
    nodeType: 1,
    ownerDocument: {},
    rawHtml: "<input value='secret' />",
    toJSON: () => { jsonSerialized = true; return {}; }
  };

  const client = createSecureCommunicationClient();
  const res = await client.sendSanitizedPayload(mockRawPage);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
  assert.equal(jsonSerialized, false, "Raw page object must NEVER be JSON serialized!");
});

test("7. Raw password in request payload is rejected before serialization", async () => {
  const client = createSecureCommunicationClient();
  const rawPayload = {
    status: "SANITIZED",
    rawPassword: "SuperSecretPassword123!"
  };

  const res = await client.sendSanitizedPayload(rawPayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

test("8. Raw credit card number (Luhn pass) is rejected", async () => {
  const client = createSecureCommunicationClient();
  const cardPayload = {
    status: "SANITIZED",
    text: "Card 4532 0123 4567 8910"
  };

  const res = await client.sendSanitizedPayload(cardPayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

test("9. Unmasked raw email address is rejected", async () => {
  const client = createSecureCommunicationClient();
  const emailPayload = {
    status: "SANITIZED",
    email: "user@domain.invalid"
  };

  const res = await client.sendSanitizedPayload(emailPayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

test("10. Raw OTP and vault secret keywords are rejected", async () => {
  const client = createSecureCommunicationClient();
  const secretPayload = {
    status: "SANITIZED",
    vaultSecret: "998877"
  };

  const res = await client.sendSanitizedPayload(secretPayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

test("11. Raw screenshot data URL or image buffer is rejected", async () => {
  const client = createSecureCommunicationClient();
  const imagePayload = {
    status: "SANITIZED",
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  };

  const res = await client.sendSanitizedPayload(imagePayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

// --- 4. Endpoint Security & Protocol Validation ---

test("12. Insecure HTTP endpoint URL is rejected in remote mode", () => {
  const client = createSecureCommunicationClient();
  const httpCheck = client.validateEndpoint("http://remote-backend.invalid/reason");
  assert.equal(httpCheck.valid, false);
  assert.match(httpCheck.error, /Forbidden protocol|HTTPS required/i);
});

test("13. Forbidden protocol schemes (javascript:, data:, file:) are rejected", () => {
  const client = createSecureCommunicationClient();
  assert.equal(client.validateEndpoint("javascript:alert(1)").valid, false);
  assert.equal(client.validateEndpoint("data:text/html,hack").valid, false);
  assert.equal(client.validateEndpoint("file:///etc/passwd").valid, false);
  assert.equal(client.validateEndpoint("https://valid-remote-backend.invalid/reason").valid, true);
});

test("14. Expected origin validation rejects mismatched remote origins", () => {
  const client = createSecureCommunicationClient({ expectedOrigin: "https://trusted-domain.invalid" });
  const check = client.validateEndpoint("https://untrusted-domain.invalid/api");
  assert.equal(check.valid, false);
  assert.match(check.error, /origin mismatch/i);
});

// --- 5. Stale Request Protection & Byte Size Limits ---

test("15. Request timestamp older than MAX_CLOCK_SKEW_MS is rejected with DENIED_STALE_REQUEST", async () => {
  const client = createSecureCommunicationClient();
  const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div" } });
  const staleTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes old!

  const res = await client.sendSanitizedPayload(sanitized.payload, { timestamp: staleTimestamp });
  assert.equal(res.ok, false);
  assert.equal(res.status, "DENIED_STALE_REQUEST");
});

test("16. UTF-8 byte size limit (MAX_REQUEST_SIZE_BYTES) is enforced accurately", async () => {
  const client = createSecureCommunicationClient({ MAX_REQUEST_SIZE_BYTES: 1000 });
  const oversizedPayload = {
    status: "SANITIZED",
    data: "A".repeat(1500)
  };

  const res = await client.sendSanitizedPayload(oversizedPayload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

// --- 6. Strict Error Retry Classification ---

test("17. Transient error 503 is retried up to MAX_RETRIES cap", async () => {
  let attempts = 0;
  const mockFlakyTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => {
      attempts += 1;
      if (attempts < 3) {
        return { ok: false, statusCode: 503, error: "Transient server busy" };
      }
      return { ok: true, status: "COMPLETED", statusCode: 200, recommendedActions: [] };
    }
  };

  const client = createSecureCommunicationClient({ transport: mockFlakyTransport, MAX_RETRIES: 3, RETRY_DELAY_MS: 10 });
  const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div" } });

  const res = await client.sendSanitizedPayload(sanitized.payload);
  assert.equal(res.ok, true);
  assert.equal(attempts, 3);
});

test("18. Non-transient errors (401 Unauthorized, 403 Forbidden) are NEVER retried", async () => {
  let attempts = 0;
  const mockAuthFailTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => {
      attempts += 1;
      return { ok: false, statusCode: 401, error: "Unauthorized token" };
    }
  };

  const client = createSecureCommunicationClient({ transport: mockAuthFailTransport, MAX_RETRIES: 3, RETRY_DELAY_MS: 10 });
  const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div" } });

  const res = await client.sendSanitizedPayload(sanitized.payload);
  assert.equal(res.ok, false);
  assert.equal(attempts, 1, "401 Unauthorized MUST NOT be retried!");
});

// --- 7. Response Security & Zero Body Logging ---

test("19. Response with script injection or direct DOM execution proposal is rejected", async () => {
  const mockMaliciousTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => ({
      ok: true,
      statusCode: 200,
      recommendedActions: [{ actionType: "CLICK", executeDirectly: true }]
    })
  };

  const client = createSecureCommunicationClient({ transport: mockMaliciousTransport });
  const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div" } });

  const res = await client.sendSanitizedPayload(sanitized.payload);
  assert.equal(res.ok, false);
  assert.equal(res.status, SECURE_COMMUNICATION_STATUS.DENIED);
});

test("20. Correlation ID contains zero PII and logger output contains NO body or credentials", async () => {
  const client = createSecureCommunicationClient();
  const correlationId = client.generateCorrelationId();

  assert.ok(correlationId.startsWith("req_corr_"));
  assert.equal(correlationId.includes("user"), false);
  assert.equal(correlationId.includes("@"), false);

  const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div" } });
  const res = await client.sendSanitizedPayload(sanitized.payload);

  const resStr = JSON.stringify(res);
  assert.equal(resStr.includes("sanitizedPayload"), false);
  assert.equal(resStr.includes("Authorization"), false);
});

// --- 8. Integration Boundaries: Step 11 -> Step 16 -> Step 15 -> Step 14 ---

test("21. Step 11 -> Step 16 -> Step 15 -> Step 14 end-to-end integration works cleanly", async () => {
  // 1. Step 11: Build sanitized payload
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "form", children: [{ id: "action_btn_1", tagName: "button" }] },
    taskIntent: "FORM_SUBMIT"
  });

  // 2. Step 16: Send over SecureCommunicationClient -> Step 15 Reasoning Backend -> Returns proposals
  const commClient = createSecureCommunicationClient();
  const commRes = await commClient.sendSanitizedPayload(sanitized.payload);

  assert.equal(commRes.ok, true);
  assert.equal(commRes.status, SECURE_COMMUNICATION_STATUS.COMPLETED);
  assert.ok(commRes.recommendedActions.length > 0);

  // 3. Step 14: Route action proposal into Step 14 BrowserActionEngine for local execution
  const actionEngine = createBrowserActionEngine();
  const proposal = commRes.recommendedActions[0];

  const execRes = actionEngine.executeAction(proposal, {
    pageState: { nodes: [{ id: proposal.target?.id }] }
  });

  assert.equal(execRes.ok, true);
  assert.equal(execRes.status, ACTION_RESULTS.COMPLETED);
});

test("22. Static inspection: SecureCommunicationClient contains zero hardcoded production endpoints or credentials", async () => {
  const src = await readFile(resolve("packages/privacy-core/src/secure-communication-client.js"), "utf8");
  const forbiddenStrings = ["https://example.com", "production-api-key", "bearer_token_123"];
  for (const str of forbiddenStrings) {
    assert.equal(src.includes(str), false, `Source must not contain hardcoded string '${str}'.`);
  }
});

test("23. Client disposal resets status cleanly to DISPOSED", () => {
  const client = createSecureCommunicationClient();
  assert.equal(client.getClientStatus(), SECURE_COMMUNICATION_STATUS.READY);

  const dispRes = client.dispose();
  assert.equal(dispRes.ok, true);
  assert.equal(client.getClientStatus(), SECURE_COMMUNICATION_STATUS.DISPOSED);
});
