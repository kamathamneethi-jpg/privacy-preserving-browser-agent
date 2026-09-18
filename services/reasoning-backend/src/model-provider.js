/**
 * Model Provider Abstraction & OpenRouter Provider Adapter (Step 15).
 * Integrates Free Vision / Agent Reasoning Models (e.g. Gemma 4 26B A4B) via OpenRouter OpenAI-compatible API.
 *
 * Privacy & Security Guarantees:
 * 1. Sanitized Context Only: Receives strictly Step 11 sanitized page representations.
 * 2. Privacy Boundary: Never receives raw PII, unmasked credentials, or vault secrets.
 * 3. Structured Output Authority: Model produces structured action proposals or tool calls only.
 * 4. Step 14 Authority: Model responses are NEVER directly executed; all proposals must pass Step 14 validation.
 * 5. Safe Credential Handling: API keys are injected at runtime and never hardcoded or logged.
 */

import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../../../packages/shared-types/src/privacy-contracts.js";
import { OPENROUTER_CONFIG, GROQ_CONFIG } from "./reasoning-config.js";
import { validateRemotePayload } from "./payload-validator.js";
import { validateReasoningResponse } from "./response-validator.js";

/**
 * Base Model Provider Class
 */
export class ModelProvider {
  constructor(providerType = REASONING_PROVIDER_TYPES.MOCK_TEST) {
    this.providerType = providerType;
  }

  /**
   * Processes a sanitized reasoning request.
   *
   * @param {object} requestPayload
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async processRequest(requestPayload, options = {}) {
    throw new Error("processRequest() must be implemented by subclass.");
  }
}

/**
 * Extracts and parses the first valid JSON object/array from mixed LLM output.
 * Handles markdown code blocks, chain-of-thought text, and balanced braces.
 *
 * @param {string} text
 * @returns {object|null}
 */
export function extractValidJson(text) {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();

  // 1. Direct JSON parse
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object") return direct;
  } catch {}

  // 2. Search for markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const block of codeBlocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  // 3. Scan for balanced curly braces in text
  for (let start = 0; start < trimmed.length; start++) {
    if (trimmed[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let end = start; end < trimmed.length; end++) {
      const char = trimmed[end];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            const candidate = trimmed.substring(start, end + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed && typeof parsed === "object") return parsed;
            } catch {}
          }
        }
      }
    }
  }

  return null;
}

/**
 * OpenRouter Provider Adapter for Gemma 4 26B A4B & OpenAI-compatible LLMs.
 */
export class OpenRouterProvider extends ModelProvider {
  constructor(config = {}) {
    super(REASONING_PROVIDER_TYPES.OPENROUTER);
    this.apiKey = config.apiKey || null;
    this.model = config.model || OPENROUTER_CONFIG.DEFAULT_MODEL;
    this.apiUrl = config.apiUrl || OPENROUTER_CONFIG.API_URL;
    this.timeoutMs = config.timeoutMs || OPENROUTER_CONFIG.REQUEST_TIMEOUT_MS;
    this.temperature = typeof config.temperature === "number" ? config.temperature : OPENROUTER_CONFIG.DEFAULT_TEMPERATURE;
    this.maxTokens = config.maxTokens || OPENROUTER_CONFIG.MAX_TOKENS;
    this.fetchClient = config.fetchClient || (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  }

  /**
   * Builds system prompt instructing model to act as a structured browser agent.
   *
   * @returns {string}
   */
  /**
   * Builds system prompt instructing model to act as a structured browser agent.
   *
   * @returns {string}
   */
  buildSystemPrompt() {
    return [
      "You are a Privacy-Preserving Browser Agent reasoning engine.",
      "You receive a sanitized list of interactive DOM elements currently present on the page, each with a temporary ID (e.g. el_1, el_2, ...).",
      "Your task is to plan browser actions to fulfill the user's task instruction.",
      "",
      "AVAILABLE BROWSER ACTIONS:",
      "- click(target): Click an interactive button, link, or element by elementId (e.g. 'el_1').",
      "- type(target, text): Enter text into an input field or textarea (e.g. 'el_2', text: 'lightweight laptops').",
      "- clear(target): Clear an input field or textarea (e.g. 'el_2').",
      "- select(target, value): Select an option in a dropdown (e.g. 'el_3', value: 'India').",
      "- check(target): Check a checkbox or radio button (e.g. 'el_4').",
      "- uncheck(target): Uncheck a checkbox (e.g. 'el_4').",
      "- press_key(target, key): Press a keyboard key (e.g. 'el_2', key: 'Enter').",
      "- submit(target): Submit a form (e.g. 'el_5').",
      "- scroll(direction, amount): Scroll the page ('down' or 'up', e.g. amount: 500).",
      "- go_back(): Navigate back in browser history.",
      "- wait(durationMs): Pause execution for dynamic page updates.",
      "- navigate(url): Navigate to a safe http:// or https:// URL.",
      "",
      "OUTPUT FORMAT REQUIREMENTS:",
      "You MUST respond ONLY with a valid, parseable JSON object adhering to this schema:",
      "{",
      '  "recommendedActions": [',
      '    {',
      '      "actionType": "CLICK",',
      '      "target": { "id": "el_1" },',
      '      "parameters": {},',
      '      "purpose": "LOCAL_ACTION",',
      '      "destination": "LOCAL_BROWSER"',
      '    }',
      '  ],',
      '  "reasoningSummary": "Short explanation of the proposed action."',
      "}",
      "",
      "Valid actionType values are: CLICK, TYPE, CLEAR, SELECT, CHECK, UNCHECK, PRESS_KEY, SUBMIT, SCROLL, GO_BACK, WAIT, NAVIGATE.",
      "For TYPE, provide parameters: { \"text\": \"...\" }.",
      "For SELECT, provide parameters: { \"value\": \"...\" }.",
      "For PRESS_KEY, provide parameters: { \"key\": \"Enter\" }.",
      "For SCROLL, provide parameters: { \"direction\": \"down\", \"amount\": 500 }.",
      "",
      "SECURITY RULES:",
      "1. NEVER output arbitrary JavaScript, CSS selectors, XPath, or script tags. Target elements ONLY by their elementId (e.g. 'el_1').",
      "2. NEVER request or emit raw passwords or sensitive payment card numbers.",
      "3. Respond ONLY with raw valid JSON."
    ].join("\n");
  }

  /**
   * Formats sanitized context into user prompt.
   *
   * @param {object} payloadObj
   * @returns {string}
   */
  buildUserPrompt(payloadObj) {
    const userTask = payloadObj.userTask || payloadObj.instruction || payloadObj.task || null;
    const taskIntent = payloadObj.taskIntent || "GENERAL_NAVIGATION";
    const interactiveElements = payloadObj.interactiveElements || [];
    const domTree = payloadObj.domTree || payloadObj.sanitizedPageState || {};
    const visualBlocks = payloadObj.visualBlocks || [];
    const tokenMapping = payloadObj.tokenMapping || {};

    const promptObj = {
      ...(userTask ? { userTask } : {}),
      taskIntent,
      interactiveElements: interactiveElements.map(el => ({
        elementId: el.elementId || el.id,
        tag: el.tag || el.tagName,
        role: el.role || null,
        text: el.text || null,
        ariaLabel: el.ariaLabel || null,
        placeholder: el.placeholder || null,
        name: el.name || null,
        type: el.type || null,
        value: el.value || null,
        checked: typeof el.checked === "boolean" ? el.checked : undefined,
        disabled: Boolean(el.disabled)
      })),
      sanitizedDom: domTree,
      visualBlocks: visualBlocks.slice(0, 20),
      detectedTokens: Object.keys(tokenMapping)
    };

    return JSON.stringify(promptObj, null, 2);
  }

  /**
   * Normalizes raw LLM JSON output into contract-compliant recommendedActions array.
   *
   * @param {object} parsedOutput
   * @returns {object} { recommendedActions: Array, reasoningSummary: string }
   */
  normalizeModelOutput(parsedOutput) {
    if (!parsedOutput || typeof parsedOutput !== "object") {
      throw new Error("Parsed model output must be an object.");
    }

    const recommendedActions = [];
    let reasoningSummary = parsedOutput.reasoningSummary || parsedOutput.reason || "Action proposed by reasoning model.";

    // Case 1: Standard recommendedActions array
    if (Array.isArray(parsedOutput.recommendedActions)) {
      for (const rawAction of parsedOutput.recommendedActions) {
        if (!rawAction || typeof rawAction !== "object") continue;

        const actionType = String(rawAction.actionType || rawAction.action || rawAction.type || "").toUpperCase();
        const targetId = typeof rawAction.target === "string" 
          ? rawAction.target 
          : (rawAction.target?.id || rawAction.target?.elementId || rawAction.targetId || rawAction.element_id || "page_root");

        let normalizedType = actionType;
        if (actionType === "INPUT" || actionType === "SEARCH") normalizedType = "TYPE";
        else if (actionType === "BACK" || actionType === "GOBACK") normalizedType = "GO_BACK";
        else if (actionType === "KEY" || actionType === "KEYPRESS" || actionType === "PRESSKEY") normalizedType = "PRESS_KEY";

        if (BROWSER_ACTION_TYPES[normalizedType]) {
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES[normalizedType],
            target: { id: targetId },
            parameters: rawAction.parameters || {
              ...(rawAction.text ? { text: rawAction.text } : {}),
              ...(rawAction.value ? { value: rawAction.value } : {}),
              ...(rawAction.key ? { key: rawAction.key } : {}),
              ...(rawAction.direction ? { direction: rawAction.direction } : {}),
              ...(rawAction.amount ? { amount: rawAction.amount } : {})
            },
            purpose: rawAction.purpose || VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
        }
      }
    }
    // Case 2: Single structured tool call format
    else if (parsedOutput.action || parsedOutput.actionType || parsedOutput.type) {
      const rawAction = parsedOutput;
      const normalizedAction = String(rawAction.action || rawAction.actionType || rawAction.type || "").toLowerCase();
      const targetId = typeof rawAction.target === "string"
        ? rawAction.target
        : (rawAction.element_id || rawAction.targetId || rawAction.target?.id || rawAction.target?.elementId || "page_root");

      switch (normalizedAction) {
        case "click":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.CLICK,
            target: { id: targetId },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "type":
        case "input":
        case "search":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.TYPE,
            target: { id: targetId },
            parameters: { text: rawAction.parameters?.text || rawAction.text || rawAction.value || "" },
            purpose: VAULT_PURPOSES.SEARCH,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "clear":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.CLEAR,
            target: { id: targetId },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "select":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.SELECT,
            target: { id: targetId },
            parameters: { value: rawAction.parameters?.value || rawAction.value || rawAction.option || "" },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "check":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.CHECK,
            target: { id: targetId },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "uncheck":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.UNCHECK,
            target: { id: targetId },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "press_key":
        case "presskey":
        case "key":
        case "keypress":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.PRESS_KEY,
            target: { id: targetId },
            parameters: { key: rawAction.parameters?.key || rawAction.key || "Enter" },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "submit":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.SUBMIT,
            target: { id: targetId },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "fill":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.FILL,
            target: { id: targetId },
            parameters: rawAction.parameters || {},
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "scroll":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.SCROLL,
            target: { id: targetId },
            parameters: {
              scrollX: typeof rawAction.scrollX === "number" ? rawAction.scrollX : 0,
              scrollY: typeof rawAction.scrollY === "number" ? rawAction.scrollY : (rawAction.direction === "down" ? 500 : -500),
              direction: rawAction.direction || (rawAction.scrollY < 0 ? "up" : "down"),
              amount: rawAction.amount || Math.abs(rawAction.scrollY || 500)
            },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "go_back":
        case "goback":
        case "back":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.GO_BACK,
            target: { id: "window" },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "navigate":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.NAVIGATE,
            target: { id: "window" },
            parameters: { url: rawAction.url || "" },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "wait":
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.WAIT,
            target: { id: "page_root" },
            parameters: { durationMs: rawAction.durationMs || 500 },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        case "ask_user":
          reasoningSummary = `Agent question for user: ${rawAction.question || "Clarification required."}`;
          recommendedActions.push({
            actionType: BROWSER_ACTION_TYPES.WAIT,
            target: { id: "page_root" },
            parameters: { question: rawAction.question },
            purpose: VAULT_PURPOSES.LOCAL_ACTION,
            destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
          });
          break;
        default:
          break;
      }
    }

    if (recommendedActions.length === 0) {
      recommendedActions.push({
        actionType: BROWSER_ACTION_TYPES.WAIT,
        target: { id: "page_root" },
        purpose: VAULT_PURPOSES.LOCAL_ACTION,
        destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
      });
    }

    return {
      recommendedActions,
      reasoningSummary
    };
  }

  /**
   * Processes a sanitized reasoning request through OpenRouter API.
   *
   * @param {object} requestPayload
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async processRequest(requestPayload, options = {}) {
    const apiKey = options.apiKey || this.apiKey;
    const requestedModel = options.model || this.model;
    let model = requestedModel;
    if (model === "google/gemma-4-26b-a4b" || model === "google/gemma-4-26b-a4b:free") {
      model = "google/gemma-4-26b-a4b-it:free";
    }

    // 1. Validate API Key Presence
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: "OpenRouter API key is required but not configured. Set API key in settings or pass via runtime options."
      };
    }

    // 2. Pre-flight Authoritative Payload Safety Validation
    const payloadValidation = validateRemotePayload(requestPayload);
    if (!payloadValidation.valid) {
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: payloadValidation.error || "Sanitized payload validation failed."
      };
    }

    // 3. Check Fetch Capability
    const fetchFunc = options.fetchClient || this.fetchClient;
    if (!fetchFunc || typeof fetchFunc !== "function") {
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: "Network fetch client is unavailable in current runtime environment."
      };
    }

    const payloadObj = requestPayload?.payload || requestPayload || {};
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(payloadObj);

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" }
    };

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`,
      "HTTP-Referer": "https://privacy-browser-agent.local",
      "X-Title": "Privacy-Preserving Browser Agent"
    };

    try {
      // 4. Send Request with AbortController Timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response;
      try {
        response = await fetchFunc(this.apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 5. Handle HTTP Status Codes
      if (!response.ok) {
        const statusCode = response.status;
        const errData = await response.json().catch(() => null);
        const detail = errData?.error?.message ? `: ${errData.error.message}` : "";

        if (statusCode === 401 || statusCode === 403) {
          return {
            ok: false,
            status: REMOTE_REASONING_STATUS.ERROR,
            error: `OpenRouter authentication failure (HTTP ${statusCode})${detail}. Verify your API key.`
          };
        }
        if (statusCode === 429) {
          return {
            ok: false,
            status: REMOTE_REASONING_STATUS.ERROR,
            error: `OpenRouter rate limit exceeded (HTTP 429)${detail}. Please wait before retrying.`
          };
        }
        if (statusCode >= 500) {
          return {
            ok: false,
            status: REMOTE_REASONING_STATUS.ERROR,
            error: `OpenRouter upstream provider error (HTTP ${statusCode})${detail}.`
          };
        }
        return {
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: `OpenRouter request failed with HTTP ${statusCode}${detail}.`
        };
      }

      const responseData = await response.json();
      const rawContent = responseData?.choices?.[0]?.message?.content;

      if (!rawContent || typeof rawContent !== "string") {
        return {
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: "OpenRouter returned an empty or missing completion message."
        };
      }

      // 6. Extract Valid JSON Object (Handles chain-of-thought, markdown code blocks, or mixed text)
      const parsedOutput = extractValidJson(rawContent);
      if (!parsedOutput) {
        return {
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: `Failed to parse structured model response as valid JSON (Preview: ${rawContent.slice(0, 120)}).`
        };
      }

      // 7. Normalize Model Output into Contract Proposal Format
      const normalized = this.normalizeModelOutput(parsedOutput);

      const candidateResponse = {
        ok: true,
        status: REMOTE_REASONING_STATUS.COMPLETED,
        recommendedActions: normalized.recommendedActions,
        reasoningSummary: normalized.reasoningSummary,
        metadata: {
          providerType: this.providerType,
          model: requestedModel,
          timestamp: Date.now()
        }
      };

      // 8. Authoritative Response Security Validation
      const responseValidation = validateReasoningResponse(candidateResponse);
      if (!responseValidation.valid) {
        return {
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: responseValidation.error || "Model response failed security validation."
        };
      }

      return candidateResponse;
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: "OpenRouter API request timed out."
        };
      }
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: err.message || "Network error communicating with OpenRouter."
      };
    }
  }
}

/**
 * Factory function for creating an OpenRouterProvider instance.
 *
 * @param {object} [config={}]
 * @returns {OpenRouterProvider}
 */
export function createOpenRouterProvider(config = {}) {
  return new OpenRouterProvider(config);
}

/**
 * Groq Provider Adapter for ultra-low latency reasoning models (e.g., openai/gpt-oss-20b, llama-3.3-70b).
 */
export class GroqProvider extends OpenRouterProvider {
  constructor(config = {}) {
    super({
      ...config,
      model: config.model || GROQ_CONFIG.DEFAULT_MODEL,
      apiUrl: config.apiUrl || GROQ_CONFIG.API_URL,
      timeoutMs: config.timeoutMs || GROQ_CONFIG.REQUEST_TIMEOUT_MS
    });
    this.providerType = REASONING_PROVIDER_TYPES.GROQ;
  }

  /**
   * Builds OpenAI-compatible chat payload tailored for Groq API.
   *
   * @param {object} sanitizedPayload
   * @returns {object}
   */
  buildOpenRouterRequest(sanitizedPayload) {
    const baseRequest = super.buildOpenRouterRequest(sanitizedPayload);
    return {
      ...baseRequest,
      model: this.model
    };
  }
}

/**
 * Factory function for creating a GroqProvider instance.
 *
 * @param {object} [config={}]
 * @returns {GroqProvider}
 */
export function createGroqProvider(config = {}) {
  return new GroqProvider(config);
}
