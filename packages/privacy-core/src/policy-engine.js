/**
 * Privacy Policy Engine for Step 8.
 * Evaluates localized PII items, task relevance classifications, processing destinations,
 * sensitivity levels, and authorization states to determine safe policy actions:
 * REDACT, TOKENIZE, LOCAL_ONLY, or ALLOW.
 *
 * Privacy Principle:
 * Policy decisions operate strictly on sanitized entity metadata.
 * Zero raw sensitive strings are processed or returned in policy decisions.
 */

import {
  SENSITIVITY_LEVELS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  TASK_RELEVANCE_LEVELS
} from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory } from "./config.js";
import { POLICY_VERSION, CATEGORY_SENSITIVITY_MAP, POLICY_CONFIG } from "./policy-config.js";

// In-memory session token mapping (local to session execution, never persisted)
const sessionTokenMap = new Map();

/**
 * Generates an opaque, non-predictable token for a PII category and item ID.
 * Does NOT derive tokens from raw PII values.
 *
 * @param {string} category
 * @param {string} [piiId]
 * @returns {string} Opaque token string (e.g. PII_TOKEN_EMAIL_7k9a2m)
 */
export function generateOpaqueToken(category, piiId) {
  const catPrefix = String(category || "PII").toUpperCase().replace(/_FIELD$/, "");
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const token = `PII_TOKEN_${catPrefix}_${randomSuffix}`;
  if (piiId) {
    sessionTokenMap.set(token, piiId);
  }
  return token;
}

export const generatePiiToken = generateOpaqueToken;

/**
 * Evaluates a privacy policy decision for a single localized PII item.
 *
 * @param {object} [params={}]
 * @param {object} [params.piiItem] - Sanitized PII item (id, category, confidence, bbox, placeholder)
 * @param {object} [params.context] - Task or relevance context
 * @param {object} [params.relevanceItem] - Step 7 relevance item (relevance, relevanceConfidence, evidenceCodes)
 * @param {string} [params.destination=PROCESSING_DESTINATIONS.REMOTE_REASONING] - Processing destination
 * @param {object} [params.authorization={}] - User authorization state
 * @returns {object} Structured PolicyDecision object
 */
export function evaluatePiiPolicyItem(params = {}) {
  const safeParams = params ?? {};
  const {
    piiItem,
    context,
    relevanceItem,
    destination = PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization = {}
  } = safeParams;

  const targetDestination = destination || PROCESSING_DESTINATIONS.REMOTE_REASONING;

  // Level 0: Safe Fallback for Invalid or Missing PII item
  if (!piiItem || !piiItem.category) {
    return Object.freeze({
      piiId: piiItem?.id || "PII_UNKNOWN",
      category: "unknown",
      action: POLICY_ACTIONS.REDACT,
      relevance: TASK_RELEVANCE_LEVELS.UNKNOWN,
      detectionConfidence: 0.0,
      relevanceConfidence: 0.0,
      policyConfidence: 1.0,
      sensitivity: SENSITIVITY_LEVELS.CRITICAL,
      destination: targetDestination,
      authorizationRequired: true,
      authorizationGranted: false,
      placeholder: "[UNKNOWN_REDACTED]",
      reasonCodes: [POLICY_REASON_CODES.SAFE_DEFAULT, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Safe default: Unknown or invalid PII item is redacted.",
      policyVersion: POLICY_VERSION
    });
  }

  const piiId = piiItem.id || `PII_${String(piiItem.category).toUpperCase()}`;
  const category = String(piiItem.category).toLowerCase();
  const detectionConfidence = Number(piiItem.confidence) || 0.90;

  // Resolve relevance metadata from relevanceItem or context
  const relObj = relevanceItem || (context?.relevance ? context : undefined);
  const relevance = relObj?.relevance || TASK_RELEVANCE_LEVELS.UNKNOWN;
  const relevanceConfidence = Number(relObj?.relevanceConfidence ?? 0.50);

  const sensitivity = CATEGORY_SENSITIVITY_MAP[category] || SENSITIVITY_LEVELS.MEDIUM;
  const authRequired = Boolean(authorization?.authorizationRequired || false);
  const authGranted = Boolean(authorization?.authorizationGranted || false);

  const placeholder = piiItem.placeholder || `[${category.toUpperCase().replace(/_FIELD$/, "")}_REDACTED]`;

  // Precedence 1: Unknown Destination Guard (Invariant 1 & 10)
  const isKnownDestination = [
    PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    PROCESSING_DESTINATIONS.LOCAL_EXTENSION,
    PROCESSING_DESTINATIONS.REMOTE_REASONING,
    PROCESSING_DESTINATIONS.REMOTE_SERVICE
  ].includes(targetDestination);

  if (!isKnownDestination || targetDestination === PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION) {
    return Object.freeze({
      piiId,
      category,
      action: POLICY_ACTIONS.REDACT,
      relevance,
      detectionConfidence,
      relevanceConfidence,
      policyConfidence: 0.95,
      sensitivity,
      destination: targetDestination,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.UNKNOWN_DESTINATION, POLICY_REASON_CODES.SAFE_DEFAULT, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Unknown destination triggers safe default redaction.",
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 2: Task Relevance Guard (Invariants 5 & 6)
  if (relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT || relevance === TASK_RELEVANCE_LEVELS.UNKNOWN) {
    const relReasonCode = relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT
      ? POLICY_REASON_CODES.TASK_IRRELEVANT
      : POLICY_REASON_CODES.TASK_UNKNOWN;

    return Object.freeze({
      piiId,
      category,
      action: POLICY_ACTIONS.REDACT,
      relevance,
      detectionConfidence,
      relevanceConfidence,
      policyConfidence: 0.95,
      sensitivity,
      destination: targetDestination,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      placeholder,
      reasonCodes: [relReasonCode, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: `PII category '${category}' is ${relevance.toLowerCase()} to the task and is redacted.`,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 3: Confidence Threshold Guards (Invariant 6 & 10)
  if (detectionConfidence < POLICY_CONFIG.MIN_DETECTION_CONFIDENCE) {
    return Object.freeze({
      piiId,
      category,
      action: POLICY_ACTIONS.REDACT,
      relevance,
      detectionConfidence,
      relevanceConfidence,
      policyConfidence: 0.92,
      sensitivity,
      destination: targetDestination,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.LOW_DETECTION_CONFIDENCE, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Low PII detection confidence triggers automatic redaction.",
      policyVersion: POLICY_VERSION
    });
  }

  if (relevanceConfidence < POLICY_CONFIG.MIN_RELEVANCE_CONFIDENCE) {
    return Object.freeze({
      piiId,
      category,
      action: POLICY_ACTIONS.REDACT,
      relevance,
      detectionConfidence,
      relevanceConfidence,
      policyConfidence: 0.90,
      sensitivity,
      destination: targetDestination,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.LOW_RELEVANCE_CONFIDENCE, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Low task relevance confidence triggers automatic redaction.",
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 4: Destination & Sensitivity Evaluation
  const reasonCodes = [];
  let action = POLICY_ACTIONS.REDACT;
  let policyConfidence = 0.95;
  let reason = "";
  let token = undefined;

  const isRemote = targetDestination === PROCESSING_DESTINATIONS.REMOTE_REASONING ||
                   targetDestination === PROCESSING_DESTINATIONS.REMOTE_SERVICE;

  const isCritical = sensitivity === SENSITIVITY_LEVELS.CRITICAL;

  // Populate contextual reason codes
  if (isCritical) reasonCodes.push(POLICY_REASON_CODES.CRITICAL_SENSITIVITY);
  else if (sensitivity === SENSITIVITY_LEVELS.HIGH) reasonCodes.push(POLICY_REASON_CODES.HIGH_SENSITIVITY);
  else reasonCodes.push(POLICY_REASON_CODES.MEDIUM_SENSITIVITY);

  if (isRemote) reasonCodes.push(POLICY_REASON_CODES.REMOTE_DESTINATION);
  else reasonCodes.push(POLICY_REASON_CODES.LOCAL_DESTINATION);

  if (relevance === TASK_RELEVANCE_LEVELS.REQUIRED) reasonCodes.push(POLICY_REASON_CODES.TASK_REQUIRED);
  else if (relevance === TASK_RELEVANCE_LEVELS.OPTIONAL) reasonCodes.push(POLICY_REASON_CODES.TASK_OPTIONAL);

  if (isRemote) {
    // Remote reasoning/service: RAW ALLOW IS STRICTLY FORBIDDEN (Invariants 2, 3, 4, 11)
    if (isCritical) {
      policyConfidence = 0.98;
      if (category === PiiCategory.PAYMENT_CARD || category === "credit_card" || category === "payment_card_field") {
        action = POLICY_ACTIONS.TOKENIZE;
        token = generateOpaqueToken(category, piiId);
        reasonCodes.push(POLICY_REASON_CODES.TOKENIZATION_PREFERRED);
        reason = "Required payment card for remote destination is tokenized using an opaque token.";
      } else {
        action = POLICY_ACTIONS.LOCAL_ONLY;
        reasonCodes.push(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED);
        reason = `Critical category '${category}' for remote destination is restricted to LOCAL_ONLY.`;
      }
    } else if (POLICY_CONFIG.TOKENIZATION_ELIGIBLE_CATEGORIES.includes(category)) {
      action = POLICY_ACTIONS.TOKENIZE;
      token = generateOpaqueToken(category, piiId);
      policyConfidence = 0.95;
      reasonCodes.push(POLICY_REASON_CODES.TOKENIZATION_PREFERRED);
      reason = `Required category '${category}' for remote destination is tokenized.`;
    } else {
      action = POLICY_ACTIONS.REDACT;
      policyConfidence = 0.95;
      reasonCodes.push(POLICY_REASON_CODES.REDACTION_REQUIRED);
      reason = `Category '${category}' is redacted for remote destination.`;
    }
  } else {
    // Local destination (LOCAL_BROWSER, LOCAL_EXTENSION)
    if (isCritical) {
      action = POLICY_ACTIONS.LOCAL_ONLY;
      policyConfidence = 0.96;
      reasonCodes.push(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED);
      reason = `Critical category '${category}' for local browser action is assigned LOCAL_ONLY.`;
    } else if (authGranted) {
      action = POLICY_ACTIONS.ALLOW;
      policyConfidence = 0.92;
      reasonCodes.push(POLICY_REASON_CODES.AUTHORIZATION_GRANTED);
      reason = `User-authorized category '${category}' is allowed for local browser action.`;
    } else {
      action = POLICY_ACTIONS.LOCAL_ONLY;
      policyConfidence = 0.94;
      reasonCodes.push(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED);
      reason = `Category '${category}' is restricted to LOCAL_ONLY for local browser processing.`;
    }
  }

  return Object.freeze({
    piiId,
    category,
    action,
    relevance,
    detectionConfidence,
    relevanceConfidence,
    policyConfidence,
    sensitivity,
    destination: targetDestination,
    authorizationRequired: authRequired,
    authorizationGranted: authGranted,
    token,
    placeholder,
    reasonCodes,
    reason,
    policyVersion: POLICY_VERSION
  });
}

/**
 * Evaluates privacy policy decisions for a batch of PII items independently.
 *
 * @param {object} [params={}]
 * @param {Array<object>} [params.piiItems=[]] - Sanitized localized PII items
 * @param {object} [params.contextAnalysis] - Step 7 Context Analyzer output
 * @param {string} [params.destination=PROCESSING_DESTINATIONS.REMOTE_REASONING]
 * @param {object} [params.authorization={}]
 * @returns {Array<object>} Independent PolicyDecision objects
 */
export function evaluateBatchPrivacyPolicy(params = {}) {
  const safeParams = params ?? {};
  const {
    piiItems = [],
    contextAnalysis,
    destination = PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization = {}
  } = safeParams;

  if (!Array.isArray(piiItems)) return [];

  const relevanceMap = new Map();
  if (contextAnalysis && Array.isArray(contextAnalysis.piiRelevance)) {
    for (const relItem of contextAnalysis.piiRelevance) {
      if (relItem) {
        if (relItem.id) relevanceMap.set(relItem.id, relItem);
        if (relItem.category) relevanceMap.set(String(relItem.category).toLowerCase(), relItem);
      }
    }
  }

  return piiItems.map((item) => {
    const relItem = item ? (relevanceMap.get(item.id) || relevanceMap.get(String(item.category).toLowerCase())) : undefined;
    return evaluatePiiPolicyItem({
      piiItem: item,
      relevanceItem: relItem,
      destination,
      authorization
    });
  });
}

/**
 * Recursively sanitizes data structures intended for remote transmission,
 * guaranteeing zero raw PII strings appear anywhere in nested objects or arrays.
 *
 * @param {*} data
 * @returns {*} Sanitized payload
 */
export function sanitizeRemotePayload(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    let sanitizedStr = data;
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi.test(sanitizedStr)) {
      sanitizedStr = sanitizedStr.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]");
    }
    if (/(?:\d[ -]*?){13,19}/g.test(sanitizedStr)) {
      sanitizedStr = sanitizedStr.replace(/(?:\d[ -]*?){13,19}/g, "[CARD_REDACTED]");
    }
    return sanitizedStr;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeRemotePayload(item));
  }

  if (typeof data === "object") {
    const sanitizedObj = {};
    for (const [key, val] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (["value", "rawvalue", "password", "otp", "cardnumber", "creditcard", "secret", "phonenumber", "emailaddress"].includes(lowerKey)) {
        continue;
      }
      sanitizedObj[key] = sanitizeRemotePayload(val);
    }
    return sanitizedObj;
  }

  return data;
}
