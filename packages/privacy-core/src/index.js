export { PrivacyDecision, decidePrivacyPolicy } from "./policy.js";
export { PiiCategory, scanTextForPii, summarizeSensitiveCategories, findPiiMatches, processOcrResult, reconstructOcrFragments, detectPiiMultiSignal } from "./detection.js";
export { createLocalizedPiiItem, sanitizeLocalizedItems, generatePiiId } from "./localization.js";
export { analyzeDomElementSemantics } from "./dom-semantics.js";
export { fuseDetectedPiiItems, areBoundingBoxesOverlapping } from "./fusion.js";
export { DETECTION_CONFIG, EVIDENCE_GROUPS, calculateMultiSignalConfidence } from "./config.js";
export { analyzeTaskIntent, evaluatePiiTaskRelevance } from "./context-analyzer.js";
export {
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  CONTEXT_EVIDENCE_CODES,
  SENSITIVITY_LEVELS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  VAULT_ENTRY_STATES,
  VAULT_PURPOSES,
  VAULT_ACCESS_RESULTS,
  VAULT_METADATA_SHAPE,
  VISUAL_PERCEPTION_STATUS,
  VISUAL_BACKENDS,
  OCR_BLOCK_SHAPE,
  SANITIZED_CONTEXT_STATUS,
  TOKEN_TYPES,
  SANITIZED_PAYLOAD_SHAPE,
  ONNX_INFERENCE_STATUS,
  ONNX_EXECUTION_PROVIDERS,
  ONNX_MODEL_TYPES,
  ONNX_INFERENCE_RESULT_SHAPE,
  WEBGPU_STATUS,
  GPU_BACKEND_CAPABILITIES,
  GPU_EXECUTION_MODE,
  GPU_DEVICE_INFO_SHAPE,
  ACTION_STATUS,
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  ACTION_TARGET_TYPES,
  ACTION_REQUEST_SHAPE,
  SECURE_COMMUNICATION_STATUS,
  SECURE_TRANSPORT_TYPES,
  SECURE_REQUEST_SHAPE,
  SECURE_RESPONSE_SHAPE,
  AUTHENTICATION_STATUS,
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  E2E_WORKFLOW_STATUS,
  SYSTEM_ENVIRONMENT_REPORT_SHAPE,
  BENCHMARK_METRICS_SHAPE
} from "../../shared-types/src/privacy-contracts.js";
export { POLICY_VERSION, CATEGORY_SENSITIVITY_MAP, POLICY_CONFIG } from "./policy-config.js";
export { evaluatePiiPolicyItem, evaluateBatchPrivacyPolicy, sanitizeRemotePayload, generateOpaqueToken, generatePiiToken } from "./policy-engine.js";
export { VAULT_VERSION, VAULT_CONFIG } from "./vault-config.js";
export {
  createLocalPrivacyVault,
  privacyVault,
  storeSecret,
  retrieveSecret,
  hasSecret,
  getVaultMetadata,
  listVaultMetadata,
  revokeSecret,
  expireSecret,
  clearVault,
  cleanupExpiredEntries
} from "./privacy-vault.js";
export { VISUAL_MODEL_VERSION, VISUAL_CONFIG } from "./visual-config.js";
export {
  VisualModelAdapter,
  createVisualModelAdapter,
  visualModelAdapter,
  initializeVisualModel,
  recognizeVisualText,
  processVisualPii,
  disposeVisualModel
} from "./visual-model-adapter.js";
export { CONTEXT_BUILDER_VERSION, SANITIZER_CONFIG } from "./sanitizer-config.js";
export {
  SanitizedContextBuilder,
  createSanitizedContextBuilder,
  sanitizedContextBuilder,
  buildSanitizedContext,
  buildSanitizedReasoningPayload,
  sanitizePageRepresentation,
  sanitizeDomTree,
  sanitizeDomSubtree,
  sanitizeVisualBlocks,
  validateSanitizedPayload
} from "./sanitized-context-builder.js";
export { ONNX_RUNTIME_VERSION, ONNX_CONFIG } from "./onnx-config.js";
export {
  OnnxRuntimeAdapter,
  createOnnxRuntimeAdapter,
  onnxRuntimeAdapter,
  initializeOnnxRuntime,
  runLocalInference,
  disposeOnnxRuntime,
  validateTensorShape,
  calculateTensorElementCount
} from "./onnx-runtime-adapter.js";
export { WEBGPU_VERSION, WEBGPU_CONFIG } from "./webgpu-config.js";
export {
  WebGpuManager,
  createWebGpuManager,
  webGpuManager
} from "./webgpu-manager.js";
export { ACTION_SYSTEM_VERSION, ACTION_CONFIG } from "./action-config.js";
export {
  BrowserActionEngine,
  createBrowserActionEngine,
  browserActionEngine,
  validateNavigationProtocol
} from "./browser-action-engine.js";
export { SECURE_COMM_VERSION, SECURE_COMM_CONFIG } from "./secure-communication-config.js";
export {
  AuthenticationProvider,
  createAuthenticationProvider,
  authenticationProvider
} from "./authentication-provider.js";
export {
  SecureCommunicationClient,
  MockTestTransport,
  createSecureCommunicationClient,
  secureCommunicationClient
} from "./secure-communication-client.js";
export {
  BrowserAgentCoordinator,
  createBrowserAgentCoordinator,
  browserAgentCoordinator
} from "./browser-agent-coordinator.js";
export {
  BenchmarkUtility,
  createBenchmarkUtility
} from "./benchmark-utility.js";
export {
  EnvironmentReporter,
  createEnvironmentReporter,
  environmentReporter
} from "./environment-reporter.js";
export {
  SecurityAuditUtility,
  createSecurityAuditUtility
} from "./security-audit-utility.js";





