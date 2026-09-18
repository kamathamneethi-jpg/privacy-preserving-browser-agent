/**
 * Live LLM Reasoning Provider Adapter (Gemini, OpenAI, Groq, OpenRouter, Hugging Face).
 * Connects the remote reasoning backend to real LLM APIs.
 *
 * Privacy & Security Guarantees:
 * 1. API keys are loaded strictly on the backend via environment variables (never sent to or bundled in the Chrome extension).
 * 2. Receives ONLY Step 11 sanitized page representations and task intents.
 * 3. Formats responses into contract-valid BROWSER_ACTION_TYPES proposals.
 */

import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../../../packages/shared-types/src/privacy-contracts.js";

export const LLM_MODELS = Object.freeze({
  GEMINI_FLASH: "gemini-2.0-flash",
  GEMINI_15_FLASH: "gemini-1.5-flash",
  OPENAI_GPT4O_MINI: "gpt-4o-mini",
  OPENAI_GPT4O: "gpt-4o",
  GROQ_LLAMA3: "llama-3.3-70b-versatile",
  OPENROUTER_DEFAULT: "meta-llama/llama-3.3-70b-instruct",
  HUGGINGFACE_DEFAULT: "meta-llama/Llama-3.3-70B-Instruct"
});

export class LlmReasoningProvider {
  constructor(options = {}) {
    this.providerType = REASONING_PROVIDER_TYPES.REAL_REMOTE;
    this.providerName = options.providerName || process.env.LLM_PROVIDER || "gemini";
    this.apiKey = options.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.HUGGINGFACE_API_KEY ||
      process.env.HF_TOKEN ||
      process.env.REASONING_API_KEY ||
      "";

    this.model = options.model || this._getDefaultModelForProvider(this.providerName);
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  _getDefaultModelForProvider(provider) {
    const p = String(provider).toLowerCase();
    if (p === "gemini") return LLM_MODELS.GEMINI_FLASH;
    if (p === "groq") return LLM_MODELS.GROQ_LLAMA3;
    if (p === "openrouter") return LLM_MODELS.OPENROUTER_DEFAULT;
    if (p === "huggingface" || p === "hf") return LLM_MODELS.HUGGINGFACE_DEFAULT;
    return LLM_MODELS.OPENAI_GPT4O_MINI;
  }

  /**
   * Processes a sanitized context payload by invoking the remote LLM API.
   *
   * @param {object} requestPayload
   * @returns {Promise<object>} Standardized reasoning response
   */
  async processRequest(requestPayload) {
    const payloadObj = requestPayload?.payload || requestPayload || {};
    const sanitizedState = payloadObj.sanitizedPageState || payloadObj.domTree || payloadObj;
    const taskIntent = payloadObj.taskIntent || requestPayload?.taskIntent || "GENERAL_TASK";

    if (!this.apiKey) {
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: `Missing API key for LLM provider '${this.providerName}'. Set ${this.providerName.toUpperCase()}_API_KEY in backend .env.`,
        recommendedActions: []
      };
    }

    const systemPrompt = `You are an AI Browser Automation Agent.
You receive a sanitized webpage structure with opaque element IDs and placeholder tokens (e.g. {{EMAIL_1}}).
Your job is to produce the next logical browser action(s) to achieve the user's task intent: "${taskIntent}".

Supported Action Types:
- CLICK: { actionType: "CLICK", target: { id: "element_id" } }
- TYPE: { actionType: "TYPE", target: { id: "element_id" }, parameters: { text: "value" } }
- FILL: { actionType: "FILL", target: { id: "element_id" }, parameters: { vaultId: "ref" } }
- SELECT: { actionType: "SELECT", target: { id: "element_id" }, parameters: { value: "option" } }
- SCROLL: { actionType: "SCROLL", target: { id: "page" }, parameters: { x: 0, y: 300 } }
- NAVIGATE: { actionType: "NAVIGATE", parameters: { url: "https://example.com" } }
- WAIT: { actionType: "WAIT", parameters: { ms: 1000 } }

Output STRICT JSON only matching this schema:
{
  "reasoningSummary": "Short explanation of chosen actions",
  "recommendedActions": [
    {
      "actionType": "CLICK",
      "target": { "id": "element_id" },
      "purpose": "LOCAL_ACTION",
      "destination": "LOCAL_BROWSER"
    }
  ]
}`;

    const userPrompt = `Sanitized Page State:\n${JSON.stringify(sanitizedState, null, 2)}`;

    try {
      let rawResponseText = "";
      const pName = this.providerName.toLowerCase();

      if (pName === "gemini") {
        rawResponseText = await this._callGemini(systemPrompt, userPrompt);
      } else if (pName === "groq") {
        rawResponseText = await this._callGroq(systemPrompt, userPrompt);
      } else if (pName === "openrouter") {
        rawResponseText = await this._callOpenRouter(systemPrompt, userPrompt);
      } else if (pName === "huggingface" || pName === "hf") {
        rawResponseText = await this._callHuggingFace(systemPrompt, userPrompt);
      } else {
        rawResponseText = await this._callOpenAi(systemPrompt, userPrompt);
      }

      const parsed = this._parseAndSanitizeLlmResponse(rawResponseText, taskIntent);
      return {
        ok: true,
        status: REMOTE_REASONING_STATUS.COMPLETED,
        recommendedActions: parsed.recommendedActions,
        reasoningSummary: parsed.reasoningSummary,
        metadata: {
          providerType: this.providerType,
          providerName: this.providerName,
          model: this.model,
          timestamp: Date.now()
        }
      };
    } catch (err) {
      return {
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: `LLM provider error (${this.providerName}): ${err.message}`,
        recommendedActions: []
      };
    }
  }

  async _callGemini(systemPrompt, userPrompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  }

  async _callOpenAi(systemPrompt, userPrompt) {
    const url = "https://api.openai.com/v1/chat/completions";
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "{}";
  }

  async _callGroq(systemPrompt, userPrompt) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "{}";
  }

  async _callOpenRouter(systemPrompt, userPrompt) {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/privacy-agent",
        "X-Title": "PrivacyPreservingBrowserAgent"
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "{}";
  }

  async _callHuggingFace(systemPrompt, userPrompt) {
    const url = "https://router.huggingface.co/v1/chat/completions";
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Hugging Face API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "{}";
  }

  _parseAndSanitizeLlmResponse(rawJsonText, taskIntent) {
    let parsed = {};
    try {
      parsed = JSON.parse(rawJsonText);
    } catch {
      // Fallback extraction if model wraps output in markdown fences
      const jsonMatch = rawJsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          parsed = {};
        }
      }
    }

    const recommendedActions = [];
    const actionsArray = Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [];

    for (const action of actionsArray) {
      if (!action || typeof action !== "object") continue;
      const type = String(action.actionType || action.type || "").toUpperCase();

      if (Object.values(BROWSER_ACTION_TYPES).includes(type)) {
        recommendedActions.push({
          actionType: type,
          target: typeof action.target === "object" ? action.target : { id: String(action.target || "page_root") },
          ...(action.parameters ? { parameters: action.parameters } : {}),
          purpose: action.purpose || VAULT_PURPOSES.LOCAL_ACTION,
          destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
        });
      }
    }

    // Safe fallback if LLM returned 0 actions
    if (recommendedActions.length === 0) {
      recommendedActions.push({
        actionType: BROWSER_ACTION_TYPES.WAIT,
        target: { id: "page_root" },
        parameters: { ms: 1000 },
        purpose: VAULT_PURPOSES.LOCAL_ACTION,
        destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
      });
    }

    return {
      reasoningSummary: parsed.reasoningSummary || `Action plan generated for '${taskIntent}' via ${this.providerName}.`,
      recommendedActions
    };
  }
}
