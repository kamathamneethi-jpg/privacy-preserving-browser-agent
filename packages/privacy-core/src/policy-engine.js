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
  TASK_AWARE_POLICY_REASON_CODES,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES
} from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory } from "./config.js";
import { POLICY_VERSION, CATEGORY_SENSITIVITY_MAP, PUBLIC_SAFE_CATEGORIES, DEFAULT_CATEGORY_ROLES, POLICY_CONFIG } from "./policy-config.js";

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
 * Evaluates a privacy policy decision for a single entity/item.
 * Authoritative single entry point for deterministic 4-way privacy decisions:
 * ALLOW, TOKENIZE, REDACT, or LOCAL_ONLY.
 *
 * @param {object} [params={}]
 * @param {object} [params.piiItem] - Sanitized PII item or entity metadata (id, category, confidence, bbox, placeholder)
 * @param {object} [params.context] - Task or relevance context
 * @param {object} [params.relevanceItem] - Step 7 Context Analyzer relevance item (taskRelevance, taskNecessity, semanticRole, etc.)
 * @param {string} [params.destination=PROCESSING_DESTINATIONS.REMOTE_REASONING] - Processing destination
 * @param {object} [params.authorization={}] - User authorization state
 * @returns {object} Structured PolicyDecision object adhering to TASK_AWARE_POLICY_DECISION_SHAPE
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
      id: piiItem?.id || piiItem?.piiId || "PII_UNKNOWN",
      piiId: piiItem?.id || piiItem?.piiId || "PII_UNKNOWN",
      category: "unknown",
      sensitivity: SENSITIVITY_LEVELS.CRITICAL,
      taskRelevance: TASK_RELEVANCE_LEVELS.UNKNOWN,
      relevance: TASK_RELEVANCE_LEVELS.UNKNOWN,
      taskNecessity: TASK_NECESSITY_LEVELS.UNKNOWN,
      semanticRole: SEMANTIC_ROLES.UNKNOWN,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder: "[UNKNOWN_REDACTED]",
      reasonCodes: [POLICY_REASON_CODES.SAFE_DEFAULT, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Safe default: Unknown or invalid PII item is redacted.",
      detectionConfidence: 0.0,
      relevanceConfidence: 0.0,
      policyConfidence: 1.0,
      confidence: 1.0,
      authorizationRequired: true,
      authorizationGranted: false,
      policyVersion: POLICY_VERSION
    });
  }

  const piiId = piiItem.id || piiItem.piiId || `PII_${String(piiItem.category).toUpperCase()}`;
  const category = String(piiItem.category).toLowerCase();
  const detectionConfidence = Number(piiItem.confidence ?? piiItem.detectionConfidence ?? 0.90);

  // Resolve relevance metadata from relevanceItem, context, or piiItem
  const relObj = relevanceItem || (context?.relevance ? context : undefined);
  const relevance = relObj?.taskRelevance || relObj?.relevance || piiItem.taskRelevance || piiItem.relevance || TASK_RELEVANCE_LEVELS.UNKNOWN;
  const relevanceConfidence = Number(relObj?.relevanceConfidence ?? relObj?.confidence ?? piiItem.relevanceConfidence ?? piiItem.confidence ?? 0.50);
  const taskNecessity = relObj?.taskNecessity || piiItem.taskNecessity || TASK_NECESSITY_LEVELS.UNKNOWN;
  const necessityConfidence = Number(relObj?.necessityConfidence ?? relObj?.confidence ?? piiItem.necessityConfidence ?? piiItem.confidence ?? 0.50);
  const semanticRole = relObj?.semanticRole || piiItem.semanticRole || DEFAULT_CATEGORY_ROLES[category] || SEMANTIC_ROLES.UNKNOWN;
  const sensitivity = relObj?.sensitivity || piiItem.sensitivity || CATEGORY_SENSITIVITY_MAP[category] || SENSITIVITY_LEVELS.MEDIUM;

  const authRequired = Boolean(authorization?.authorizationRequired || false);
  const authGranted = Boolean(authorization?.authorizationGranted || false);

  const placeholder = piiItem.placeholder || `[${category.toUpperCase().replace(/_FIELD$/, "")}_REDACTED]`;

  // Precedence 1: Critical Security Secret Override (Security Invariant 1)
  // Passwords, OTPs, CVVs, and Auth Secrets MUST NEVER leave the device, even if requested or tokenized.
  const isAuthSecret = (
    semanticRole === SEMANTIC_ROLES.AUTH_SECRET ||
    category === PiiCategory.PASSWORD_FIELD ||
    category === "password" ||
    category === PiiCategory.OTP ||
    category === "cvv" ||
    category === "cvc" ||
    category === "security_code" ||
    (
      (targetDestination === PROCESSING_DESTINATIONS.LOCAL_BROWSER || targetDestination === PROCESSING_DESTINATIONS.LOCAL_EXTENSION) &&
      (category === PiiCategory.PAYMENT_CARD || category === "credit_card" || category === "payment_card_field")
    ) ||
    (POLICY_CONFIG.LOCAL_ONLY_CATEGORIES.includes(category) && category !== PiiCategory.PAYMENT_CARD && category !== "credit_card" && category !== "payment_card_field")
  );

  if (isAuthSecret) {
    const isIrrelevant = (relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT || taskNecessity === TASK_NECESSITY_LEVELS.UNNECESSARY);
    const action = isIrrelevant ? POLICY_ACTIONS.REDACT : POLICY_ACTIONS.LOCAL_ONLY;
    const reasonCodes = isIrrelevant
      ? [POLICY_REASON_CODES.TASK_IRRELEVANT, POLICY_REASON_CODES.CRITICAL_SENSITIVITY, POLICY_REASON_CODES.UNNECESSARY_DATA_REDACTED, POLICY_REASON_CODES.REDACTION_REQUIRED]
      : [POLICY_REASON_CODES.CRITICAL_SENSITIVITY, POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED, POLICY_REASON_CODES.CRITICAL_SECRET_LOCAL_ONLY, POLICY_REASON_CODES.LOCAL_EXECUTION_ONLY];
    const reason = isIrrelevant
      ? `Critical authentication secret '${category}' is irrelevant to task and redacted.`
      : `Critical authentication secret '${category}' is restricted to LOCAL_ONLY on-device execution.`;

    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity: SENSITIVITY_LEVELS.CRITICAL,
      taskRelevance: relevance,
      relevance,
      taskNecessity: isIrrelevant ? TASK_NECESSITY_LEVELS.UNNECESSARY : TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
      semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
      destination: targetDestination,
      decision: action,
      action,
      token: undefined,
      placeholder: "[LOCAL_ONLY_PROTECTED]",
      reasonCodes,
      reason,
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.98,
      confidence: 0.98,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 2: Unknown Destination Guard (Invariants 1 & 10)
  const isKnownDestination = [
    PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    PROCESSING_DESTINATIONS.LOCAL_EXTENSION,
    PROCESSING_DESTINATIONS.REMOTE_REASONING,
    PROCESSING_DESTINATIONS.REMOTE_SERVICE
  ].includes(targetDestination);

  if (!isKnownDestination || targetDestination === PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION) {
    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity: TASK_NECESSITY_LEVELS.UNKNOWN,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.UNKNOWN_DESTINATION, POLICY_REASON_CODES.SAFE_DEFAULT, POLICY_REASON_CODES.REDACTION_REQUIRED],
      reason: "Unknown destination triggers safe default redaction.",
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.95,
      confidence: 0.95,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 3: Task Relevance & Necessity Guards (Invariants 5 & 6)
  const isPublicSafe = PUBLIC_SAFE_CATEGORIES.includes(category) || semanticRole === SEMANTIC_ROLES.PUBLIC_ATTRIBUTE || sensitivity === SENSITIVITY_LEVELS.LOW || sensitivity === SENSITIVITY_LEVELS.PUBLIC;

  // If explicitly irrelevant or unnecessary, enforce data minimization
  if (relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT || taskNecessity === TASK_NECESSITY_LEVELS.UNNECESSARY) {
    const relReasonCode = relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT
      ? POLICY_REASON_CODES.TASK_IRRELEVANT
      : POLICY_REASON_CODES.UNNECESSARY_DATA_REDACTED;

    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [relReasonCode, POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.UNNECESSARY_DATA_REDACTED],
      reason: `Entity category '${category}' is ${relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT ? 'irrelevant' : 'unnecessary'} to the task and is redacted.`,
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.95,
      confidence: 0.95,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // If relevance and necessity are both completely unknown
  if (relevance === TASK_RELEVANCE_LEVELS.UNKNOWN && taskNecessity === TASK_NECESSITY_LEVELS.UNKNOWN) {
    if (isPublicSafe) {
      return Object.freeze({
        id: piiId,
        piiId,
        category,
        sensitivity,
        taskRelevance: relevance,
        relevance,
        taskNecessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
        semanticRole: semanticRole || SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
        destination: targetDestination,
        decision: POLICY_ACTIONS.ALLOW,
        action: POLICY_ACTIONS.ALLOW,
        token: undefined,
        placeholder,
        reasonCodes: [POLICY_REASON_CODES.PUBLIC_DATA_ALLOWED, POLICY_REASON_CODES.SAFE_CONTEXT_ALLOWED],
        reason: `Safe public category '${category}' is permitted for task processing.`,
        detectionConfidence,
        relevanceConfidence,
        necessityConfidence,
        policyConfidence: 0.95,
        confidence: 0.95,
        authorizationRequired: authRequired,
        authorizationGranted: authGranted,
        policyVersion: POLICY_VERSION
      });
    }

    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity: TASK_NECESSITY_LEVELS.UNKNOWN,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.TASK_UNKNOWN, POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT],
      reason: `PII category '${category}' has unknown task relevance/necessity and is redacted.`,
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.95,
      confidence: 0.95,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 4: Confidence Threshold Guards (Invariants 6 & 10)
  if (detectionConfidence < POLICY_CONFIG.MIN_DETECTION_CONFIDENCE) {
    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.LOW_DETECTION_CONFIDENCE, POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT],
      reason: "Low PII detection confidence triggers automatic redaction.",
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.92,
      confidence: 0.92,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  if (relevanceConfidence < POLICY_CONFIG.MIN_RELEVANCE_CONFIDENCE) {
    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.LOW_RELEVANCE_CONFIDENCE, POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT],
      reason: "Low task relevance confidence triggers automatic redaction.",
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.90,
      confidence: 0.90,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  if (necessityConfidence < POLICY_CONFIG.MIN_RELEVANCE_CONFIDENCE && taskNecessity !== TASK_NECESSITY_LEVELS.UNKNOWN) {
    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity: TASK_NECESSITY_LEVELS.UNKNOWN,
      semanticRole,
      destination: targetDestination,
      decision: POLICY_ACTIONS.REDACT,
      action: POLICY_ACTIONS.REDACT,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.LOW_POLICY_CONFIDENCE, POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT],
      reason: "Low necessity confidence triggers automatic safe redaction.",
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.90,
      confidence: 0.90,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 5: Public Safe Non-PII Context (ALLOW)
  if (isPublicSafe) {
    return Object.freeze({
      id: piiId,
      piiId,
      category,
      sensitivity,
      taskRelevance: relevance,
      relevance,
      taskNecessity: taskNecessity !== TASK_NECESSITY_LEVELS.UNKNOWN ? taskNecessity : TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
      semanticRole: semanticRole || SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
      destination: targetDestination,
      decision: POLICY_ACTIONS.ALLOW,
      action: POLICY_ACTIONS.ALLOW,
      token: undefined,
      placeholder,
      reasonCodes: [POLICY_REASON_CODES.PUBLIC_DATA_ALLOWED, POLICY_REASON_CODES.SAFE_CONTEXT_ALLOWED],
      reason: `Safe public category '${category}' is permitted for task processing.`,
      detectionConfidence,
      relevanceConfidence,
      necessityConfidence,
      policyConfidence: 0.95,
      confidence: 0.95,
      authorizationRequired: authRequired,
      authorizationGranted: authGranted,
      policyVersion: POLICY_VERSION
    });
  }

  // Precedence 6: Operational Necessity & Destination Evaluation
  const reasonCodes = [];
  let action = POLICY_ACTIONS.REDACT;
  let policyConfidence = 0.95;
  let reason = "";
  let token = undefined;

  const isRemote = (targetDestination === PROCESSING_DESTINATIONS.REMOTE_REASONING ||
                    targetDestination === PROCESSING_DESTINATIONS.REMOTE_SERVICE);

  if (sensitivity === SENSITIVITY_LEVELS.CRITICAL) reasonCodes.push(POLICY_REASON_CODES.CRITICAL_SENSITIVITY);
  else if (sensitivity === SENSITIVITY_LEVELS.HIGH) reasonCodes.push(POLICY_REASON_CODES.HIGH_SENSITIVITY);
  else reasonCodes.push(POLICY_REASON_CODES.MEDIUM_SENSITIVITY);

  if (isRemote) reasonCodes.push(POLICY_REASON_CODES.REMOTE_DESTINATION);
  else reasonCodes.push(POLICY_REASON_CODES.LOCAL_DESTINATION);

  if (relevance === TASK_RELEVANCE_LEVELS.REQUIRED) reasonCodes.push(POLICY_REASON_CODES.TASK_REQUIRED);
  else if (relevance === TASK_RELEVANCE_LEVELS.OPTIONAL) reasonCodes.push(POLICY_REASON_CODES.TASK_OPTIONAL);

  if (isRemote) {
    // Remote reasoning/service: RAW ALLOW IS STRICTLY FORBIDDEN (Invariants 2, 3, 4, 11)
    if (taskNecessity === TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY) {
      action = POLICY_ACTIONS.LOCAL_ONLY;
      policyConfidence = 0.98;
      reasonCodes.push(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED, POLICY_REASON_CODES.LOCAL_EXECUTION_ONLY);
      reason = `Category '${category}' is required for local execution only and restricted from remote reasoning.`;
    } else if (
      taskNecessity === TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED ||
      (taskNecessity === TASK_NECESSITY_LEVELS.UNKNOWN && (relevance === TASK_RELEVANCE_LEVELS.REQUIRED || relevance === TASK_RELEVANCE_LEVELS.OPTIONAL))
    ) {
      const isCard = (category === PiiCategory.PAYMENT_CARD || category === "credit_card" || category === "payment_card_field");
      const isTokenEligible = isCard || POLICY_CONFIG.TOKENIZATION_ELIGIBLE_CATEGORIES.includes(category);

      if (isTokenEligible) {
        action = POLICY_ACTIONS.TOKENIZE;
        token = generateOpaqueToken(category, piiId);
        policyConfidence = 0.95;
        reasonCodes.push(POLICY_REASON_CODES.TOKENIZATION_PREFERRED, POLICY_REASON_CODES.CONFIDENTIAL_DATA_TOKENIZED, POLICY_REASON_CODES.REMOTE_REASONING_REQUIRED);
        reason = `Required category '${category}' for remote reasoning is represented as an opaque token.`;
      } else {
        action = POLICY_ACTIONS.REDACT;
        policyConfidence = 0.95;
        reasonCodes.push(POLICY_REASON_CODES.REDACTION_REQUIRED);
        reason = `Category '${category}' is redacted for remote destination.`;
      }
    } else if (taskNecessity === TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE) {
      const isCard = (category === PiiCategory.PAYMENT_CARD || category === "credit_card" || category === "payment_card_field");
      const isTokenEligible = isCard || POLICY_CONFIG.TOKENIZATION_ELIGIBLE_CATEGORIES.includes(category);

      if (isTokenEligible) {
        action = POLICY_ACTIONS.TOKENIZE;
        token = generateOpaqueToken(category, piiId);
        policyConfidence = 0.95;
        reasonCodes.push(POLICY_REASON_CODES.TOKENIZATION_PREFERRED, POLICY_REASON_CODES.CONTEXTUAL_REFERENCE);
        reason = `Category '${category}' in contextual reference for remote reasoning is represented as an opaque token.`;
      } else {
        action = POLICY_ACTIONS.REDACT;
        policyConfidence = 0.95;
        reasonCodes.push(POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT);
        reason = `Category '${category}' is redacted for remote destination.`;
      }
    } else {
      action = POLICY_ACTIONS.REDACT;
      policyConfidence = 0.95;
      reasonCodes.push(POLICY_REASON_CODES.REDACTION_REQUIRED, POLICY_REASON_CODES.MINIMIZATION_DEFAULT);
      reason = `Category '${category}' is redacted for remote destination.`;
    }
  } else {
    // Local destination (LOCAL_BROWSER, LOCAL_EXTENSION)
    if (authGranted) {
      action = POLICY_ACTIONS.ALLOW;
      policyConfidence = 0.92;
      reasonCodes.push(POLICY_REASON_CODES.AUTHORIZATION_GRANTED);
      reason = `User-authorized category '${category}' is allowed for local browser action.`;
    } else {
      action = POLICY_ACTIONS.LOCAL_ONLY;
      policyConfidence = 0.94;
      reasonCodes.push(POLICY_REASON_CODES.LOCAL_ONLY_REQUIRED, POLICY_REASON_CODES.LOCAL_EXECUTION_ONLY);
      reason = `Category '${category}' is restricted to LOCAL_ONLY for local browser processing.`;
    }
  }

  return Object.freeze({
    id: piiId,
    piiId,
    category,
    sensitivity,
    taskRelevance: relevance,
    relevance,
    taskNecessity: taskNecessity !== TASK_NECESSITY_LEVELS.UNKNOWN ? taskNecessity : (action === POLICY_ACTIONS.LOCAL_ONLY ? TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY : (action === POLICY_ACTIONS.TOKENIZE ? TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED : TASK_NECESSITY_LEVELS.UNNECESSARY)),
    semanticRole,
    destination: targetDestination,
    decision: action,
    action,
    token,
    placeholder,
    reasonCodes,
    reason,
    detectionConfidence,
    relevanceConfidence,
    necessityConfidence,
    policyConfidence,
    confidence: policyConfidence,
    authorizationRequired: authRequired,
    authorizationGranted: authGranted,
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
