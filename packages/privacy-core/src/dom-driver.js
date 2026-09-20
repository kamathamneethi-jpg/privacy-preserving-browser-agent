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
import { interactiveElementRegistry } from "./interactive-element-registry.js";

/**
 * Resolves a DOM element within the current document context safely.
 *
 * @param {string} targetId
 * @param {Document} [doc=document]
 * @param {string} [snapshotId]
 * @param {object} [registry]
 * @returns {Element|null}
 */
export function resolveDomElement(targetId, doc = (typeof document !== "undefined" ? document : null), snapshotId = null, registry = interactiveElementRegistry) {
  if (!targetId || typeof targetId !== "string") return null;

  // 1. Check interactive element registry first (handles el_1, el_2, etc.)
  const activeRegistry = registry || interactiveElementRegistry;
  if (activeRegistry && typeof activeRegistry.resolveElement === "function") {
    const registryLookup = activeRegistry.resolveElement(targetId, snapshotId);
    if (registryLookup.resolved && registryLookup.element) {
      return registryLookup.element;
    }
  }

  if (!doc) return null;

  // 2. Direct ID lookup
  const byId = doc.getElementById(targetId);
  if (byId) return byId;

  // 3. Safe attribute lookup (data-testid, data-id, name)
  try {
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(targetId)
      : targetId.replace(/["\\]/g, "\\$&");

    const byAttr = doc.querySelector(`[data-testid="${escaped}"], [data-id="${escaped}"], [name="${escaped}"]`);
    if (byAttr) return byAttr;

    // 4. Fallback standard CSS selector if safe
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
    this.registry = customConfig.registry || interactiveElementRegistry;
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

    // Real Browser DOM Execution or Registered Element Execution
    const resolvedElement = resolveDomElement(targetId, undefined, undefined, this.registry);
    if (typeof document !== "undefined" || resolvedElement) {
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
   * Internal execution against actual document DOM or registered element.
   * @private
   */
  _executeOnRealDom(actionType, targetId, parameters) {
    const safeDispatch = (element, type, detail = {}) => {
      if (!element || typeof element.dispatchEvent !== "function") return;
      try {
        if (typeof Event !== "undefined") {
          element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        } else {
          element.dispatchEvent({ type, ...detail, bubbles: true, cancelable: true });
        }
      } catch {}
    };

    const safeClickElement = (element) => {
      if (!element) return;
      const jsAnchors = [];
      let curr = element;
      while (curr && curr.tagName) {
        if (String(curr.tagName).toUpperCase() === "A") {
          const href = (typeof curr.getAttribute === "function" ? curr.getAttribute("href") : curr.href || "").trim().toLowerCase();
          if (href.startsWith("javascript:")) {
            jsAnchors.push(curr);
          }
        }
        curr = curr.parentElement;
      }

      if (typeof element.querySelectorAll === "function") {
        try {
          const childAnchors = element.querySelectorAll('a[href^="javascript:" i], a[href^="JAVASCRIPT:" i]');
          for (const ca of childAnchors) {
            if (!jsAnchors.includes(ca)) jsAnchors.push(ca);
          }
        } catch {}
      }

      const savedHrefs = new Map();
      const preventNav = (e) => {
        try {
          if (typeof e.preventDefault === "function") e.preventDefault();
        } catch {}
      };

      for (const a of jsAnchors) {
        const orig = typeof a.getAttribute === "function" ? a.getAttribute("href") : a.href;
        savedHrefs.set(a, orig);
        try {
          if (typeof a.removeAttribute === "function") {
            a.removeAttribute("href");
          } else {
            a.href = "";
          }
          if (typeof a.addEventListener === "function") {
            a.addEventListener("click", preventNav, { capture: true, once: true });
          }
        } catch {}
      }

      try {
        safeDispatch(element, "mousedown");
        safeDispatch(element, "mouseup");
        safeDispatch(element, "click");
        if (typeof element.click === "function") {
          element.click();
        }
      } finally {
        for (const [a, originalHref] of savedHrefs.entries()) {
          try {
            if (originalHref !== null && originalHref !== undefined) {
              if (typeof a.setAttribute === "function") {
                a.setAttribute("href", originalHref);
              } else {
                a.href = originalHref;
              }
            }
            if (typeof a.removeEventListener === "function") {
              a.removeEventListener("click", preventNav, { capture: true });
            }
          } catch {}
        }
      }
    };

    try {
      const getElement = (id) => resolveDomElement(id, undefined, undefined, this.registry);

      switch (actionType) {
        case BROWSER_ACTION_TYPES.CLICK: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.focus === "function") element.focus();
          safeClickElement(element);
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.TYPE: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.focus === "function") element.focus();
          const text = typeof parameters.text === "string" ? parameters.text : (parameters.value || "");
          element.value = text;
          safeDispatch(element, "input");
          safeDispatch(element, "change");
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.CLEAR: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.focus === "function") element.focus();
          element.value = "";
          safeDispatch(element, "input");
          safeDispatch(element, "change");
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.CHECK: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (element.checked !== true) {
            element.checked = true;
            safeDispatch(element, "change");
            safeDispatch(element, "click");
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.UNCHECK: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (element.checked !== false) {
            element.checked = false;
            safeDispatch(element, "change");
            safeDispatch(element, "click");
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.PRESS_KEY: {
          const element = getElement(targetId) || (typeof document !== "undefined" ? document.activeElement || document.body : null);
          const key = parameters.key || "Enter";
          if (element) {
            safeDispatch(element, "keydown", { key });
            safeDispatch(element, "keypress", { key });
            safeDispatch(element, "keyup", { key });
            if (key === "Enter" && (element.tagName === "INPUT" || element.tagName === "BUTTON")) {
              const form = element.form || element.closest?.("form");
              if (form && typeof form.requestSubmit === "function") {
                form.requestSubmit();
              }
            }
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.GO_BACK: {
          if (typeof window !== "undefined" && window.history && typeof window.history.back === "function") {
            window.history.back();
            return { ok: true, actionType, targetId: "window" };
          }
          return { ok: true, actionType, targetId: "window", simulated: true };
        }

        case BROWSER_ACTION_TYPES.SELECT: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          const val = parameters.value || parameters.option || "";
          // If select element, try matching value or option textContent
          if (element.tagName === "SELECT" && Array.isArray(Array.from(element.options || []))) {
            const match = Array.from(element.options).find(opt => 
              opt.value === val || opt.textContent?.trim().toLowerCase() === String(val).trim().toLowerCase()
            );
            if (match) {
              element.value = match.value;
            } else {
              element.value = val;
            }
          } else {
            element.value = val;
          }
          safeDispatch(element, "change");
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.SUBMIT: {
          const element = getElement(targetId);
          if (!element) {
            return { ok: false, actionType, targetId, error: `Target element '${targetId}' not found in DOM.` };
          }
          if (typeof element.requestSubmit === "function") {
            element.requestSubmit();
          } else if (typeof element.submit === "function") {
            element.submit();
          } else {
            safeClickElement(element);
          }
          return { ok: true, actionType, targetId };
        }

        case BROWSER_ACTION_TYPES.SCROLL: {
          let scrollX = Number(parameters.scrollX) || 0;
          let scrollY = Number(parameters.scrollY) || 0;
          const direction = String(parameters.direction || "").toLowerCase();
          const amount = Number(parameters.amount) || 500;
          if (direction === "down") scrollY = amount;
          else if (direction === "up") scrollY = -amount;

          if (targetId && targetId !== "window" && targetId !== "document" && targetId !== "page_root") {
            const element = resolveDomElement(targetId);
            if (element && typeof element.scrollBy === "function") {
              element.scrollBy({ left: scrollX, top: scrollY, behavior: "smooth" });
              return { ok: true, actionType, targetId };
            }
          }
          if (typeof window !== "undefined" && typeof window.scrollBy === "function") {
            window.scrollBy({ left: scrollX, top: scrollY, behavior: "smooth" });
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
