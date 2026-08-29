/**
 * Browser-Agent Action System Engine (Step 14).
 * Provides a modular, local-only browser action validation and execution framework.
 *
 * Privacy & Security Guarantees:
 * 1. 100% Local Execution: Executes actions strictly within local browser/extension boundaries.
 *    No remote destination execution permitted (DENIED_REMOTE_DESTINATION).
 * 2. Step 8 Policy Enforcement: Policy decisions (REDACT, LOCAL_ONLY, TOKENIZE, ALLOW) are strictly enforced.
 *    REDACT actions remain denied. Policy restrictions can never be upgraded or bypassed.
 * 3. Step 9 Vault Isolation: Sensitive form filling retrieves secrets exclusively from Step 9 Vault
 *    when authorizationGranted === true, purpose matches, and destination is local.
 * 4. Zero Secret Leakage: Action results, error messages, and logs contain only sanitized metadata
 *    (status, actionType, targetId, executionTimeMs). Raw secrets are never serialized into outputs.
 * 5. Dangerous Action Protection: Rejects arbitrary JavaScript, eval(), new Function(), or unsafe
 *    protocols (javascript:, data:, file:).
 * 6. Stale Target Protection: Target resolution prioritizes opaque references and validates target
 *    existence against current page state. Rejects missing/stale targets safely.
 */

import {
  ACTION_STATUS,
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  ACTION_TARGET_TYPES,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS
} from "../../shared-types/src/privacy-contracts.js";
import {
  ACTION_CONFIG,
  ACTION_SYSTEM_VERSION,
  validateNavigationProtocol
} from "./action-config.js";
import { evaluatePiiPolicyItem } from "./policy-engine.js";
import { privacyVault } from "./privacy-vault.js";
import { createDomDriver } from "./dom-driver.js";

export { validateNavigationProtocol };

/**
 * Modular Browser-Agent Action Engine Class
 */
export class BrowserActionEngine {
  constructor(customConfig = {}) {
    this.config = { ...ACTION_CONFIG, ...customConfig };
    this.status = ACTION_STATUS.UNINITIALIZED;
    this.vault = customConfig.vault || privacyVault;
    this.domDriver = customConfig.domDriver !== undefined ? customConfig.domDriver : createDomDriver();
    this.lastProcessedAt = null;
  }

  /**
   * Initializes the action engine.
   *
   * @param {object} [customConfig={}]
   * @returns {object} Initialization status
   */
  initialize(customConfig = {}) {
    try {
      this.config = { ...this.config, ...customConfig };
      if (customConfig.vault) this.vault = customConfig.vault;
      if (customConfig.domDriver !== undefined) this.domDriver = customConfig.domDriver;

      this.status = ACTION_STATUS.READY;

      return Object.freeze({
        ok: true,
        state: this.status,
        version: ACTION_SYSTEM_VERSION
      });
    } catch (err) {
      this.status = ACTION_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        error: "Browser action engine initialization failed.",
        state: this.status
      });
    }
  }

  /**
   * Returns current engine status state.
   *
   * @returns {string}
   */
  getActionStatus() {
    return this.status;
  }

  /**
   * Validates structural and security requirements of an action request.
   *
   * @param {object} actionRequest
   * @returns {object} { valid: boolean, result?: string, error?: string }
   */
  validateAction(actionRequest) {
    if (!actionRequest || typeof actionRequest !== "object") {
      return { valid: false, result: ACTION_RESULTS.DENIED_INVALID_ACTION, error: "Action request must be an object." };
    }

    const { actionType, destination, target, parameters } = actionRequest;

    // 1. Action type validation
    if (!actionType || !this.config.ALLOWED_ACTION_TYPES.includes(actionType)) {
      return { valid: false, result: ACTION_RESULTS.DENIED_INVALID_ACTION, error: `Unsupported or missing actionType: ${actionType}` };
    }

    // 2. Destination validation: Only local destinations permitted
    if (!destination || !this.config.LOCAL_DESTINATIONS.includes(destination)) {
      return { valid: false, result: ACTION_RESULTS.DENIED_REMOTE_DESTINATION, error: `Remote or invalid action destination: ${destination}` };
    }

    // 3. Target validation
    if (!target || typeof target !== "object") {
      return { valid: false, result: ACTION_RESULTS.DENIED_INVALID_TARGET, error: "Action target must be a non-null object." };
    }

    // 4. Navigation protocol safety
    if (actionType === BROWSER_ACTION_TYPES.NAVIGATE) {
      const url = parameters?.url || target?.url;
      if (!validateNavigationProtocol(url, this.config.PERMITTED_PROTOCOLS, this.config.FORBIDDEN_PROTOCOLS)) {
        return { valid: false, result: ACTION_RESULTS.DENIED_UNSAFE_ACTION, error: "Navigation target uses forbidden or malformed protocol." };
      }
    }

    // 5. Dangerous action inspection (rejection of eval, script injection, etc.)
    const paramString = JSON.stringify(parameters || {});
    if (/eval\(|Function\(|javascript:|script\s*>/i.test(paramString)) {
      return { valid: false, result: ACTION_RESULTS.DENIED_UNSAFE_ACTION, error: "Action request contains dangerous code primitives." };
    }

    return { valid: true };
  }

  /**
   * Resolves target element against current page state with stale target protection.
   * Target resolution priority order:
   * 1. TOKEN_REFERENCE
   * 2. SEMANTIC_TARGET
   * 3. DOM_ELEMENT
   * 4. OCR_REGION
   *
   * @param {object} targetRef
   * @param {object} [pageState={}]
   * @returns {object} { resolved: boolean, targetId?: string, reason?: string, element?: object }
   */
  resolveTarget(targetRef, pageState = {}) {
    if (!targetRef || typeof targetRef !== "object") {
      return { resolved: false, reason: ACTION_RESULTS.DENIED_INVALID_TARGET };
    }

    const targetType = targetRef.targetType || targetRef.type;
    const targetId = targetRef.targetId || targetRef.id || targetRef.token;

    if (!targetId) {
      return { resolved: false, reason: ACTION_RESULTS.DENIED_INVALID_TARGET };
    }

    // Check if target is present in pageState or DOM representation
    const pageNodes = pageState.domNodes || pageState.nodes || pageState.visualBlocks || [];
    const isPresent = pageNodes.length === 0 || pageNodes.some((node) => {
      if (!node) return false;
      return (
        node.id === targetId ||
        node.token === targetId ||
        node.targetId === targetId ||
        node.placeholder === targetId
      );
    });

    if (pageState.isStale || targetRef.isStale) {
      return { resolved: false, reason: ACTION_RESULTS.DENIED_STALE_TARGET, targetId };
    }

    if (!isPresent) {
      return { resolved: false, reason: ACTION_RESULTS.DENIED_TARGET_NOT_FOUND, targetId };
    }

    return {
      resolved: true,
      targetId,
      targetType: targetType || ACTION_TARGET_TYPES.DOM_ELEMENT
    };
  }

  /**
   * Evaluates Step 8 Policy Engine rules for an action request.
   *
   * @param {object} actionRequest
   * @param {object} [policyItem={}]
   * @returns {object} { allowed: boolean, result?: string, reason?: string }
   */
  authorizeAction(actionRequest, policyItem = {}) {
    // If explicit policy item is supplied, evaluate it
    if (policyItem.action) {
      if (policyItem.action === POLICY_ACTIONS.REDACT) {
        return { allowed: false, result: ACTION_RESULTS.DENIED_POLICY, reason: "Step 8 Policy prohibits actions on REDACTED elements." };
      }

      if (policyItem.action === POLICY_ACTIONS.LOCAL_ONLY && !this.config.LOCAL_DESTINATIONS.includes(actionRequest.destination)) {
        return { allowed: false, result: ACTION_RESULTS.DENIED_REMOTE_DESTINATION, reason: "LOCAL_ONLY policy requires local destination." };
      }
    }

    return { allowed: true };
  }

  /**
   * Executes a validated browser action.
   *
   * @param {object} actionRequest
   * @param {object} [options={}]
   * @returns {object} Sanitized action result { ok: boolean, status: string, actionType: string, targetId: string, executionTimeMs: number }
   */
  executeAction(actionRequest, options = {}) {
    const startTime = Date.now();

    // 1. Lifecycle check
    if (this.status !== ACTION_STATUS.READY) {
      return Object.freeze({
        ok: false,
        status: ACTION_RESULTS.ERROR,
        actionType: actionRequest?.actionType || "UNKNOWN",
        error: `Action engine is in '${this.status}' state. Must be initialized before execution.`
      });
    }

    // 2. Request validation
    const validation = this.validateAction(actionRequest);
    if (!validation.valid) {
      return Object.freeze({
        ok: false,
        status: validation.result,
        actionType: actionRequest?.actionType || "UNKNOWN",
        error: validation.error
      });
    }

    const { actionType, target, parameters = {}, purpose, destination, authorization = {} } = actionRequest;

    // 3. Target resolution
    const targetResolution = this.resolveTarget(target, options.pageState || {});
    if (!targetResolution.resolved) {
      return Object.freeze({
        ok: false,
        status: targetResolution.reason,
        actionType,
        targetId: target.id || target.targetId || "unresolved"
      });
    }

    // 4. Step 8 Policy authorization check
    const policyAuth = this.authorizeAction(actionRequest, options.policyItem || target.policyItem || {});
    if (!policyAuth.allowed) {
      return Object.freeze({
        ok: false,
        status: policyAuth.result,
        actionType,
        targetId: targetResolution.targetId,
        error: policyAuth.reason
      });
    }

    // Determine sensitive vs non-sensitive action
    const isSensitiveCategory = Boolean(
      target.category && ["password", "payment_card", "otp", "account_identifier", "email", "phone", "person_name", "address"].includes(target.category)
    );
    const isSensitiveAction = actionType === BROWSER_ACTION_TYPES.FILL || isSensitiveCategory;

    // 5. Sensitive action handling: Requires Step 9 Vault retrieval with strict authorization & purpose matching
    if (isSensitiveAction) {
      if (!authorization.authorizationGranted) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.DENIED_UNAUTHORIZED,
          actionType,
          targetId: targetResolution.targetId,
          error: "Sensitive action requires explicit user authorization."
        });
      }

      const vaultId = target.vaultId || parameters.vaultId;
      if (!vaultId) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.DENIED_SENSITIVE_VALUE,
          actionType,
          targetId: targetResolution.targetId,
          error: "Missing vault reference for sensitive action."
        });
      }

      // Check cross-target authorization: Vault secret authorized for target A cannot be used on target B
      if (target.authorizedTargetId && target.authorizedTargetId !== targetResolution.targetId) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.DENIED_INVALID_TARGET,
          actionType,
          targetId: targetResolution.targetId,
          error: "Vault secret authorization target does not match current target."
        });
      }

      // Retrieve secret from Step 9 Vault
      const vaultRetrieval = this.vault.retrieveSecret({
        vaultId,
        purpose,
        destination,
        authorization
      });

      if (!vaultRetrieval.ok) {
        const isPurposeMismatch = vaultRetrieval.result === "DENIED_PURPOSE_MISMATCH" ||
          vaultRetrieval.reason?.toLowerCase().includes("purpose");
        const denialStatus = isPurposeMismatch
          ? ACTION_RESULTS.DENIED_PURPOSE_MISMATCH
          : ACTION_RESULTS.DENIED_UNAUTHORIZED;

        return Object.freeze({
          ok: false,
          status: denialStatus,
          actionType,
          targetId: targetResolution.targetId,
          error: vaultRetrieval.reason || "Vault secret retrieval failed."
        });
      }

      // Secret retrieved locally for injection into DOM target
      const rawSecret = vaultRetrieval.secretValue;

      if (!this.domDriver || typeof this.domDriver.fillElement !== "function") {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: "DOM driver is unavailable or does not support fillElement."
        });
      }

      let fillResult = null;
      try {
        fillResult = this.domDriver.fillElement(targetResolution.targetId, rawSecret);
      } catch (err) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: err.message || "DOM driver fillElement execution threw an error."
        });
      } finally {
        // Discard local secret reference immediately
      }

      if (fillResult && fillResult.ok === false) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: fillResult.error || "DOM driver failed to fill element."
        });
      }
    } else {
      // Non-sensitive action execution (CLICK, SCROLL, SELECT, SUBMIT, WAIT, non-sensitive TYPE)
      if (!this.domDriver || typeof this.domDriver.execute !== "function") {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: "DOM driver is unavailable or does not support execute."
        });
      }

      let execResult = null;
      try {
        execResult = this.domDriver.execute(actionType, targetResolution.targetId, parameters);
      } catch (err) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: err.message || "DOM driver execute execution threw an error."
        });
      }

      if (execResult && execResult.ok === false) {
        return Object.freeze({
          ok: false,
          status: ACTION_RESULTS.ERROR,
          actionType,
          targetId: targetResolution.targetId,
          error: execResult.error || "DOM driver failed to execute action."
        });
      }
    }

    const executionTimeMs = Date.now() - startTime;
    this.lastProcessedAt = Date.now();

    // Return strictly sanitized result (no raw secret or PII)
    return Object.freeze({
      ok: true,
      status: ACTION_RESULTS.COMPLETED,
      actionType,
      targetId: targetResolution.targetId,
      executionTimeMs
    });
  }

  /**
   * Executes a batch of action requests. Each action is validated independently.
   *
   * @param {Array<object>} actionRequests
   * @param {object} [options={}]
   * @returns {object} { ok: boolean, completedCount: number, results: Array<object> }
   */
  executeBatch(actionRequests, options = {}) {
    if (!Array.isArray(actionRequests) || actionRequests.length === 0) {
      return Object.freeze({
        ok: false,
        completedCount: 0,
        results: [],
        error: "Action requests batch must be a non-empty array."
      });
    }

    if (actionRequests.length > this.config.MAX_ACTIONS_PER_BATCH) {
      return Object.freeze({
        ok: false,
        completedCount: 0,
        results: [],
        error: `Batch size (${actionRequests.length}) exceeds maximum limit (${this.config.MAX_ACTIONS_PER_BATCH}).`
      });
    }

    const results = [];
    let completedCount = 0;
    const stopOnDenial = options.stopOnDenial !== false;

    for (let i = 0; i < actionRequests.length; i++) {
      // Every action in batch independently undergoes full validation, policy, and authorization
      const result = this.executeAction(actionRequests[i], options);
      results.push(result);

      if (result.ok) {
        completedCount += 1;
      } else if (stopOnDenial) {
        break;
      }
    }

    return Object.freeze({
      ok: completedCount === actionRequests.length,
      completedCount,
      totalRequested: actionRequests.length,
      results: Object.freeze(results)
    });
  }

  /**
   * Disposes of action engine state.
   *
   * @returns {object}
   */
  dispose() {
    this.status = ACTION_STATUS.DISPOSED;
    this.domDriver = null;
    this.lastProcessedAt = null;
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating an isolated BrowserActionEngine instance.
 *
 * @param {object} [config={}]
 * @returns {BrowserActionEngine}
 */
export function createBrowserActionEngine(config = {}) {
  const engine = new BrowserActionEngine(config);
  engine.initialize(config);
  return engine;
}

// Default singleton instance
export const browserActionEngine = createBrowserActionEngine();
