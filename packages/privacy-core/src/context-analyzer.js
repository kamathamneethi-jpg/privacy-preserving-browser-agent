/**
 * Context Analyzer Module for Step 7.
 * Determines the relevance of each detected PII category to the user's current task instruction.
 *
 * Privacy Principle:
 * Operates strictly on sanitized entity metadata (category, confidence, bbox, DOM hints).
 * Zero raw sensitive strings are processed or returned.
 */

import { TASK_INTENT_TYPES, TASK_RELEVANCE_LEVELS, CONTEXT_EVIDENCE_CODES } from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory, TASK_INTENT_PATTERNS, NEGATION_PATTERNS, CATEGORY_KEYWORD_MAP } from "./config.js";

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
 * Analyzes user task instruction text to extract task intent, negations, and explicit category targets.
 *
 * @param {string} userInstruction
 * @returns {{ intent: string, intentConfidence: number, explicitCategories: string[], negatedCategories: string[] }}
 */
export function analyzeTaskIntent(userInstruction) {
  const safeTask = typeof userInstruction === "string" ? userInstruction.trim().toLowerCase() : "";
  if (!safeTask) {
    return {
      intent: TASK_INTENT_TYPES.UNKNOWN,
      intentConfidence: 0.50,
      explicitCategories: [],
      negatedCategories: []
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
    negatedCategories: Array.from(negatedCategories)
  };
}

/**
 * Evaluates the task relevance of detected PII items.
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
    // Rule 3: Read / Search Tasks (No PII Required)
    else if (taskAnalysis.intent === TASK_INTENT_TYPES.READ_INFORMATION || taskAnalysis.intent === TASK_INTENT_TYPES.SEARCH) {
      relevance = TASK_RELEVANCE_LEVELS.IRRELEVANT;
      relevanceConfidence = 0.90;
      evidenceCodes.push(CONTEXT_EVIDENCE_CODES.INTENT_TAXONOMY_MATCH);
      reason = `Task intent '${taskAnalysis.intent}' does not require personal data.`;
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
    // Rule 5: Intent-driven form tasks (LOGIN, VERIFY_IDENTITY, CHECKOUT) with Page Context Inspection
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

    piiRelevance.push({
      id: itemId,
      category: cat,
      detectionConfidence: detectionConf,
      relevance,
      relevanceConfidence: Number(relevanceConfidence.toFixed(2)),
      evidenceCodes,
      reason
    });
  }

  return {
    taskIntent: taskAnalysis.intent,
    intentConfidence: Number(taskAnalysis.intentConfidence.toFixed(2)),
    piiRelevance
  };
}
