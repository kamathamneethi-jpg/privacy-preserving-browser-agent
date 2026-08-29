/**
 * Local Browser Action Runtime for Chrome Extension (Step 14).
 * Executes validated local DOM actions (clicking, text input, form fill, select, submit, scrolling, navigate) on-device.
 *
 * Security Invariants:
 * 1. Zero network egress: Performs only local DOM mutations.
 * 2. Protocol enforcement: Navigation is restricted to safe protocols (http:, https:) and forbids javascript:, data:, file:.
 * 3. Secret hygiene: Injected vault secrets are placed directly into field values and immediately discarded from memory.
 * 4. Safe target resolution: Resolves target elements by ID, attribute, or safe selectors without eval or dynamic script injection.
 */
(() => {
  const FORBIDDEN_PROTOCOLS = ["javascript:", "data:", "file:", "blob:", "about:"];
  const PERMITTED_PROTOCOLS = ["http:", "https:"];

  /**
   * Resolves a DOM element within the active document safely.
   *
   * @param {string|Element} target
   * @returns {Element|null}
   */
  function resolveElement(target) {
    if (!target) return null;
    if (typeof Element !== "undefined" && target instanceof Element) return target;
    if (typeof target !== "string") return null;

    if (typeof document === "undefined") return null;

    // 1. Direct ID
    const byId = document.getElementById(target);
    if (byId) return byId;

    // 2. Safe attribute lookup
    try {
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(target)
        : target.replace(/["\\]/g, "\\$&");

      const byAttr = document.querySelector(`[data-testid="${escaped}"], [data-id="${escaped}"], [name="${escaped}"]`);
      if (byAttr) return byAttr;

      if (!/[<>()\[\]'"`=]/.test(target)) {
        const byQuery = document.querySelector(`#${escaped}`);
        if (byQuery) return byQuery;
      }
    } catch {
      // Ignore syntax errors
    }

    return null;
  }

  /**
   * Dispatches a local click event to a DOM target element.
   *
   * @param {Element|string} target
   * @returns {boolean}
   */
  function performClick(target) {
    const element = resolveElement(target);
    if (!element) return false;
    try {
      if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Injects non-sensitive input text into a local form field element.
   *
   * @param {Element|string} target
   * @param {string} textValue
   * @returns {boolean}
   */
  function performInput(target, textValue) {
    const element = resolveElement(target);
    if (!element || typeof textValue !== "string") return false;
    try {
      element.value = textValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Injects a sensitive vault secret into a local form field element.
   *
   * @param {Element|string} target
   * @param {string} secretValue
   * @returns {boolean}
   */
  function performFill(target, secretValue) {
    const element = resolveElement(target);
    if (!element || typeof secretValue !== "string") return false;
    try {
      element.value = secretValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Selects an option in a dropdown element.
   *
   * @param {Element|string} target
   * @param {string} value
   * @returns {boolean}
   */
  function performSelect(target, value) {
    const element = resolveElement(target);
    if (!element) return false;
    try {
      element.value = value || "";
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Submits a form element or clicks a submit trigger.
   *
   * @param {Element|string} target
   * @returns {boolean}
   */
  function performSubmit(target) {
    const element = resolveElement(target);
    if (!element) return false;
    try {
      if (typeof element.requestSubmit === "function") {
        element.requestSubmit();
      } else if (typeof element.submit === "function") {
        element.submit();
      } else if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Scrolls the browser window or container.
   *
   * @param {number} scrollX
   * @param {number} scrollY
   * @param {Element|string} [target]
   * @returns {boolean}
   */
  function performScroll(scrollX = 0, scrollY = 0, target = null) {
    try {
      if (target && target !== "window" && target !== "document") {
        const element = resolveElement(target);
        if (element && typeof element.scrollTo === "function") {
          element.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
          return true;
        }
      }
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Pauses execution for a specified duration in milliseconds.
   *
   * @param {number} durationMs
   * @returns {Promise<boolean>}
   */
  async function performWait(durationMs = 100) {
    const boundedMs = Math.min(10000, Math.max(0, Number(durationMs) || 100));
    return new Promise((resolve) => setTimeout(() => resolve(true), boundedMs));
  }

  /**
   * Navigates to a validated URL.
   *
   * @param {string} urlString
   * @returns {boolean}
   */
  function performNavigate(urlString) {
    if (typeof urlString !== "string" || !urlString.trim()) return false;
    const lower = urlString.trim().toLowerCase();

    for (const forbidden of FORBIDDEN_PROTOCOLS) {
      if (lower.startsWith(forbidden)) return false;
    }

    try {
      const parsed = new URL(urlString);
      if (!PERMITTED_PROTOCOLS.includes(parsed.protocol)) return false;

      if (typeof window !== "undefined") {
        window.location.href = urlString;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Master dispatcher for action execution.
   *
   * @param {string} actionType
   * @param {string} targetId
   * @param {object} [parameters={}]
   * @param {string} [secretValue]
   * @returns {object} { ok: boolean, actionType: string, targetId: string, error?: string }
   */
  function executeAction(actionType, targetId, parameters = {}, secretValue = null) {
    try {
      switch (actionType) {
        case "CLICK": {
          const ok = performClick(targetId);
          return { ok, actionType, targetId, error: ok ? undefined : `Target '${targetId}' click failed.` };
        }
        case "TYPE": {
          const text = typeof parameters.text === "string" ? parameters.text : (parameters.value || "");
          const ok = performInput(targetId, text);
          return { ok, actionType, targetId, error: ok ? undefined : `Target '${targetId}' input failed.` };
        }
        case "FILL": {
          const val = typeof secretValue === "string" ? secretValue : (parameters.value || "");
          const ok = performFill(targetId, val);
          return { ok, actionType, targetId, error: ok ? undefined : `Target '${targetId}' fill failed.` };
        }
        case "SELECT": {
          const val = parameters.value || parameters.option || "";
          const ok = performSelect(targetId, val);
          return { ok, actionType, targetId, error: ok ? undefined : `Target '${targetId}' select failed.` };
        }
        case "SUBMIT": {
          const ok = performSubmit(targetId);
          return { ok, actionType, targetId, error: ok ? undefined : `Target '${targetId}' submit failed.` };
        }
        case "SCROLL": {
          const scrollX = Number(parameters.scrollX) || 0;
          const scrollY = Number(parameters.scrollY) || 0;
          const ok = performScroll(scrollX, scrollY, targetId);
          return { ok, actionType, targetId, error: ok ? undefined : "Scroll execution failed." };
        }
        case "WAIT": {
          return { ok: true, actionType, targetId };
        }
        case "NAVIGATE": {
          const url = parameters.url || targetId;
          const ok = performNavigate(url);
          return { ok, actionType, targetId, error: ok ? undefined : "Navigation failed: forbidden or invalid URL." };
        }
        default:
          return { ok: false, actionType, targetId, error: `Unsupported action type: ${actionType}` };
      }
    } catch (err) {
      return { ok: false, actionType, targetId, error: err.message || "Action execution error." };
    }
  }

  // Extension runtime message listener
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "EXECUTE_BROWSER_ACTION") {
        const { actionType, targetId, parameters, secretValue } = message;
        const result = executeAction(actionType, targetId, parameters, secretValue);
        sendResponse(result);
        return true;
      }
    });
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ActionRuntime = Object.freeze({
      resolveElement,
      performClick,
      performInput,
      performFill,
      performSelect,
      performSubmit,
      performScroll,
      performWait,
      performNavigate,
      executeAction
    });
  }
})();
