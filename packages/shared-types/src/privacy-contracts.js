/**
 * Safe contract constants. Objects sent to a remote backend must contain a token,
 * never the original value it represents.
 */
export const SAFE_REMOTE_VALUE_SHAPE = Object.freeze({
  token: "string",
  category: "string",
  decision: "TOKENIZE"
});

export const PII_SOURCE_TYPES = Object.freeze({
  DOM: "dom",
  OCR: "ocr",
  FUSION: "fusion"
});

export const LOCALIZED_PII_ITEM_SHAPE = Object.freeze({
  id: "string",
  type: "string",
  confidence: "number",
  bbox: {
    x: "number",
    y: "number",
    width: "number",
    height: "number"
  },
  source: "string",
  placeholder: "string"
});

export const TASK_INTENT_TYPES = Object.freeze({
  FIND_INFORMATION: "FIND_INFORMATION",
  READ_INFORMATION: "READ_INFORMATION",
  ENTER_INFORMATION: "ENTER_INFORMATION",
  SUBMIT_FORM: "SUBMIT_FORM",
  LOGIN: "LOGIN",
  SIGNUP: "SIGNUP",
  CHECKOUT: "CHECKOUT",
  VERIFY_IDENTITY: "VERIFY_IDENTITY",
  SEARCH: "SEARCH",
  CONTACT: "CONTACT",
  PAYMENT: "PAYMENT",
  UNKNOWN: "UNKNOWN"
});

export const TASK_RELEVANCE_LEVELS = Object.freeze({
  REQUIRED: "REQUIRED",
  OPTIONAL: "OPTIONAL",
  IRRELEVANT: "IRRELEVANT",
  UNKNOWN: "UNKNOWN"
});

export const CONTEXT_EVIDENCE_CODES = Object.freeze({
  EXPLICIT_TASK_KEYWORD: "EXPLICIT_TASK_KEYWORD",
  DOM_SEMANTIC_MATCH: "DOM_SEMANTIC_MATCH",
  INTENT_TAXONOMY_MATCH: "INTENT_TAXONOMY_MATCH",
  TASK_NEGATION: "TASK_NEGATION",
  PAGE_CONTEXT_AGREEMENT: "PAGE_CONTEXT_AGREEMENT",
  DEFAULT_CONSERVATIVE: "DEFAULT_CONSERVATIVE"
});

export const SENSITIVITY_LEVELS = Object.freeze({
  PUBLIC: "PUBLIC",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
});

export const PROCESSING_DESTINATIONS = Object.freeze({
  LOCAL_BROWSER: "LOCAL_BROWSER",
  LOCAL_EXTENSION: "LOCAL_EXTENSION",
  REMOTE_REASONING: "REMOTE_REASONING",
  REMOTE_SERVICE: "REMOTE_SERVICE",
  UNKNOWN_DESTINATION: "UNKNOWN_DESTINATION"
});

export const POLICY_ACTIONS = Object.freeze({
  REDACT: "REDACT",
  TOKENIZE: "TOKENIZE",
  LOCAL_ONLY: "LOCAL_ONLY",
  ALLOW: "ALLOW"
});

export const POLICY_REASON_CODES = Object.freeze({
  TASK_REQUIRED: "TASK_REQUIRED",
  TASK_OPTIONAL: "TASK_OPTIONAL",
  TASK_IRRELEVANT: "TASK_IRRELEVANT",
  TASK_UNKNOWN: "TASK_UNKNOWN",
  LOW_DETECTION_CONFIDENCE: "LOW_DETECTION_CONFIDENCE",
  LOW_RELEVANCE_CONFIDENCE: "LOW_RELEVANCE_CONFIDENCE",
  LOW_POLICY_CONFIDENCE: "LOW_POLICY_CONFIDENCE",
  CRITICAL_SENSITIVITY: "CRITICAL_SENSITIVITY",
  HIGH_SENSITIVITY: "HIGH_SENSITIVITY",
  MEDIUM_SENSITIVITY: "MEDIUM_SENSITIVITY",
  REMOTE_DESTINATION: "REMOTE_DESTINATION",
  LOCAL_DESTINATION: "LOCAL_DESTINATION",
  UNKNOWN_DESTINATION: "UNKNOWN_DESTINATION",
  AUTHORIZATION_REQUIRED: "AUTHORIZATION_REQUIRED",
  AUTHORIZATION_GRANTED: "AUTHORIZATION_GRANTED",
  AUTHORIZATION_MISSING: "AUTHORIZATION_MISSING",
  TOKENIZATION_PREFERRED: "TOKENIZATION_PREFERRED",
  LOCAL_ONLY_REQUIRED: "LOCAL_ONLY_REQUIRED",
  REDACTION_REQUIRED: "REDACTION_REQUIRED",
  SAFE_DEFAULT: "SAFE_DEFAULT"
});

// --- Step 9: Secure Local Privacy Vault Contracts ---

export const VAULT_ENTRY_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED"
});

export const VAULT_PURPOSES = Object.freeze({
  LOGIN: "LOGIN",
  FORM_FILL: "FORM_FILL",
  CHECKOUT: "CHECKOUT",
  VERIFY_IDENTITY: "VERIFY_IDENTITY",
  CONTACT: "CONTACT",
  SEARCH: "SEARCH",
  LOCAL_ACTION: "LOCAL_ACTION"
});

export const VAULT_ACCESS_RESULTS = Object.freeze({
  GRANTED: "GRANTED",
  DENIED_UNAUTHORIZED: "DENIED_UNAUTHORIZED",
  DENIED_PURPOSE_MISMATCH: "DENIED_PURPOSE_MISMATCH",
  DENIED_EXPIRED: "DENIED_EXPIRED",
  DENIED_REVOKED: "DENIED_REVOKED",
  DENIED_REMOTE_DESTINATION: "DENIED_REMOTE_DESTINATION",
  DENIED_NOT_FOUND: "DENIED_NOT_FOUND",
  DENIED_INVALID_REQUEST: "DENIED_INVALID_REQUEST"
});

export const VAULT_METADATA_SHAPE = Object.freeze({
  vaultId: "string",
  piiId: "string",
  category: "string",
  purpose: "string",
  createdAt: "number",
  expiresAt: "number",
  state: "string"
});

// --- Step 10: On-Device OCR / Visual Perception Contracts ---

export const VISUAL_PERCEPTION_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  PROCESSING: "PROCESSING",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const VISUAL_BACKENDS = Object.freeze({
  LOCAL_ADAPTER: "local_adapter",
  WASM: "wasm",
  TESSERACT_JS: "tesseract_js",
  ONNX_WEB: "onnx_web"
});

export const OCR_BLOCK_SHAPE = Object.freeze({
  text: "string",
  bbox: {
    x: "number",
    y: "number",
    width: "number",
    height: "number"
  },
  confidence: "number"
});

// --- Step 11: Sanitized Page State & Remote Reasoning Context Contracts ---

export const SANITIZED_CONTEXT_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  PROCESSING: "PROCESSING",
  SANITIZED: "SANITIZED",
  ERROR: "ERROR",
  REJECTED: "REJECTED"
});

export const TOKEN_TYPES = Object.freeze({
  OPAQUE_ID: "OPAQUE_ID",
  CATEGORY_PLACEHOLDER: "CATEGORY_PLACEHOLDER",
  LOCAL_REFERENCE: "LOCAL_REFERENCE"
});

export const SANITIZED_PAYLOAD_SHAPE = Object.freeze({
  status: "string",
  version: "string",
  taskIntent: "string",
  domTree: "object",
  visualBlocks: "array",
  tokenMapping: "object",
  metadata: "object"
});
