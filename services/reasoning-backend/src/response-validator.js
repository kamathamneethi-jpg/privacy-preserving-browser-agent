/**
 * Remote Reasoning Response Security Validator (Step 15).
 * Validates outgoing provider responses to ensure they are safe, structured action proposals.
 *
 * CRITICAL SECURITY INVARIANT:
 * Remote reasoning responses are treated as untrusted input.
 * They CANNOT execute browser actions directly, request raw vault contents, override Step 8 policy,
 * or inject executable JavaScript. All action proposals MUST be routed to Step 14 for local validation.
 */

import { REASONING_CONFIG } from "./reasoning-config.js";

/**
 * Validates remote reasoning service response.
 *
 * @param {object} response
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateReasoningResponse(response) {
  if (!response || typeof response !== "object") {
    return { valid: false, error: "Response must be a non-null object." };
  }

  const { ok, status, recommendedActions, reasoningSummary } = response;

  if (typeof ok !== "boolean" || typeof status !== "string") {
    return { valid: false, error: "Response missing valid 'ok' boolean or 'status' string." };
  }

  if (recommendedActions !== undefined && !Array.isArray(recommendedActions)) {
    return { valid: false, error: "'recommendedActions' must be an array." };
  }

  if (Array.isArray(recommendedActions)) {
    if (recommendedActions.length > REASONING_CONFIG.MAX_RECOMMENDED_ACTIONS) {
      return { valid: false, error: `Recommended actions count (${recommendedActions.length}) exceeds cap (${REASONING_CONFIG.MAX_RECOMMENDED_ACTIONS}).` };
    }

    const actionStr = JSON.stringify(recommendedActions);

    // 1. Rejects code injection / script execution primitives
    if (/<script\b|eval\(|new Function\(|javascript:/i.test(actionStr)) {
      return { valid: false, error: "Response contains dangerous script injection primitives." };
    }

    // 2. Rejects requests for vault secrets
    if (/vaultSecret|rawPassword|rawCard|rawOtp/i.test(actionStr)) {
      return { valid: false, error: "Response attempts to request raw vault secrets." };
    }

    // 3. Verify each action proposal is a structured proposal object
    for (const actionProp of recommendedActions) {
      if (!actionProp || typeof actionProp !== "object") {
        return { valid: false, error: "Action proposal in recommendedActions must be an object." };
      }
      if (actionProp.executeDirectly || actionProp.directDomCall) {
        return { valid: false, error: "Response cannot directly execute DOM or browser actions." };
      }
    }
  }

  return { valid: true };
}
