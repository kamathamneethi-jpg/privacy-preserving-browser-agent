/**
 * Remote Reasoning Backend Service (Step 15).
 * Receives ONLY sanitized context payloads produced by Step 11.
 * Validates request payload safety, invokes the reasoning provider, and validates response action proposals.
 *
 * Privacy & Security Guarantees:
 * 1. Sanitized Context Only: Receives exclusively Step 11 sanitized page representations.
 * 2. Independent Authoritative Validation: Does NOT trust `status: "SANITIZED"` alone. Performs recursive content scanning.
 * 3. Step 9 Vault Isolation: Vault secrets NEVER cross into remote reasoning.
 * 4. Step 14 Execution Authority: Step 15 ONLY produces structured action proposals. It NEVER directly executes browser actions.
 * 5. Accurate Provider Reporting: Default provider is MOCK_TEST (`providerType: "MOCK_TEST"`).
 */

import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../../../packages/shared-types/src/privacy-contracts.js";
import { REASONING_CONFIG, REASONING_SERVICE_VERSION } from "./reasoning-config.js";
import { validateRemotePayload } from "./payload-validator.js";
import { validateReasoningResponse } from "./response-validator.js";
import { LlmReasoningProvider } from "./llm-provider.js";

export { LlmReasoningProvider };

/**
 * Mock Reasoning Provider for Node.js automated testing.
 * Derives safe high-level action recommendations from sanitized context without accessing raw PII or secrets.
 */
export class MockTestReasoningProvider {
  constructor() {
    this.providerType = REASONING_PROVIDER_TYPES.MOCK_TEST;
  }

  async processRequest(requestPayload) {
    const payloadObj = requestPayload?.payload || requestPayload || {};
    const sanitizedState = payloadObj.sanitizedPageState || payloadObj.domTree || payloadObj;
    const taskIntent = payloadObj.taskIntent || requestPayload?.taskIntent || "GENERAL_NAVIGATION";
    const recommendedActions = [];

    // Helper to extract candidate nodes recursively
    function extractNodes(root) {
      if (!root || typeof root !== "object") return [];
      const list = [];
      if (root.id || root.token || root.targetId || root.tagName || root.type) list.push(root);
      const children = root.children || root.domNodes || root.nodes || root.visualBlocks || [];
      if (Array.isArray(children)) {
        for (const child of children) {
          list.push(...extractNodes(child));
        }
      }
      return list;
    }

    const nodes = extractNodes(sanitizedState);

    for (const node of nodes) {
      if (!node) continue;
      const targetId = node.id || node.token || node.targetId || node.attributes?.id || node.attrs?.id || "node_1";
      const tag = String(node.tagName || node.type || node.attributes?.type || "").toLowerCase();

      if (tag === "button" || tag === "a" || /btn|submit|click/i.test(targetId)) {
        recommendedActions.push({
          actionType: BROWSER_ACTION_TYPES.CLICK,
          target: { id: targetId },
          purpose: VAULT_PURPOSES.LOCAL_ACTION,
          destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
        });
      } else if (tag === "input" || tag === "textarea") {
        recommendedActions.push({
          actionType: BROWSER_ACTION_TYPES.TYPE,
          target: { id: targetId },
          parameters: { text: "sanitized_query" },
          purpose: VAULT_PURPOSES.SEARCH,
          destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
        });
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
      ok: true,
      status: REMOTE_REASONING_STATUS.COMPLETED,
      recommendedActions,
      reasoningSummary: `Sanitized context processed by MockTestReasoningProvider for task intent '${taskIntent}'.`,
      metadata: {
        providerType: this.providerType,
        timestamp: Date.now()
      }
    };
  }
}

/**
 * Modular Remote Reasoning Service Class
 */
export class ReasoningService {
  constructor(customConfig = {}) {
    this.config = { ...REASONING_CONFIG, ...customConfig };
    this.status = REMOTE_REASONING_STATUS.UNINITIALIZED;
    this.provider = customConfig.provider || new MockTestReasoningProvider();
    this.lastProcessedAt = null;
  }

  /**
   * Initializes the reasoning service.
   *
   * @param {object} [customConfig={}]
   * @returns {object} Initialization status
   */
  initialize(customConfig = {}) {
    try {
      this.config = { ...this.config, ...customConfig };
      if (customConfig.provider) this.provider = customConfig.provider;

      this.status = REMOTE_REASONING_STATUS.READY;

      return Object.freeze({
        ok: true,
        state: this.status,
        version: REASONING_SERVICE_VERSION,
        providerType: this.provider?.providerType || REASONING_PROVIDER_TYPES.MOCK_TEST
      });
    } catch (err) {
      this.status = REMOTE_REASONING_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        error: "Reasoning service initialization failed.",
        state: this.status
      });
    }
  }

  /**
   * Returns current service status state.
   *
   * @returns {string}
   */
  getServiceStatus() {
    return this.status;
  }

  /**
   * Processes a sanitized remote reasoning request payload.
   *
   * @param {object} requestPayload
   * @param {object} [options={}]
   * @returns {Promise<object>} Sanitized reasoning response
   */
  async processReasoningRequest(requestPayload, options = {}) {
    const startTime = Date.now();

    // 1. Lifecycle check
    if (this.status !== REMOTE_REASONING_STATUS.READY) {
      return Object.freeze({
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: `Reasoning service is in '${this.status}' state. Must be initialized before processing requests.`
      });
    }

    // 2. Authoritative Independent Payload Validation (does NOT trust status: "SANITIZED" metadata alone!)
    const payloadValidation = validateRemotePayload(requestPayload);
    if (!payloadValidation.valid) {
      return Object.freeze({
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: payloadValidation.error
      });
    }

    // 3. Invoke Reasoning Provider
    try {
      const providerResponse = await Promise.race([
        this.provider.processRequest(requestPayload, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Reasoning request timeout.")), this.config.REQUEST_TIMEOUT_MS))
      ]);

      // 4. Validate Provider Response
      const responseValidation = validateReasoningResponse(providerResponse);
      if (!responseValidation.valid) {
        return Object.freeze({
          ok: false,
          status: REMOTE_REASONING_STATUS.ERROR,
          error: responseValidation.error
        });
      }

      this.lastProcessedAt = Date.now();
      const latencyMs = Date.now() - startTime;

      return Object.freeze({
        ...providerResponse,
        executionTimeMs: latencyMs
      });
    } catch (err) {
      return Object.freeze({
        ok: false,
        status: REMOTE_REASONING_STATUS.ERROR,
        error: err.message || "Reasoning provider execution failed."
      });
    }
  }

  /**
   * Disposes of reasoning service state.
   *
   * @returns {object}
   */
  dispose() {
    this.status = REMOTE_REASONING_STATUS.DISPOSED;
    this.provider = null;
    this.lastProcessedAt = null;
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating an isolated ReasoningService instance.
 *
 * @param {object} [config={}]
 * @returns {ReasoningService}
 */
export function createReasoningService(config = {}) {
  const service = new ReasoningService(config);
  service.initialize(config);
  return service;
}

// Default singleton instance for reasoning-backend module
export const reasoningService = createReasoningService();
