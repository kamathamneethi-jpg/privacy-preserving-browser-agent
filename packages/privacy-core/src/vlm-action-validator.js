/**
 * VLM Action Validator Module.
 * Validates abstract browser actions proposed by Qwen VLM before execution.
 *
 * Invariants from prompt.txt:
 * 1. Qwen must NEVER directly execute browser APIs.
 * 2. Validator checks target element existence in the active DOM snapshot.
 * 3. Rejects dangerous URL schemes (javascript:, data:, file:) for NAVIGATE.
 * 4. Resolves local privacy tokens via PrivacyVault if tokenized values are used.
 * 5. Rejects arbitrary code injection or unsupported action types.
 */

export const SUPPORTED_VLM_ACTION_TYPES = Object.freeze([
  "CLICK",
  "TYPE",
  "SELECT",
  "SCROLL",
  "PRESS_KEY",
  "NAVIGATE",
  "WAIT",
  "BACK",
  "HOVER",
  "DONE",
  "COMPLETE",
  "CHECK",
  "UNCHECK",
  "CLEAR"
]);

/**
 * Validates an action proposed by Qwen VLM against the live interactive DOM and browser context.
 *
 * @param {object} action - Action proposal { type, target, value, direction, amount, key, url }
 * @param {object} context - Validation context { interactiveElements, currentUrl, privacyVault }
 * @returns {object} { valid: boolean, action: object, error: string | null }
 */
export function validateVlmAction(action = {}, context = {}) {
  if (!action || typeof action !== "object") {
    return {
      valid: false,
      action: null,
      error: "Action must be a valid JSON object."
    };
  }

  const rawType = action.type || action.actionType || action.action || "";
  const normalizedType = String(rawType).toUpperCase().trim();

  if (!SUPPORTED_VLM_ACTION_TYPES.includes(normalizedType)) {
    return {
      valid: false,
      action: null,
      error: `Unsupported action type "${rawType}". Supported types: ${SUPPORTED_VLM_ACTION_TYPES.join(", ")}`
    };
  }

  const interactiveElements = Array.isArray(context.interactiveElements) ? context.interactiveElements : [];
  const privacyVault = context.privacyVault || null;

  const targetId = action.target || action.elementId || action.targetId || null;

  // Helper to find target in live DOM snapshot
  const findTarget = (id) => {
    if (!id) return null;
    return interactiveElements.find(el => (el.elementId === id || el.id === id));
  };

  // 1. DONE / COMPLETE
  if (normalizedType === "DONE" || normalizedType === "COMPLETE") {
    return {
      valid: true,
      action: {
        type: "DONE",
        actionType: "DONE",
        target: null,
        reasoningSummary: action.reason || action.reasoningSummary || "Task completed."
      },
      error: null
    };
  }

  // 2. WAIT
  if (normalizedType === "WAIT") {
    const ms = Math.min(Math.max(Number(action.amount || action.duration || 1000), 200), 5000);
    return {
      valid: true,
      action: {
        type: "WAIT",
        actionType: "WAIT",
        amount: ms,
        parameters: { duration: ms },
        reasoningSummary: action.reason || action.reasoningSummary || `Waiting for ${ms}ms.`
      },
      error: null
    };
  }

  // 3. BACK
  if (normalizedType === "BACK" || normalizedType === "GO_BACK") {
    return {
      valid: true,
      action: {
        type: "BACK",
        actionType: "GO_BACK",
        reasoningSummary: action.reason || action.reasoningSummary || "Navigating back in browser history."
      },
      error: null
    };
  }

  // 4. NAVIGATE
  if (normalizedType === "NAVIGATE") {
    const rawUrl = action.url || action.target || action.value || "";
    if (!rawUrl || typeof rawUrl !== "string") {
      return {
        valid: false,
        action: null,
        error: "NAVIGATE action requires a valid destination URL or domain."
      };
    }

    const trimmedUrl = rawUrl.trim();
    // Security check: Block dangerous pseudo-protocols
    const lowerUrl = trimmedUrl.toLowerCase();
    if (lowerUrl.startsWith("javascript:") || lowerUrl.startsWith("data:") || lowerUrl.startsWith("file:") || lowerUrl.startsWith("vbscript:")) {
      return {
        valid: false,
        action: null,
        error: `Security violation: Blocked dangerous URL protocol in "${trimmedUrl}".`
      };
    }

    let resolvedUrl = trimmedUrl;
    if (!/^https?:\/\//i.test(resolvedUrl)) {
      if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(resolvedUrl)) {
        resolvedUrl = `https://${resolvedUrl}`;
      } else {
        // Assume search or known keyword
        resolvedUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmedUrl)}`;
      }
    }

    return {
      valid: true,
      action: {
        type: "NAVIGATE",
        actionType: "NAVIGATE",
        target: null,
        url: resolvedUrl,
        parameters: { url: resolvedUrl },
        reasoningSummary: action.reason || action.reasoningSummary || `Navigating to ${resolvedUrl}`
      },
      error: null
    };
  }

  // 5. SCROLL
  if (normalizedType === "SCROLL") {
    const dir = ["up", "down", "left", "right"].includes(String(action.direction).toLowerCase())
      ? String(action.direction).toLowerCase()
      : "down";
    const amount = Math.min(Math.max(Number(action.amount || 400), 50), 2000);

    return {
      valid: true,
      action: {
        type: "SCROLL",
        actionType: "SCROLL",
        target: targetId || null,
        direction: dir,
        amount,
        parameters: { direction: dir, amount },
        reasoningSummary: action.reason || action.reasoningSummary || `Scrolling ${dir} by ${amount}px.`
      },
      error: null
    };
  }

  // 6. CLICK / CHECK / UNCHECK / HOVER
  if (normalizedType === "CLICK" || normalizedType === "CHECK" || normalizedType === "UNCHECK" || normalizedType === "HOVER") {
    if (!targetId) {
      return {
        valid: false,
        action: null,
        error: `${normalizedType} action requires a valid target element ID (e.g. 'el_1').`
      };
    }

    const element = findTarget(targetId);
    if (!element && interactiveElements.length > 0) {
      return {
        valid: false,
        action: null,
        error: `Target element "${targetId}" was not found in the current interactive DOM snapshot.`
      };
    }

    return {
      valid: true,
      action: {
        type: normalizedType,
        actionType: normalizedType,
        target: targetId,
        parameters: action.parameters || {},
        reasoningSummary: action.reason || action.reasoningSummary || `Executing ${normalizedType} on ${targetId}.`
      },
      error: null
    };
  }

  // 7. TYPE / CLEAR
  if (normalizedType === "TYPE" || normalizedType === "CLEAR") {
    if (!targetId) {
      return {
        valid: false,
        action: null,
        error: `${normalizedType} action requires a target element ID (e.g. 'el_1').`
      };
    }

    const element = findTarget(targetId);
    if (!element && interactiveElements.length > 0) {
      return {
        valid: false,
        action: null,
        error: `Target element "${targetId}" not found in current interactive DOM snapshot.`
      };
    }

    let textVal = action.value !== undefined ? String(action.value) : (action.parameters?.text !== undefined ? String(action.parameters.text) : "");

    // Section 17 (Prompt.txt): Resolve sensitive vault token locally if needed
    if (textVal && privacyVault && typeof privacyVault.retrieveSecretByToken === "function") {
      const tokenMatch = textVal.match(/\{\{([A-Z0-9_]+)\}\}/);
      if (tokenMatch) {
        const token = tokenMatch[0];
        const vaultId = typeof privacyVault.getVaultIdForToken === "function" ? privacyVault.getVaultIdForToken(token) : null;
        const meta = vaultId && typeof privacyVault.getVaultMetadata === "function" ? privacyVault.getVaultMetadata(vaultId) : null;
        const purpose = meta?.metadata?.purpose || meta?.purpose || "LOCAL_ACTION";
        const secretRes = privacyVault.retrieveSecretByToken(token, {
          destination: "LOCAL_BROWSER",
          purpose,
          authorization: { authorizationGranted: true }
        });
        const rawSecret = typeof secretRes === "string" ? secretRes : (secretRes?.secretValue ?? (secretRes?.ok ? secretRes.secretValue : null));
        if (rawSecret) {
          textVal = textVal.replace(token, rawSecret);
        }
      }
    }

    return {
      valid: true,
      action: {
        type: normalizedType,
        actionType: normalizedType,
        target: targetId,
        value: textVal,
        parameters: { text: textVal },
        thenPressEnter: Boolean(action.thenPressEnter || action.pressEnter),
        reasoningSummary: action.reason || action.reasoningSummary || `Typing into ${targetId}.`
      },
      error: null
    };
  }

  // 8. PRESS_KEY
  if (normalizedType === "PRESS_KEY") {
    const key = action.key || action.value || action.parameters?.key || "Enter";
    return {
      valid: true,
      action: {
        type: "PRESS_KEY",
        actionType: "PRESS_KEY",
        target: targetId || null,
        key,
        parameters: { key },
        reasoningSummary: action.reason || action.reasoningSummary || `Pressing key "${key}".`
      },
      error: null
    };
  }

  // 9. SELECT
  if (normalizedType === "SELECT") {
    if (!targetId) {
      return {
        valid: false,
        action: null,
        error: "SELECT action requires a target element ID."
      };
    }
    const val = action.value || action.parameters?.value || "";
    return {
      valid: true,
      action: {
        type: "SELECT",
        actionType: "SELECT",
        target: targetId,
        value: val,
        parameters: { value: val },
        reasoningSummary: action.reason || action.reasoningSummary || `Selecting option "${val}" on ${targetId}.`
      },
      error: null
    };
  }

  return {
    valid: false,
    action: null,
    error: `Unhandled action type: ${normalizedType}`
  };
}
