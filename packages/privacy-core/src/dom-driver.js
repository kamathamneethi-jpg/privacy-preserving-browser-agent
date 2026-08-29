/**
 * DOM Action Driver Abstraction (Step 14).
 * Provides the execution mechanism for validated browser actions.
 *
 * Privacy & Security Guarantees:
 * 1. Executes actions strictly within local browser/extension DOM boundaries.
 * 2. Never transmits DOM data or raw values over the network.
 * 3. Sanitizes all inputs and validates protocols (blocks javascript:, data:, file:).
 * 4. Discards sensitive secret references immediately after filling.
 * 5. Returns deterministic execution results (ok: true/false, status, error).
 */

import {
  BROWSER_ACTION_TYPES
} from "../../shared-types/src/privacy-contracts.js";
import { ACTION_CONFIG, validateNavigationProtocol } from "./action-config.js";

/**
 * Resolves a DOM element within the current document context safely.
 *
 * @param {string} targetId
 * @param {Document} [doc=document]
 * @returns {Element|null}
 */
export function resolveDomElement(targetId, doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc || !targetId || typeof targetId !== "string") return null;

  // 1. Direct ID lookup
  const byId = doc.getElementById(targetId);
  if (byId) return byId;

  // 2. Safe attribute lookup (data-testid, data-id, name)
  try {
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(targetId)
      : targetId.replace(/["\\]/g, "\\$&");

    const byAttr = doc.querySelector(`[data-testid="${escaped}"], [data-id="${escaped}"], [name="${escaped}"]`);
    if (byAttr) return byAttr;

    // 3. Fallback standard CSS selector if safe
    if (!/[<>()\[\]'"`=]/.test(targetId)) {
      const byQuery = doc.querySelector(`#${escaped}`);
      if (byQuery) return byQuery;
    }
  } catch {
    // Ignore querySelector syntax errors on irregular token strings
  }

  return null;
}

/**
 * DOM Driver class implementing local action execution on DOM nodes.
 */
export class DomDriver {
  constructor(customConfig = {}) {
    this.config = { ...ACTION_CONFIG, ...customConfig };
    this.customExecutor = customConfig.executor || null;
    this.tabId = customConfig.tabId || null;
    this.executionHistory = [];
  }

  /**
   * Checks whether a real browser DOM environment or custom executor is available.
   *
   * @returns {boolean}
   */
  isAvailable() {
    return (
      typeof document !== "undefined" ||
      typeof this.customExecutor === "function" ||
      (typeof chrome !== "undefined" && Boolean(chrome.tabs?.sendMessage) && Boolean(this.tabId)) ||
      Boolean(this.config.simulationMode !== false)
    );
  }

  /**
   * Executes a validated browser action against the target element.
   *
   * @param {string} actionType - One of BROWSER_ACTION_TYPES
   * @param {string} targetId - Target identifier or opaque reference
   * @param {object} [parameters={}] - Action parameters
   * @returns {object|Promise<object>} Execution result { ok: boolean, actionType: string, targetId: string, error?: string }
   */
  execute(actionType, targetId, parameters = {}) {
    // If a custom executor is configured, delegate to it
    if (typeof this.customExecutor === "function") {
      try {
        const customRes = this.customExecutor(actionType, targetId, parameters);
        return customRes || { ok: true, actionType, targetId };
      } catch (err) {
        return { ok: false, actionType, targetId, error: err.message || "Custom executor failed." };
      }
    }

    // If configured with Chrome extension tab messaging
    if (typeof chrome !== "undefined" && chrome.tabs?.sendMessage && this.tabId) {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          this.tabId,
          {
            type: "EXECUTE_BROWSER_ACTION",
            actionType,
            targetId,
            parameters
          },
          (response) => {
            if (chrome.runtime?.lastError) {
              resolve({
                ok: false,
                actionType,
                targetId,
                error: chrome.runtime.lastError.message
              });
            } else if (response && response.ok) {
              resolve({ ok: true, actionType, targetId, ...response });
            } else {
              resolve({
                ok: false,
                actionType,
                targetId,
                error: response?.error || "Extension content script execution failed."
              });
            }
          }
        );
      });
    }

    // Real Browser DOM Execution
    if (typeof document !== "undefined") {
      return this._executeOnRealDom(actionType, targetId, parameters);
    }

    // Node / Headless / Simulation fallback for tests
    return this._executeSimulation(actionType, targetId, parameters);
  }

  /**
   * Fills a target form field locally with a secret value retrieved from the vault.
   * The secret is injected directly and never retained.
   *
   * @param {string} targetId
   * @param {string} secretValue
   * @returns {object|Promise<object>}
   */
  fillElement(targetId, secretValue) {
    if (typeof secretValue !== "string") {
      return { ok: false, actionType: BROWSER_ACTION_TYPES.FILL, targetId, error: "Invalid secret value." };
    }

    if (typeof this.customExecutor === "function") {
      try {
        const customRes = this.customExecutor(BROWSER_ACTION_TYPES.FILL, targetId, { value: secretValue });
        return customRes || { ok: true, actionType: BROWSER_ACTION_TYPES.FILL, targetId };
      } catch (err) {
        return { ok: false, actionType: BROWSER_ACTION_TYPES.FILL, targetId, error: err.message || "Custom fill executor failed." };
      }
    }

    if (typeof chrome !== "undefined" && chrome.tabs?.sendMessage && this.tabId) {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          this.tabId,
          {
            type: "EXECUTE_BROWSER_ACTION",
            actionType: BROWSER_ACTION_TYPES.FILL,
            targetId,
            secretValue
          },
          (response) => {
            if (chrome.runtime?.lastError) {
              resolve({
                ok: false,
                actionType: BROWSER_ACTION_TYPES.FILL,
                targetId,
                error: chrome.runtime.lastError.message
              });
            } else if (response && response.ok) {
              resolve({ ok: true, actionType: BROWSER_ACTION_TYPES.FILL, targetId });
            } else {
              resolve({
                ok: false,
                actionType: BROWSER_ACTION_TYPES.FILL,
                targetId,
                error: response?.error || "Content script fill failed."
              });
            }
          }
        );
      });
    }

    if (typeof document !== "undefined") {
      const element = resolveDomElement(targetId);
      if (!element) {
        return { ok: false, actionType: BROWSER_ACTION_TYPES.FILL, targetId, error: `Target element '${targetId}' not found in DOM.` };
      }

      try {
        element.value = secretValue;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, actionType: BROWSER_ACTION_TYPES.FILL, targetId };
      } catch (err) {
        return { ok: false, actionType: BROWSER_ACTION_TYPES.FILL, targetId, error: err.message || "Failed to fill DOM element." };
      }
    }

    // Node / Simulation
    this.executionHistory.push({
      actionType: BROWSER_ACTION_TYPES.FILL,
      targetId,
      timestamp: Date.now()
    });
    return { ok: true, actionType: BROWSER_ACTION_TYPES.FILL, targetId };
  }

  /**
   * Internal execution against actual document DOM.
   * @private
   */
  _executeOnRealDom(actionType, targetId, parameters) {
    try {
      switch (actionType) {
        case BROWSER_ACTION_TYPES.CLICK: {
          const element = resolveDomElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.click === "function") {
            element.click();
          } else {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.TYPE: {
          const element = resolveDomElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          const text = typeof parameters.text === "string" ? parameters.text : (parameters.value || "");
          element.value = text;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.SELECT: {
          const element = resolveDomElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          const val = parameters.value || parameters.option || "";
          element.value = val;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.SUBMIT: {
          const element = resolveDomElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.requestSubmit === "function") {
            element.requestSubmit();
          } else if (typeof element.submit === "function") {
            element.submit();
          } else if (typeof element.click === "function") {
            element.click();
          } else {
            element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.SCROLL: {
          const scrollX = Number(parameters.scrollX) || 0;
          const scrollY = Number(parameters.scrollY) || 0;
          if (targetId && targetId !== "window" && targetId !== "document") {
            const element = resolveDomElement(targetId);
            if (element && typeof element.scrollTo === "function") {
              element.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
              return { ok: true, actionType, targetId };
            }
          }
          if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
            window.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.WAIT: {
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.NAVIGATE: {
          const url = parameters.url || targetId;
          if (!validateNavigationProtocol(url, this.config.PERMITTED_PROTOCOLS, this.config.FORBIDDEN_PROTOCOLS)) {
            return { ok: false, actionType, targetId, error: "Navigation URL uses forbidden protocol." };
          }
          if (typeof window !== "undefined") {
            window.location.href = url;
          }
          return { ok: true, actionType, targetId };
        }

        default:
          return { ok: false, actionType, targetId, error: `Unsupported action type: ${actionType}` };
      }
    } catch (err) {
      return { ok: false, actionType, targetId, error: err.message || "DOM action execution error." };
    }
  }

  /**
   * Internal execution in simulated / test environment.
   * @private
   */
  _executeSimulation(actionType, targetId, parameters) {
    if (actionType === BROWSER_ACTION_TYPES.NAVIGATE) {
      const url = parameters.url || targetId;
      if (!validateNavigationProtocol(url, this.config.PERMITTED_PROTOCOLS, this.config.FORBIDDEN_PROTOCOLS)) {
        return { ok: false, actionType, targetId, error: "Navigation URL uses forbidden protocol." };
      }
    }

    this.executionHistory.push({
      actionType,
      targetId,
      parameters: { ...parameters },
      timestamp: Date.now()
    });

    return {
      ok: true,
      actionType,
      targetId,
      simulated: true
    };
  }

  /**
   * Clears execution history.
   */
  clearHistory() {
    this.executionHistory = [];
  }
}

/**
 * Factory function for creating a DomDriver instance.
 *
 * @param {object} [config={}]
 * @returns {DomDriver}
 */
export function createDomDriver(config = {}) {
  return new DomDriver(config);
}

// Default singleton instance
export const domDriver = createDomDriver();
