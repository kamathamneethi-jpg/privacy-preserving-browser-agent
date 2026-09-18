import test from "node:test";
import assert from "node:assert/strict";

import {
  LlmReasoningProvider,
  LLM_MODELS
} from "../services/reasoning-backend/src/llm-provider.js";
import {
  REMOTE_REASONING_STATUS,
  BROWSER_ACTION_TYPES,
  REASONING_PROVIDER_TYPES
} from "../packages/shared-types/src/privacy-contracts.js";

test("1. LlmReasoningProvider initializes with provider name and model", () => {
  const provider = new LlmReasoningProvider({
    providerName: "gemini",
    apiKey: "test_gemini_key",
    model: LLM_MODELS.GEMINI_FLASH
  });

  assert.strictEqual(provider.providerType, REASONING_PROVIDER_TYPES.REAL_REMOTE);
  assert.strictEqual(provider.providerName, "gemini");
  assert.strictEqual(provider.model, "gemini-2.0-flash");
});

test("2. Missing API key returns deterministic error status without throwing", async () => {
  const provider = new LlmReasoningProvider({
    providerName: "gemini",
    apiKey: ""
  });

  const res = await provider.processRequest({
    sanitizedPageState: { title: "Test Page" },
    taskIntent: "SEARCH"
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.status, REMOTE_REASONING_STATUS.ERROR);
  assert.ok(res.error.includes("Missing API key"));
});

test("3. Gemini API response parsing and action proposal conversion", async () => {
  const mockFetch = async (url, opts) => {
    assert.ok(url.includes("generativelanguage.googleapis.com"));
    const body = JSON.parse(opts.body);
    assert.ok(body.contents[0].parts[0].text.includes("Sanitized Page State"));

    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reasoningSummary: "Click search button to continue",
                    recommendedActions: [
                      {
                        actionType: "CLICK",
                        target: { id: "search_btn" },
                        purpose: "SEARCH"
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      })
    };
  };

  const provider = new LlmReasoningProvider({
    providerName: "gemini",
    apiKey: "dummy_gemini_key",
    fetchFn: mockFetch
  });

  const res = await provider.processRequest({
    sanitizedPageState: { domNodes: [{ id: "search_btn", type: "button" }] },
    taskIntent: "SEARCH"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.status, REMOTE_REASONING_STATUS.COMPLETED);
  assert.strictEqual(res.recommendedActions.length, 1);
  assert.strictEqual(res.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.CLICK);
  assert.strictEqual(res.recommendedActions[0].target.id, "search_btn");
});

test("4. OpenAI/Groq API response parsing and action proposal conversion", async () => {
  const mockFetch = async (url, opts) => {
    assert.ok(opts.headers.Authorization.includes("dummy_openai_key"));
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reasoningSummary: "Enter search query in input field",
                recommendedActions: [
                  {
                    actionType: "TYPE",
                    target: { id: "search_input" },
                    parameters: { text: "laptop" }
                  }
                ]
              })
            }
          }
        ]
      })
    };
  };

  const provider = new LlmReasoningProvider({
    providerName: "openai",
    apiKey: "dummy_openai_key",
    fetchFn: mockFetch
  });

  const res = await provider.processRequest({
    sanitizedPageState: { domNodes: [{ id: "search_input", type: "input" }] },
    taskIntent: "SEARCH"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.recommendedActions.length, 1);
  assert.strictEqual(res.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.TYPE);
  assert.strictEqual(res.recommendedActions[0].parameters.text, "laptop");
});

test("5. OpenRouter API invocation and header verification", async () => {
  const mockFetch = async (url, opts) => {
    assert.ok(url.includes("openrouter.ai"));
    assert.ok(opts.headers.Authorization.includes("test_openrouter_key"));
    assert.strictEqual(opts.headers["X-Title"], "PrivacyPreservingBrowserAgent");

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reasoningSummary: "OpenRouter routed to Llama 3.3",
                recommendedActions: [
                  {
                    actionType: "CLICK",
                    target: { id: "checkout_btn" }
                  }
                ]
              })
            }
          }
        ]
      })
    };
  };

  const provider = new LlmReasoningProvider({
    providerName: "openrouter",
    apiKey: "test_openrouter_key",
    fetchFn: mockFetch
  });

  const res = await provider.processRequest({
    sanitizedPageState: { domNodes: [{ id: "checkout_btn", type: "button" }] },
    taskIntent: "CHECKOUT"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.CLICK);
  assert.strictEqual(res.recommendedActions[0].target.id, "checkout_btn");
});

test("6. Hugging Face Inference API invocation and action parsing", async () => {
  const mockFetch = async (url, opts) => {
    assert.ok(url.includes("huggingface.co"));
    assert.ok(opts.headers.Authorization.includes("hf_dummy_token"));

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reasoningSummary: "HF serverless model selected submit action",
                recommendedActions: [
                  {
                    actionType: "SUBMIT",
                    target: { id: "form_1" }
                  }
                ]
              })
            }
          }
        ]
      })
    };
  };

  const provider = new LlmReasoningProvider({
    providerName: "huggingface",
    apiKey: "hf_dummy_token",
    fetchFn: mockFetch
  });

  const res = await provider.processRequest({
    sanitizedPageState: { domNodes: [{ id: "form_1", type: "form" }] },
    taskIntent: "SUBMIT_FORM"
  });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.recommendedActions[0].actionType, BROWSER_ACTION_TYPES.SUBMIT);
});

test("7. API Key is never leaked in reasoning summary or metadata", async () => {
  const secretKey = "sk-super-secret-production-key-12345";
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ reasoningSummary: "OK", recommendedActions: [] }) }]
          }
        }
      ]
    })
  });

  const provider = new LlmReasoningProvider({
    providerName: "gemini",
    apiKey: secretKey,
    fetchFn: mockFetch
  });

  const res = await provider.processRequest({
    sanitizedPageState: {},
    taskIntent: "FIND_INFO"
  });

  const serialized = JSON.stringify(res);
  assert.strictEqual(serialized.includes(secretKey), false, "API key must NEVER be leaked in responses");
});
