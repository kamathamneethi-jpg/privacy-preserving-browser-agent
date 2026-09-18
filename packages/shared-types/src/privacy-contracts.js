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
  FUSION: "fusion",
  GLINER: "gliner",
  REGEX: "regex",
  HYBRID: "hybrid"
});

export const DOM_TEXT_NODE_SHAPE = Object.freeze({
  nodeId: "string",
  elementPath: "string",
  text: "string",
  source: "string",
  bbox: {
    x: "number",
    y: "number",
    width: "number",
    height: "number"
  }
});

export const PII_DETECTION_SHAPE = Object.freeze({
  type: "string",
  value: "string",
  start: "number",
  end: "number",
  confidence: "number",
  source: "string",
  nodeId: "string"
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

// --- Step 12: ONNX Runtime Web / Local ML Inference Contracts ---

export const ONNX_INFERENCE_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  PROCESSING: "PROCESSING",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const ONNX_EXECUTION_PROVIDERS = Object.freeze({
  WASM: "wasm",
  WEBGL: "webgl",
  WEBGPU: "webgpu",
  CPU: "cpu",
  MOCK_TEST: "mock_test"
});

export const ONNX_MODEL_TYPES = Object.freeze({
  VISUAL_CLASSIFIER: "visual_classifier",
  PAGE_UNDERSTANDING: "page_understanding",
  FEATURE_EXTRACTOR: "feature_extractor",
  CUSTOM: "custom"
});

export const ONNX_INFERENCE_RESULT_SHAPE = Object.freeze({
  ok: "boolean",
  outputs: "object",
  metadata: "object"
});

// --- Step 13: WebGPU Acceleration / Hardware-Aware Local Inference Contracts ---

export const WEBGPU_STATUS = Object.freeze({
  UNAVAILABLE: "UNAVAILABLE",
  AVAILABLE: "AVAILABLE",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const GPU_BACKEND_CAPABILITIES = Object.freeze({
  WEBGPU: "webgpu",
  WASM: "wasm",
  CPU: "cpu",
  MOCK_TEST: "mock_test"
});

export const GPU_EXECUTION_MODE = Object.freeze({
  AUTO: "AUTO",
  WEBGPU: "WEBGPU",
  FALLBACK: "FALLBACK"
});

export const GPU_DEVICE_INFO_SHAPE = Object.freeze({
  available: "boolean",
  status: "string",
  maxTextureDimension2D: "number",
  supportedFeatures: "array"
});

// --- Step 14: Browser-Agent Action System Contracts ---

export const ACTION_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  VALIDATING: "VALIDATING",
  EXECUTING: "EXECUTING",
  COMPLETED: "COMPLETED",
  DENIED: "DENIED",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const BROWSER_ACTION_TYPES = Object.freeze({
  CLICK: "CLICK",
  TYPE: "TYPE",
  FILL: "FILL",
  SELECT: "SELECT",
  SUBMIT: "SUBMIT",
  SCROLL: "SCROLL",
  NAVIGATE: "NAVIGATE",
  WAIT: "WAIT"
});

export const ACTION_RESULTS = Object.freeze({
  COMPLETED: "COMPLETED",
  DENIED_INVALID_ACTION: "DENIED_INVALID_ACTION",
  DENIED_INVALID_TARGET: "DENIED_INVALID_TARGET",
  DENIED_POLICY: "DENIED_POLICY",
  DENIED_UNAUTHORIZED: "DENIED_UNAUTHORIZED",
  DENIED_PURPOSE_MISMATCH: "DENIED_PURPOSE_MISMATCH",
  DENIED_SENSITIVE_VALUE: "DENIED_SENSITIVE_VALUE",
  DENIED_REMOTE_DESTINATION: "DENIED_REMOTE_DESTINATION",
  DENIED_TARGET_NOT_FOUND: "DENIED_TARGET_NOT_FOUND",
  DENIED_STALE_TARGET: "DENIED_STALE_TARGET",
  DENIED_UNSAFE_ACTION: "DENIED_UNSAFE_ACTION",
  ERROR: "ERROR"
});

export const ACTION_TARGET_TYPES = Object.freeze({
  TOKEN_REFERENCE: "TOKEN_REFERENCE",
  SEMANTIC_TARGET: "SEMANTIC_TARGET",
  DOM_ELEMENT: "DOM_ELEMENT",
  OCR_REGION: "OCR_REGION"
});

export const ACTION_REQUEST_SHAPE = Object.freeze({
  actionType: "string",
  target: "object",
  parameters: "object",
  purpose: "string",
  destination: "string",
  authorization: "object"
});

// --- Step 15: Backend + Remote Reasoning Contracts ---

export const REMOTE_REASONING_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const REASONING_PROVIDER_TYPES = Object.freeze({
  REAL_REMOTE: "REAL_REMOTE",
  MOCK_TEST: "MOCK_TEST"
});

export const REMOTE_REASONING_REQUEST_SHAPE = Object.freeze({
  protocolVersion: "string",
  taskIntent: "string",
  sanitizedPageState: "object",
  safeMetadata: "object"
});

export const REMOTE_REASONING_RESPONSE_SHAPE = Object.freeze({
  ok: "boolean",
  status: "string",
  recommendedActions: "array",
  reasoningSummary: "string",
  metadata: "object"
});

// --- Step 16: Secure Communication / End-to-End Remote Integration Contracts ---

export const SECURE_COMMUNICATION_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  READY: "READY",
  CONNECTING: "CONNECTING",
  TRANSMITTING: "TRANSMITTING",
  COMPLETED: "COMPLETED",
  DENIED: "DENIED",
  ERROR: "ERROR",
  DISPOSED: "DISPOSED"
});

export const SECURE_TRANSPORT_TYPES = Object.freeze({
  REAL_REMOTE_TRANSPORT: "REAL_REMOTE_TRANSPORT",
  MOCK_TEST_TRANSPORT: "MOCK_TEST_TRANSPORT"
});

export const SECURE_REQUEST_SHAPE = Object.freeze({
  correlationId: "string",
  timestamp: "number",
  sanitizedPayload: "object",
  metadata: "object"
});

export const SECURE_RESPONSE_SHAPE = Object.freeze({
  ok: "boolean",
  status: "string",
  recommendedActions: "array",
  metadata: "object"
});

export const AUTHENTICATION_STATUS = Object.freeze({
  UNAUTHENTICATED: "UNAUTHENTICATED",
  AUTHENTICATED: "AUTHENTICATED",
  EXPIRED: "EXPIRED",
  INVALID: "INVALID"
});

// --- Step 17: End-to-End Workflow + Evaluation + Benchmarking Contracts ---

export const E2E_WORKFLOW_STATUS = Object.freeze({
  UNINITIALIZED: "UNINITIALIZED",
  PERCEIVING: "PERCEIVING",
  SANITIZING: "SANITIZING",
  REASONING: "REASONING",
  VALIDATING: "VALIDATING",
  EXECUTING: "EXECUTING",
  COMPLETED: "COMPLETED",
  DENIED: "DENIED",
  ERROR: "ERROR"
});

export const SYSTEM_ENVIRONMENT_REPORT_SHAPE = Object.freeze({
  ocrProvider: "string",
  onnxProvider: "string",
  webgpuStatus: "string",
  mlProvider: "string",
  reasoningProvider: "string",
  transportProvider: "string",
  browserRuntime: "string"
});

export const BENCHMARK_METRICS_SHAPE = Object.freeze({
  perceptionMs: "number",
  detectionMs: "number",
  sanitizationMs: "number",
  transportMs: "number",
  reasoningMs: "number",
  actionExecutionMs: "number",
  totalEndToEndMs: "number",
  privacyViolations: "number"
});






