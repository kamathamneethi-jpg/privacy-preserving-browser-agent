/**
 * Context Analyzer Module for Step 7 & Phase 2 Generalization.
 * Determines the task relevance, semantic role, and task necessity of each detected entity.
 *
 * Privacy Principle:
 * Operates strictly on sanitized entity metadata (category, confidence, bbox, DOM hints).
 * Zero raw sensitive strings are processed or returned.
 */

import {
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  SENSITIVITY_LEVELS,
  CONTEXT_EVIDENCE_CODES
} from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory, TASK_INTENT_PATTERNS, NEGATION_PATTERNS, CATEGORY_KEYWORD_MAP } from "./config.js";
import { CATEGORY_SENSITIVITY_MAP, PUBLIC_SAFE_CATEGORIES, DEFAULT_CATEGORY_ROLES } from "./policy-config.js";

/**
 * Normalizes category names for context evaluation.
 */
function normalizeCategory(cat) {
  const safe = String(cat || "").toLowerCase();
  if (safe.includes("email")) return PiiCategory.EMAIL;
  if (safe.includes("phone")) return PiiCategory.PHONE;
  if (safe.includes("payment") || safe.includes("card")) return PiiCategory.PAYMENT_CARD;
  if (safe.includes("password")) return PiiCategory.PASSWORD_FIELD;
  if (safe.includes("otp")) return PiiCategory.OTP;
  if (safe.includes("name")) return PiiCategory.PERSON_NAME;
  if (safe.includes("address")) return PiiCategory.ADDRESS;
  if (safe.includes("account")) return PiiCategory.ACCOUNT_IDENTIFIER;
  return safe;
}

/**
 * Infers the semantic role of an entity from multiple contextual signals:
 * - DOM element properties (type, name, id, placeholder, aria-label, autocomplete)
 * - Associated DOM semantics descriptors
 * - Task intent and operations
 * - Detected entity category
 *
 * @param {object} item - PII or detected entity metadata
 * @param {Array<object>} [domSemantics=[]] - Extracted DOM semantics
 * @param {object} [taskAnalysis={}] - Task intent analysis
 * @returns {{ role: string, roleConfidence: number, roleEvidence: string[] }}
 */
export function inferSemanticRole(item = {}, domSemantics = [], taskAnalysis = {}) {
  const cat = normalizeCategory(item.category || item.type);
  const roleEvidence = [];

  // Find matching DOM semantic descriptor by category, id, or node reference
  const matchingDom = domSemantics.find((d) => {
    if (!d) return false;
    if (item.id && d.elementId && item.id === d.elementId) return true;
    if (d.nodeId && item.nodeId && d.nodeId === item.nodeId) return true;
    return normalizeCategory(d.category) === cat;
  }) || {};

  const inputType = String(item.type || matchingDom.type || "").toLowerCase();
  const autocomplete = String(matchingDom.autocomplete || item.autocomplete || "").toLowerCase();
  const nameOrId = String(`${matchingDom.name || ""} ${matchingDom.id || ""} ${matchingDom.ariaLabel || ""} ${matchingDom.placeholder || ""}`).toLowerCase();

  // 1. Authentication Secret (Passwords, PINs, OTPs)
  if (
    inputType === "password" ||
    autocomplete.includes("password") ||
    autocomplete.includes("current-password") ||
    autocomplete.includes("new-password") ||
    cat === PiiCategory.PASSWORD_FIELD ||
    cat === "password" ||
    cat === PiiCategory.OTP ||
    /\b(?:passcode|otp|2fa|verification code|pin|secret)\b/i.test(nameOrId)
  ) {
    if (inputType === "password") roleEvidence.push("INPUT_TYPE_PASSWORD");
    if (autocomplete.includes("password")) roleEvidence.push("AUTOCOMPLETE_PASSWORD");
    if (cat === PiiCategory.OTP || /\botp\b/i.test(nameOrId)) roleEvidence.push("OTP_CREDENTIAL");
    return {
      role: SEMANTIC_ROLES.AUTH_SECRET,
      roleConfidence: 0.96,
      roleEvidence
    };
  }

  // 2. Billing / Payment Information
  if (
    cat === PiiCategory.PAYMENT_CARD ||
    cat === "credit_card" ||
    cat === "payment_card_field" ||
    autocomplete.includes("cc-") ||
    autocomplete.includes("card") ||
    autocomplete.includes("billing") ||
    nameOrId.includes("billing") ||
    nameOrId.includes("cvv") ||
    nameOrId.includes("cvc") ||
    nameOrId.includes("card") ||
    nameOrId.includes("payment")
  ) {
    if (autocomplete.includes("cc-") || autocomplete.includes("billing")) roleEvidence.push("AUTOCOMPLETE_PAYMENT");
    if (cat === PiiCategory.PAYMENT_CARD) roleEvidence.push("PAYMENT_CARD_CATEGORY");
    if (nameOrId.includes("billing") || nameOrId.includes("card")) roleEvidence.push("BILLING_NAME_ATTRIBUTE");
    return {
      role: SEMANTIC_ROLES.BILLING_INFO,
      roleConfidence: 0.94,
      roleEvidence
    };
  }

  // 3. Shipping Information
  if (
    (cat === PiiCategory.ADDRESS && !nameOrId.includes("billing")) ||
    autocomplete.includes("shipping") ||
    autocomplete.includes("street-address") ||
    autocomplete.includes("postal-code") ||
    /\b(?:shipping|delivery|ship_to|shipment|street|postal|zip)\b/i.test(nameOrId)
  ) {
    if (autocomplete.includes("shipping")) roleEvidence.push("AUTOCOMPLETE_SHIPPING");
    if (/\b(?:shipping|delivery)\b/i.test(nameOrId)) roleEvidence.push("SHIPPING_NAME_ATTRIBUTE");
    return {
      role: SEMANTIC_ROLES.SHIPPING_INFO,
      roleConfidence: 0.90,
      roleEvidence
    };
  }

  // 4. Recipient Context (Messaging, Transfer, Delivery Target)
  if (
    nameOrId.includes("recipient") ||
    nameOrId.includes("send_to") ||
    nameOrId.includes("sendto") ||
    nameOrId.includes("to_email") ||
    nameOrId.includes("to_address") ||
    nameOrId.includes("receiver") ||
    nameOrId.includes("client") ||
    (taskAnalysis.intent === TASK_INTENT_TYPES.CONTACT && /\b(?:to|send|message)\b/i.test(taskAnalysis.rawRequest || ""))
  ) {
    roleEvidence.push("RECIPIENT_CONTEXT");
    return {
      role: SEMANTIC_ROLES.RECIPIENT,
      roleConfidence: 0.88,
      roleEvidence
    };
  }

  // 5. Account Identifier (User ID, login email, username, phone for login)
  if (
    cat === PiiCategory.EMAIL ||
    cat === PiiCategory.EMAIL_FIELD ||
    cat === PiiCategory.PHONE ||
    cat === PiiCategory.PHONE_FIELD ||
    cat === PiiCategory.ACCOUNT_IDENTIFIER ||
    cat === PiiCategory.PERSON_NAME ||
    autocomplete.includes("email") ||
    autocomplete.includes("username") ||
    autocomplete.includes("tel") ||
    /\b(?:username|user_id|login_email|account_id)\b/i.test(nameOrId)
  ) {
    if (autocomplete.includes("username") || autocomplete.includes("email")) roleEvidence.push("AUTOCOMPLETE_USER_ID");
    if (/\b(?:username|account)\b/i.test(nameOrId)) roleEvidence.push("ACCOUNT_NAME_ATTRIBUTE");
    roleEvidence.push("ACCOUNT_IDENTIFIER_CATEGORY");
    return {
      role: SEMANTIC_ROLES.ACCOUNT_IDENTIFIER,
      roleConfidence: 0.90,
      roleEvidence
    };
  }

  // 6. Public Product Attribute / Specification
  if (
    PUBLIC_SAFE_CATEGORIES.includes(cat) ||
    cat === "product_title" ||
    cat === "price" ||
    cat === "brand" ||
    cat === "color" ||
    cat === "specification" ||
    /\b(?:product|price|title|specs|brand|model)\b/i.test(nameOrId)
  ) {
    roleEvidence.push("PUBLIC_PRODUCT_ATTRIBUTE");
    return {
      role: SEMANTIC_ROLES.PUBLIC_ATTRIBUTE,
      roleConfidence: 0.95,
      roleEvidence
    };
  }

  // 7. Search Target
  if (
    inputType === "search" ||
    matchingDom.role === "searchbox" ||
    /\b(?:search|query|find|lookup)\b/i.test(nameOrId)
  ) {
    roleEvidence.push("SEARCH_INPUT_ROLE");
    return {
      role: SEMANTIC_ROLES.SEARCH_TARGET,
      roleConfidence: 0.92,
      roleEvidence
    };
  }

  // 8. General / Contextual Default
  const fallbackRole = DEFAULT_CATEGORY_ROLES[cat] || SEMANTIC_ROLES.GENERAL_DATA;
  roleEvidence.push("DEFAULT_CATEGORY_MAPPING");
  return {
    role: fallbackRole,
    roleConfidence: 0.70,
    roleEvidence
  };
}

/**
 * Determines task necessity separately from task relevance.
 * Asks: "For what operational purpose is this information required?"
 *
 * Distinguishes:
 * - REMOTE_REASONING_REQUIRED: Sensitive data required for remote reasoning/planning (TOKENIZE candidates)
 * - LOCAL_EXECUTION_ONLY: Critical secrets needed exclusively on-device for local execution (LOCAL_ONLY)
 * - CONTEXTUAL_REFERENCE: Non-sensitive or public reference context (ALLOW)
 * - UNNECESSARY: Sensitive data unnecessary for current task (REDACT candidates)
 * - UNKNOWN: Uncertain necessity
 *
 * @param {object} params
 * @param {string} params.category - Entity category
 * @param {string} params.relevance - Task relevance (TASK_RELEVANCE_LEVELS)
 * @param {string} params.semanticRole - Inferred semantic role (SEMANTIC_ROLES)
 * @param {string} [params.sensitivity] - Sensitivity level
 * @param {string} [params.taskIntent] - Primary task intent
 * @returns {{ necessity: string, necessityConfidence: number, necessityReason: string }}
 */
export function determineTaskNecessity({
  category,
  relevance = TASK_RELEVANCE_LEVELS.UNKNOWN,
  semanticRole = SEMANTIC_ROLES.UNKNOWN,
  sensitivity = SENSITIVITY_LEVELS.MEDIUM,
  taskIntent = TASK_INTENT_TYPES.UNKNOWN
} = {}) {
  const cat = normalizeCategory(category);
  const isPublicSafe = PUBLIC_SAFE_CATEGORIES.includes(cat) || sensitivity === SENSITIVITY_LEVELS.LOW || sensitivity === SENSITIVITY_LEVELS.PUBLIC;

  // 1. Critical Authentication / Security Secrets -> LOCAL_EXECUTION_ONLY
  if (
    semanticRole === SEMANTIC_ROLES.AUTH_SECRET ||
    cat === PiiCategory.PASSWORD_FIELD ||
    cat === "password" ||
    cat === PiiCategory.OTP ||
    sensitivity === SENSITIVITY_LEVELS.CRITICAL
  ) {
    if (relevance !== TASK_RELEVANCE_LEVELS.IRRELEVANT) {
      return {
        necessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
        necessityConfidence: 0.98,
        necessityReason: "Authentication secret is required for local execution only and must not leave the device."
      };
    }
    return {
      necessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      necessityConfidence: 0.95,
      necessityReason: "Security secret is not required for the current task operation."
    };
  }

  // 2. Public / Non-sensitive Content -> CONTEXTUAL_REFERENCE
  if (isPublicSafe || semanticRole === SEMANTIC_ROLES.PUBLIC_ATTRIBUTE) {
    if (relevance !== TASK_RELEVANCE_LEVELS.IRRELEVANT) {
      return {
        necessity: TASK_NECESSITY_LEVELS.CONTEXTUAL_REFERENCE,
        necessityConfidence: 0.95,
        necessityReason: "Public context or product attribute useful for task reasoning."
      };
    }
    return {
      necessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      necessityConfidence: 0.90,
      necessityReason: "Public context is irrelevant to the current task."
    };
  }

  // 3. Task-Irrelevant Sensitive PII -> UNNECESSARY
  if (relevance === TASK_RELEVANCE_LEVELS.IRRELEVANT) {
    return {
      necessity: TASK_NECESSITY_LEVELS.UNNECESSARY,
      necessityConfidence: 0.92,
      necessityReason: `Sensitive data (${cat}) is not needed for the current task operation.`
    };
  }

  // 4. Task-Required Sensitive PII -> REMOTE_REASONING_REQUIRED
  if (relevance === TASK_RELEVANCE_LEVELS.REQUIRED) {
    return {
      necessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      necessityConfidence: 0.90,
      necessityReason: `Sensitive entity (${cat}) is necessary for task workflow and planning.`
    };
  }

  // 5. Optional Form Field Context -> REMOTE_REASONING_REQUIRED
  if (relevance === TASK_RELEVANCE_LEVELS.OPTIONAL) {
    return {
      necessity: TASK_NECESSITY_LEVELS.REMOTE_REASONING_REQUIRED,
      necessityConfidence: 0.75,
      necessityReason: `Entity (${cat}) may be contextually relevant for active form completion.`
    };
  }

  // 6. Ambiguous / Unknown Fallback
  return {
    necessity: TASK_NECESSITY_LEVELS.UNKNOWN,
    necessityConfidence: 0.50,
    necessityReason: `Operational necessity for category '${cat}' cannot be determined with confidence.`
  };
}

/**
 * Analyzes user task instruction text to extract task intent, negations, and explicit category targets.
 *
 * @param {string} userInstruction
 * @returns {{ intent: string, intentConfidence: number, explicitCategories: string[], negatedCategories: string[], rawRequest: string }}
 */
export function analyzeTaskIntent(userInstruction) {
  const rawRequest = typeof userInstruction === "string" ? userInstruction.trim() : "";
  const safeTask = rawRequest.toLowerCase();
  if (!safeTask) {
    return {
      intent: TASK_INTENT_TYPES.UNKNOWN,
      intentConfidence: 0.50,
      explicitCategories: [],
      negatedCategories: [],
      rawRequest
    };
  }

  // 1. Detect Negations
  const negatedCategories = new Set();
  for (const negPattern of NEGATION_PATTERNS) {
    negPattern.lastIndex = 0;
    for (const match of safeTask.matchAll(negPattern)) {
      const negatedPhrase = match[1] || "";
      for (const [cat, catPattern] of Object.entries(CATEGORY_KEYWORD_MAP)) {
        if (catPattern.test(negatedPhrase)) {
          negatedCategories.add(cat);
        }
      }
    }
  }

  // 2. Extract Explicit Category Keywords (excluding negated ones)
  const explicitCategories = new Set();
  for (const [cat, catPattern] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (catPattern.test(safeTask) && !negatedCategories.has(cat)) {
      explicitCategories.add(cat);
    }
  }

  // 3. Determine Primary Task Intent
  let primaryIntent = TASK_INTENT_TYPES.UNKNOWN;
  let intentConfidence = 0.50;

  for (const { intent, regex, baseConfidence } of TASK_INTENT_PATTERNS) {
    if (regex.test(safeTask)) {
      primaryIntent = intent;
      intentConfidence = baseConfidence;
      break;
    }
  }

  // Handle ambiguous "contact information" keyword
  if (/\b(?:contact\s*info|contact\s*information)\b/i.test(safeTask)) {
    if (primaryIntent === TASK_INTENT_TYPES.UNKNOWN) {
      primaryIntent = TASK_INTENT_TYPES.FIND_INFORMATION;
      intentConfidence = 0.85;
    }
  }

  return {
    intent: primaryIntent,
    intentConfidence,
    explicitCategories: Array.from(explicitCategories),
    negatedCategories: Array.from(negatedCategories),
    rawRequest
  };
}

/**
 * Evaluates the task relevance, semantic role, and task necessity of detected entities.
 *
 * @param {object} params
 * @param {string} params.userInstruction - User task instruction
 * @param {Array<object>} [params.piiItems=[]] - Sanitized PII items (with id, category, confidence, bbox)
 * @param {Array<object>} [params.domSemantics=[]] - Optional DOM field descriptors
 * @param {object} [params.pageContext={}] - Optional page metadata
 * @returns {{ taskIntent: string, intentConfidence: number, piiRelevance: Array<object> }}
 */
export function evaluatePiiTaskRelevance({ userInstruction, piiItems = [], domSemantics = [], pageContext = {} } = {}) {
  const taskAnalysis = analyzeTaskIntent(userInstruction);
  const safeInstruction = typeof userInstruction === "string" ? userInstruction.toLowerCase() : "";
  const isContactInfoTask = /\b(?:contact\s*info|contact\s*information)\b/i.test(safeInstruction);

  const piiRelevance = [];

  for (const item of piiItems) {
    if (!item) continue;
    const cat = normalizeCategory(item.category);
    const detectionConf = Number(item.confidence) || 0.90;
    const itemId = item.id || `PII_${cat.toUpperCase()}`;
    const sensitivity = CATEGORY_SENSITIVITY_MAP[cat] || SENSITIVITY_LEVELS.MEDIUM;

    const evidenceCodes = [];
    let relevance = TASK_RELEVANCE_LEVELS.UNKNOWN;
    let relevanceConfidence = 0.70;
    let reason = "Relevance evaluated based on task context and page evidence.";

    // Rule 1: Task Negation Check
    if (taskAnalysis.negatedCategories.includes(cat)) {
      relevance = TASK_RELEVANCE_LEVELS.IRRELEVANT;
      relevanceConfidence = 0.95;
      evidenceCodes.push(CONTEXT_EVIDENCE_CODES.TASK_NEGATION);
      reason = `Category '${cat}' is explicitly excluded or negated in user instruction.`;
    }
    // Rule 2: Explicit Task Keyword Match
    else if (taskAnalysis.explicitCategories.includes(cat)) {
      relevance = TASK_RELEVANCE_LEVELS.REQUIRED;
      relevanceConfidence = 0.92;
      evidenceCodes.push(CONTEXT_EVIDENCE_CODES.EXPLICIT_TASK_KEYWORD);
      reason = `Category '${cat}' is explicitly requested in user task.`;

      // Check DOM agreement
      const domAgrees = domSemantics.some((d) => normalizeCategory(d.category) === cat);
      if (domAgrees) {
        relevanceConfidence = 0.96;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH);
        reason += " Confirmed by matching DOM field on page.";
      }
    }
    // Rule 3: Read / Search Tasks (No PII Required, but public attributes remain contextual)
    else if (taskAnalysis.intent === TASK_INTENT_TYPES.READ_INFORMATION || taskAnalysis.intent === TASK_INTENT_TYPES.SEARCH) {
      if (PUBLIC_SAFE_CATEGORIES.includes(cat) || sensitivity === SENSITIVITY_LEVELS.LOW || sensitivity === SENSITIVITY_LEVELS.PUBLIC) {
        relevance = TASK_RELEVANCE_LEVELS.REQUIRED;
        relevanceConfidence = 0.90;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH);
        reason = `Public attribute '${cat}' is relevant context for ${taskAnalysis.intent}.`;
      } else {
        relevance = TASK_RELEVANCE_LEVELS.IRRELEVANT;
        relevanceConfidence = 0.90;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.INTENT_TAXONOMY_MATCH);
        reason = `Task intent '${taskAnalysis.intent}' does not require personal data.`;
      }
    }
    // Rule 4: Ambiguous "Contact Information" Task
    else if (isContactInfoTask && [PiiCategory.EMAIL, PiiCategory.PHONE, PiiCategory.ADDRESS].includes(cat)) {
      const domAgrees = domSemantics.some((d) => normalizeCategory(d.category) === cat);
      if (domAgrees) {
        relevance = TASK_RELEVANCE_LEVELS.REQUIRED;
        relevanceConfidence = 0.88;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH, CONTEXT_EVIDENCE_CODES.PAGE_CONTEXT_AGREEMENT);
        reason = `Category '${cat}' matches contact information request with DOM field evidence.`;
      } else {
        relevance = TASK_RELEVANCE_LEVELS.OPTIONAL;
        relevanceConfidence = 0.75;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DEFAULT_CONSERVATIVE);
        reason = `Category '${cat}' is optional contact information without explicit DOM target.`;
      }
    }
    // Rule 5: Intent-driven form tasks (LOGIN, VERIFY_IDENTITY, CHECKOUT, PAYMENT) with Page Context Inspection
    else if ([TASK_INTENT_TYPES.LOGIN, TASK_INTENT_TYPES.SIGNUP, TASK_INTENT_TYPES.CHECKOUT, TASK_INTENT_TYPES.VERIFY_IDENTITY, TASK_INTENT_TYPES.PAYMENT].includes(taskAnalysis.intent)) {
      const domMatch = domSemantics.find((d) => normalizeCategory(d.category) === cat);
      if (domMatch) {
        relevance = TASK_RELEVANCE_LEVELS.REQUIRED;
        relevanceConfidence = 0.90;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.INTENT_TAXONOMY_MATCH, CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH);
        reason = `Category '${cat}' is required for ${taskAnalysis.intent} as confirmed by DOM form field.`;
      } else if (cat === PiiCategory.OTP && taskAnalysis.intent === TASK_INTENT_TYPES.VERIFY_IDENTITY) {
        relevance = TASK_RELEVANCE_LEVELS.REQUIRED;
        relevanceConfidence = 0.92;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.INTENT_TAXONOMY_MATCH);
        reason = `OTP is required for identity verification.`;
      } else {
        relevance = TASK_RELEVANCE_LEVELS.OPTIONAL;
        relevanceConfidence = 0.70;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DEFAULT_CONSERVATIVE);
        reason = `Category '${cat}' may be optional for ${taskAnalysis.intent} context.`;
      }
    }
    // Rule 6: Generic form tasks ("Complete this form") -> Conservative
    else if (taskAnalysis.intent === TASK_INTENT_TYPES.SUBMIT_FORM || taskAnalysis.intent === TASK_INTENT_TYPES.ENTER_INFORMATION) {
      const domMatch = domSemantics.find((d) => normalizeCategory(d.category) === cat);
      if (domMatch) {
        relevance = TASK_RELEVANCE_LEVELS.OPTIONAL;
        relevanceConfidence = 0.75;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH, CONTEXT_EVIDENCE_CODES.DEFAULT_CONSERVATIVE);
        reason = `Category '${cat}' is an active form field, conservatively classified as optional.`;
      } else {
        relevance = TASK_RELEVANCE_LEVELS.UNKNOWN;
        relevanceConfidence = 0.60;
        evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DEFAULT_CONSERVATIVE);
        reason = `Uncertain whether category '${cat}' is needed for generic form task.`;
      }
    }
    // Rule 7: Unrelated PII for specific task (e.g. Find email vs phone)
    else if (taskAnalysis.explicitCategories.length > 0 && !taskAnalysis.explicitCategories.includes(cat)) {
      relevance = TASK_RELEVANCE_LEVELS.IRRELEVANT;
      relevanceConfidence = 0.88;
      evidenceCodes.push(CONTEXT_EVIDENCE_CODES.INTENT_TAXONOMY_MATCH);
      reason = `Category '${cat}' is not requested in task '${userInstruction}'.`;
    }
    // Rule 8: Default Fallback
    else {
      relevance = TASK_RELEVANCE_LEVELS.UNKNOWN;
      relevanceConfidence = 0.50;
      evidenceCodes.push(CONTEXT_EVIDENCE_CODES.DEFAULT_CONSERVATIVE);
      reason = "Task relevance cannot be determined with sufficient confidence.";
    }

    // Infer Semantic Role from multiple contextual signals
    const { role, roleConfidence, roleEvidence } = inferSemanticRole(item, domSemantics, taskAnalysis);

    // Determine Task Necessity separately from Task Relevance
    const { necessity, necessityConfidence, necessityReason } = determineTaskNecessity({
      category: cat,
      relevance,
      semanticRole: role,
      sensitivity,
      taskIntent: taskAnalysis.intent
    });

    // Aggregate sanitized structural evidence
    const combinedEvidence = [
      ...evidenceCodes,
      ...roleEvidence
    ];

    piiRelevance.push({
      id: itemId,
      category: cat,
      sensitivity,
      taskRelevance: relevance,
      relevance, // for backward compatibility
      taskNecessity: necessity,
      semanticRole: role,
      detectionConfidence: detectionConf,
      relevanceConfidence: Number(relevanceConfidence.toFixed(2)),
      confidence: Number(relevanceConfidence.toFixed(2)),
      evidenceCodes,
      evidence: combinedEvidence,
      reason: `${reason} ${necessityReason}`.trim()
    });
  }

  return {
    taskIntent: taskAnalysis.intent,
    intentConfidence: Number(taskAnalysis.intentConfidence.toFixed(2)),
    piiRelevance
  };
}
