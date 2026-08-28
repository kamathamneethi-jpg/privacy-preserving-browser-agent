/**
 * Configuration module for PII detection thresholds, category definitions,
 * independent evidence groups, and fusion parameters.
 */

export const PiiCategory = Object.freeze({
  EMAIL: "email",
  PHONE: "phone",
  PAYMENT_CARD: "payment_card",
  PASSWORD_FIELD: "password_field",
  EMAIL_FIELD: "email_field",
  PHONE_FIELD: "phone_field",
  PERSON_NAME: "person_name",
  ADDRESS: "address",
  ACCOUNT_IDENTIFIER: "account_identifier",
  OTP: "otp"
});

export const EVIDENCE_GROUPS = Object.freeze({
  PATTERN: "PATTERN",
  CHECKSUM: "CHECKSUM",
  DOM_SEMANTIC: "DOM_SEMANTIC",
  OCR_VISUAL: "OCR_VISUAL",
  HEURISTIC_SYNTAX: "HEURISTIC_SYNTAX"
});

export const DETECTION_CONFIG = Object.freeze({
  // Spatial overlap threshold for fusion (Intersection over Box Area >= 0.25 or center containment)
  FUSION_SPATIAL_OVERLAP_THRESHOLD: 0.25,

  // Spatial proximity tolerance in pixels for bounding box alignment
  FUSION_PROXIMITY_PX: 20,

  // Maximum allowed confidence score to avoid unrealistic 1.0 / 0.99 from correlated signals
  MAX_CONFIDENCE: 0.98,

  // Base confidence weights by category when matching raw pattern only
  BASE_PATTERN_CONFIDENCE: Object.freeze({
    [PiiCategory.EMAIL]: 0.98,
    [PiiCategory.PHONE]: 0.92,
    [PiiCategory.PAYMENT_CARD]: 0.95,
    [PiiCategory.PASSWORD_FIELD]: 0.95,
    [PiiCategory.OTP]: 0.85,
    // Ambiguous categories treated conservatively without DOM semantic backing
    [PiiCategory.PERSON_NAME]: 0.45,
    [PiiCategory.ADDRESS]: 0.50,
    [PiiCategory.ACCOUNT_IDENTIFIER]: 0.50
  }),

  // Boost weights per INDEPENDENT evidence group (correlated signals within same group do NOT stack)
  INDEPENDENT_EVIDENCE_BOOSTS: Object.freeze({
    [EVIDENCE_GROUPS.CHECKSUM]: 0.15,      // Valid algorithmic checksum (e.g. Luhn algorithm)
    [EVIDENCE_GROUPS.DOM_SEMANTIC]: 0.12,  // DOM input attributes / aria / label
    [EVIDENCE_GROUPS.OCR_VISUAL]: 0.10,    // Independent visual confirmation via OCR
    [EVIDENCE_GROUPS.HEURISTIC_SYNTAX]: 0.08 // Structural syntactic patterns (e.g. Title + Name)
  })
});

/**
 * Calculates multi-signal confidence using independent evidence groups.
 * Prevents correlated signals (e.g., type="email" and autocomplete="email") from artificially stacking.
 *
 * @param {string} category
 * @param {Set<string>|Array<string>} evidenceGroups - Unique independent evidence groups present
 * @returns {number} Calculated confidence score (0.0 to MAX_CONFIDENCE)
 */
export function calculateMultiSignalConfidence(category, evidenceGroups) {
  const baseConf = DETECTION_CONFIG.BASE_PATTERN_CONFIDENCE[category] || 0.50;
  const uniqueGroups = new Set(evidenceGroups || []);

  let score = baseConf;
  for (const group of uniqueGroups) {
    if (group !== EVIDENCE_GROUPS.PATTERN) {
      score += (DETECTION_CONFIG.INDEPENDENT_EVIDENCE_BOOSTS[group] || 0.05);
    }
  }

  // Cap confidence below MAX_CONFIDENCE to avoid artificial 0.99
  const capped = Math.min(DETECTION_CONFIG.MAX_CONFIDENCE, Math.max(0.10, score));
  return Math.round((capped + Number.EPSILON) * 100) / 100;
}
export const TASK_INTENT_PATTERNS = Object.freeze([
  { intent: "FIND_INFORMATION", regex: /\b(?:find|get|show|lookup|fetch|display|where is|what is my)\b/i, baseConfidence: 0.88 },
  { intent: "READ_INFORMATION", regex: /\b(?:read|browse|view article|open page|examine)\b/i, baseConfidence: 0.90 },
  { intent: "ENTER_INFORMATION", regex: /\b(?:enter|type|fill|input|put|insert)\b/i, baseConfidence: 0.88 },
  { intent: "SUBMIT_FORM", regex: /\b(?:submit|send|complete form|form)\b/i, baseConfidence: 0.85 },
  { intent: "LOGIN", regex: /\b(?:log\s*in|login|sign\s*in|authenticate)\b/i, baseConfidence: 0.92 },
  { intent: "SIGNUP", regex: /\b(?:sign\s*up|signup|register|create account)\b/i, baseConfidence: 0.92 },
  { intent: "CHECKOUT", regex: /\b(?:checkout|buy|purchase|place order)\b/i, baseConfidence: 0.90 },
  { intent: "VERIFY_IDENTITY", regex: /\b(?:otp|verify|verification|2fa|passcode|confirm identity)\b/i, baseConfidence: 0.94 },
  { intent: "SEARCH", regex: /\b(?:search|find product|lookup product)\b/i, baseConfidence: 0.88 },
  { intent: "CONTACT", regex: /\b(?:contact|reach out|get in touch|email support)\b/i, baseConfidence: 0.88 },
  { intent: "PAYMENT", regex: /\b(?:pay|payment|credit card|charge)\b/i, baseConfidence: 0.90 }
]);

export const NEGATION_PATTERNS = Object.freeze([
  /\b(?:do\s*not|don't|without|exclude|skip|no|never|omit|except)\s+([a-z0-9_\s,-]+)/gi
]);

export const CATEGORY_KEYWORD_MAP = Object.freeze({
  [PiiCategory.EMAIL]: /\b(?:email|e-mail|mail|email address)\b/i,
  [PiiCategory.PHONE]: /\b(?:phone|mobile|telephone|cell|phone number|contact number)\b/i,
  [PiiCategory.PASSWORD_FIELD]: /\b(?:password|passcode|secret)\b/i,
  [PiiCategory.PAYMENT_CARD]: /\b(?:credit card|debit card|payment card|card number|cvv)\b/i,
  [PiiCategory.OTP]: /\b(?:otp|one time code|verification code|2fa|passcode)\b/i,
  [PiiCategory.PERSON_NAME]: /\b(?:name|first name|last name|full name|person name)\b/i,
  [PiiCategory.ADDRESS]: /\b(?:address|street|postal code|zip code|location)\b/i,
  [PiiCategory.ACCOUNT_IDENTIFIER]: /\b(?:account|account number|account id|iban|customer id)\b/i
});

