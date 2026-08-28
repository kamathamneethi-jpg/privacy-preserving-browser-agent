import { POLICY_ACTIONS, PROCESSING_DESTINATIONS, TASK_RELEVANCE_LEVELS } from "../../shared-types/src/privacy-contracts.js";
import { evaluatePiiPolicyItem } from "./policy-engine.js";

/**
 * The only actions a later data-handling layer may take after policy evaluation.
 * `ALLOW` is reserved for information explicitly classified as non-sensitive.
 */
export const PrivacyDecision = Object.freeze({
  ALLOW: "ALLOW",
  REDACT: "REDACT",
  TOKENIZE: "TOKENIZE",
  LOCAL_ONLY: "LOCAL_ONLY"
});

/**
 * Compatibility wrapper around the Step 8 Centralized Privacy Policy Engine.
 * Decides how a detected category or classification may be handled without receiving raw values.
 *
 * @param {object} context
 * @param {"sensitive" | "not_sensitive" | "unknown"} context.classification
 * @param {"remote_reasoning" | "local_action" | "render" | "unknown"} context.purpose
 * @param {boolean} [context.requiresReference=false] Whether remote reasoning needs a stable placeholder.
 * @param {boolean} [context.userAuthorized=false] Whether the user approved a local action using it.
 * @returns {{ decision: string, reason: string, mayLeaveDevice: boolean }}
 */
export function decidePrivacyPolicy(context) {
  const { classification, purpose, requiresReference = false, userAuthorized = false } = context ?? {};

  if (classification === "not_sensitive") {
    return {
      decision: PrivacyDecision.ALLOW,
      reason: "Information is explicitly classified as non-sensitive.",
      mayLeaveDevice: true
    };
  }

  // Map legacy purpose to Step 8 PROCESSING_DESTINATIONS
  let destination = PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION;
  if (purpose === "remote_reasoning") {
    destination = PROCESSING_DESTINATIONS.REMOTE_REASONING;
  } else if (purpose === "local_action") {
    destination = PROCESSING_DESTINATIONS.LOCAL_BROWSER;
  }

  // For sensitive data in local action, treating as sensitive/critical category preserves LOCAL_ONLY boundary
  const category = (purpose === "local_action") ? "password_field" : "email";

  const relevance = (purpose === "local_action" && userAuthorized) || (purpose === "remote_reasoning" && requiresReference)
    ? TASK_RELEVANCE_LEVELS.REQUIRED
    : TASK_RELEVANCE_LEVELS.IRRELEVANT;

  const decisionObj = evaluatePiiPolicyItem({
    piiItem: { id: "PII_LEGACY", category, confidence: 0.95 },
    relevanceItem: { relevance, relevanceConfidence: 0.90 },
    destination,
    authorization: { authorizationGranted: userAuthorized }
  });

  const mayLeaveDevice = decisionObj.action === PrivacyDecision.ALLOW || decisionObj.action === PrivacyDecision.TOKENIZE;

  return {
    decision: decisionObj.action,
    reason: decisionObj.reason,
    mayLeaveDevice
  };
}
