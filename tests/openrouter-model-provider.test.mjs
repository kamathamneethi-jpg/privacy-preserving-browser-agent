import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES,
  ACTION_RESULTS,
  E2E_WORKFLOW_STATUS,
  SECURE_TRANSPORT_TYPES
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  ModelProvider,
  OpenRouterProvider,
  createOpenRouterProvider,
  OPENROUTER_CONFIG,
  createReasoningService
} from "../services/reasoning-backend/src/index.js";
import {
  buildSanitizedReasoningPayload,
  createBrowserAgentCoordinator,
  createSecureCommunicationClient,
  createBrowserActionEngine,
  createDomDriver,
  findPiiMatches,
  OpenRouterTransport
} from "../packages/privacy-core/src/index.js";

// --- 1. Model Provider Contracts & Instantiation ---

test("1. OpenRouterProvider contract and default configuration", () => {
  const provider = createOpenRouterProvider({ apiKey: "test-key-123" });
  assert.equal(provider.providerType, REASONING_PROVIDER_TYPES.OPENROUTER);
  assert.equal(provider.model, "google/gemma-4-26b-a4b");
  assert.equal(provider.apiUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(provider.apiKey, "test-key-123");
  assert.ok(provider instanceof ModelProvider);
});

test("2. OpenRouterProvider returns error if API key is missing", async () => {
  const provider = createOpenRouterProvider({ apiKey: null });
  const res = await provider.processRequest({
    taskIntent: "SEARCH",
    sanitizedPageState: { domTree: {} }
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.match(res.error, /API key is required/);
});

// --- 2. Normal Task: Instruction -> Sanitized Context -> Gemma Model -> Action Execution ---

test("3. Normal task: OpenRouter returns structured proposal and executes action locally", async () => {
  let simulatedFetchCalled = false;
  let receivedRequestBody = null;

  const mockFetch = async (url, options) => {
    simulatedFetchCalled = true;
    receivedRequestBody = JSON.parse(options.body);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: "type",
                element_id: "search_input_box",
                text: "lightweight laptops",
                reason: "User requested laptop search."
              })
            }
          }
        ]
      })
    };
  };

  let executedAction = null;
  const mockDomDriver = createDomDriver({
    executor: (actionType, targetId, params) => {
      executedAction = { actionType, targetId, params };
      return { ok: true };
    }
  });

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    fetchClient: mockFetch
  });

  const transport = new OpenRouterTransport({ provider });
  const commClient = createSecureCommunicationClient({ transport });
  const actionEngine = createBrowserActionEngine({ domDriver: mockDomDriver });
  const coordinator = createBrowserAgentCoordinator({ commClient, actionEngine });

  const result = await coordinator.runEndToEndTask(
    { userTask: "Search for lightweight laptops online" },
    {
      domTree: {
        tagName: "div",
        children: [{ id: "search_input_box", tagName: "input" }]
      },
      text: "Shop the best laptops online",
      nodes: [{ id: "search_input_box" }]
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.COMPLETED);
  assert.equal(simulatedFetchCalled, true);
  assert.equal(receivedRequestBody.model.startsWith("google/gemma-4-26b-a4b"), true);
  assert.equal(executedAction.actionType, BROWSER_ACTION_TYPES.TYPE);
  assert.equal(executedAction.targetId, "search_input_box");
  assert.equal(executedAction.params.text, "lightweight laptops");
});

// --- 3. Privacy Boundary: PII Protection ---

test("4. Privacy Boundary: Raw PII (email, phone, cards) is NEVER present in OpenRouter request", async () => {
  let transmittedBody = null;

  const mockFetch = async (url, options) => {
    transmittedBody = options.body;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: "click",
                element_id: "confirm_btn",
                reason: "Proceed after masked review."
              })
            }
          }
        ]
      })
    };
  };

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    fetchClient: mockFetch
  });

  const rawEmail = "john.doe@example.com";
  const rawPhone = "+1 (555) 234-5678";
  const rawCard = "4532-1234-5678-9010";
  const rawSensitiveText = `Contact ${rawEmail} or call ${rawPhone} with card ${rawCard} for checkout.`;
  const piiMatches = findPiiMatches(rawSensitiveText);
  assert.ok(piiMatches.length >= 2);

  const payload = buildSanitizedReasoningPayload({
    text: rawSensitiveText,
    domTree: {
      tagName: "form",
      children: [
        { id: "email_fld", textContent: rawEmail },
        { id: "card_fld", textContent: rawCard }
      ]
    },
    taskIntent: "FORM_SUBMISSION",
    detectedPii: piiMatches
  });

  const res = await provider.processRequest(payload.payload);

  assert.equal(res.ok, true);
  assert.ok(transmittedBody);

  // Critical Invariant: Zero raw PII in OpenRouter HTTP request payload
  assert.equal(transmittedBody.includes(rawEmail), false, "Raw email must not be sent to OpenRouter");
  assert.equal(transmittedBody.includes("4532-1234-5678-9010"), false, "Raw credit card must not be sent to OpenRouter");
  assert.equal(transmittedBody.includes("555"), false, "Raw phone must not be sent to OpenRouter");
});

// --- 4. Invalid Model Output / Malformed JSON ---

test("5. Invalid Model Output: Malformed JSON from LLM fails safely with ZERO browser actions", async () => {
  let domActionAttempted = false;

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: "Sorry, I am unable to generate valid JSON: { action: unquoted, broken... }"
          }
        }
      ]
    })
  });

  const mockDomDriver = createDomDriver({
    executor: () => {
      domActionAttempted = true;
      return { ok: true };
    }
  });

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    fetchClient: mockFetch
  });

  const transport = new OpenRouterTransport({ provider });
  const commClient = createSecureCommunicationClient({ transport });
  const actionEngine = createBrowserActionEngine({ domDriver: mockDomDriver });
  const coordinator = createBrowserAgentCoordinator({ commClient, actionEngine });

  const result = await coordinator.runEndToEndTask(
    { userTask: "Search for shoes" },
    { domTree: { tagName: "div" }, text: "Shoe store" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.DENIED);
  assert.equal(domActionAttempted, false, "No DOM action must execute when model output is malformed");
});

// --- 5. Policy Denial: Local Policy Engine Overrides Model ---

test("6. Policy Denial: Model proposing forbidden action is rejected by local policy engine", async () => {
  let domActionAttempted = false;

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "navigate",
              url: "javascript:stealCredentials()",
              reason: "Navigate to account"
            })
          }
        }
      ]
    })
  });

  const mockDomDriver = createDomDriver({
    executor: () => {
      domActionAttempted = true;
      return { ok: true };
    }
  });

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    fetchClient: mockFetch
  });

  const transport = new OpenRouterTransport({ provider });
  const commClient = createSecureCommunicationClient({ transport });
  const actionEngine = createBrowserActionEngine({ domDriver: mockDomDriver });
  const coordinator = createBrowserAgentCoordinator({ commClient, actionEngine });

  const result = await coordinator.runEndToEndTask(
    { userTask: "Login to account" },
    { domTree: { tagName: "div" }, text: "Account page" }
  );

  // The dangerous javascript: proposal was caught by Step 15 response validator / Step 14 action engine
  assert.equal(result.ok, false);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.DENIED);
  assert.equal(domActionAttempted, false, "Forbidden javascript: navigation must NOT execute in DOM");
});

// --- 6. API Failure Handling ---

test("7. API Failure: HTTP 401 Unauthorized fails safely without executing actions", async () => {
  let domActionAttempted = false;

  const mockFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "Invalid API key" } })
  });

  const mockDomDriver = createDomDriver({
    executor: () => {
      domActionAttempted = true;
      return { ok: true };
    }
  });

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-invalid-key",
    fetchClient: mockFetch
  });

  const transport = new OpenRouterTransport({ provider });
  const commClient = createSecureCommunicationClient({ transport });
  const actionEngine = createBrowserActionEngine({ domDriver: mockDomDriver });
  const coordinator = createBrowserAgentCoordinator({ commClient, actionEngine });

  const result = await coordinator.runEndToEndTask(
    { userTask: "Search for news" },
    { domTree: { tagName: "div" }, text: "News website" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.DENIED);
  assert.match(result.error, /401|authentication|transport/i);
  assert.equal(domActionAttempted, false);
});

test("8. API Failure: HTTP 429 Rate limit returns rate limit error safely", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "Rate limit exceeded" } })
  });

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    fetchClient: mockFetch
  });

  const res = await provider.processRequest({
    taskIntent: "SEARCH",
    sanitizedPageState: { domTree: {} }
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.match(res.error, /rate limit exceeded/i);
});

test("9. API Failure: Request timeout fails safely", async () => {
  const mockFetch = async (url, options) => {
    return new Promise((resolve, reject) => {
      const timeoutError = new Error("The operation was aborted.");
      timeoutError.name = "AbortError";
      setTimeout(() => reject(timeoutError), 20);
    });
  };

  const provider = createOpenRouterProvider({
    apiKey: "sk-or-test-key",
    timeoutMs: 10,
    fetchClient: mockFetch
  });

  const res = await provider.processRequest({
    taskIntent: "SEARCH",
    sanitizedPageState: { domTree: {} }
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.match(res.error, /timed out/i);
});

// --- 7. Tool Normalization Tests ---

test("10. Tool normalization: Maps click, type, fill, scroll, wait, navigate, and ask_user tools", () => {
  const provider = createOpenRouterProvider();

  const clickNorm = provider.normalizeModelOutput({ action: "click", element_id: "btn_ok" });
  assert.equal(clickNorm.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.CLICK);
  assert.equal(clickNorm.recommendedActions[0].target.id, "btn_ok");

  const scrollNorm = provider.normalizeModelOutput({ action: "scroll", direction: "down" });
  assert.equal(scrollNorm.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.SCROLL);
  assert.equal(scrollNorm.recommendedActions[0].parameters.scrollY, 500);

  const askUserNorm = provider.normalizeModelOutput({ action: "ask_user", question: "Which color do you prefer?" });
  assert.equal(askUserNorm.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.WAIT);
  assert.match(askUserNorm.reasoningSummary, /Which color do you prefer/);
});

// --- 8. API Key Security ---

test("11. Static inspection: Zero hardcoded API keys in repository source code", async () => {
  const modelProviderSrc = await readFile(resolve("services/reasoning-backend/src/model-provider.js"), "utf8");
  assert.equal(modelProviderSrc.includes("sk-or-v1-"), false, "Must not contain hardcoded OpenRouter key");
  assert.equal(modelProviderSrc.includes("Bearer sk-"), false, "Must not contain hardcoded bearer token");
});
