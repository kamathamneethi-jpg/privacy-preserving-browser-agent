import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  E2E_WORKFLOW_STATUS,
  SECURE_TRANSPORT_TYPES
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  ModelProvider,
  GroqProvider,
  createGroqProvider,
  GROQ_CONFIG
} from "../services/reasoning-backend/src/index.js";
import {
  buildSanitizedReasoningPayload,
  createBrowserAgentCoordinator,
  createSecureCommunicationClient,
  createBrowserActionEngine,
  createDomDriver,
  findPiiMatches,
  GroqTransport
} from "../packages/privacy-core/src/index.js";

// --- 1. Groq Provider Contracts & Instantiation ---

test("1. GroqProvider contract and default configuration", () => {
  const provider = createGroqProvider({ apiKey: "gsk-test-key-123" });
  assert.equal(provider.providerType, REASONING_PROVIDER_TYPES.GROQ);
  assert.equal(provider.model, "openai/gpt-oss-20b");
  assert.equal(provider.apiUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(provider.apiKey, "gsk-test-key-123");
  assert.ok(provider instanceof ModelProvider);
});

test("2. GroqProvider returns error if API key is missing", async () => {
  const provider = createGroqProvider({ apiKey: null });
  const res = await provider.processRequest({
    taskIntent: "SEARCH",
    sanitizedPageState: { domTree: {} }
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.match(res.error, /API key is required/);
});

// --- 2. Normal Task: Instruction -> Sanitized Context -> Groq Model -> Action Execution ---

test("3. Normal task: Groq returns structured proposal and executes action locally", async () => {
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

  const provider = createGroqProvider({
    apiKey: "gsk-test-key",
    model: "openai/gpt-oss-20b",
    fetchClient: mockFetch
  });

  const transport = new GroqTransport({ provider });
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
  assert.equal(receivedRequestBody.model, "openai/gpt-oss-20b");
  assert.equal(executedAction.actionType, BROWSER_ACTION_TYPES.TYPE);
  assert.equal(executedAction.targetId, "search_input_box");
  assert.equal(executedAction.params.text, "lightweight laptops");
});

// --- 3. Privacy Boundary: PII Protection ---

test("4. Privacy Boundary: Raw PII (email, phone, cards) is NEVER present in Groq request", async () => {
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

  const provider = createGroqProvider({
    apiKey: "gsk-test-key",
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

  // Critical Invariant: Zero raw PII in Groq HTTP request payload
  assert.equal(transmittedBody.includes(rawEmail), false, "Raw email must not be sent to Groq");
  assert.equal(transmittedBody.includes("4532-1234-5678-9010"), false, "Raw credit card must not be sent to Groq");
  assert.equal(transmittedBody.includes("555"), false, "Raw phone must not be sent to Groq");
});

// --- 4. Malformed / Refusal Output ---

test("5. Invalid Model Output: Malformed JSON from Groq fails safely with ZERO browser actions", async () => {
  let domActionAttempted = false;

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: "I cannot assist with that request: { broken..."
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

  const provider = createGroqProvider({
    apiKey: "gsk-test-key",
    fetchClient: mockFetch
  });

  const transport = new GroqTransport({ provider });
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

// --- 5. Static Inspection ---

test("6. Static inspection: Zero hardcoded Groq API keys in repository source code", async () => {
  const modelProviderSrc = await readFile(resolve("services/reasoning-backend/src/model-provider.js"), "utf8");
  assert.equal(modelProviderSrc.includes("gsk_"), false, "Must not contain hardcoded Groq API key");
  assert.equal(modelProviderSrc.includes("Bearer gsk_"), false, "Must not contain hardcoded Groq bearer token");
});
