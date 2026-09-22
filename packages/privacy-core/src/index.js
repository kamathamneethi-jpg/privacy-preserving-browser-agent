export { PrivacyDecision, decidePrivacyPolicy } from "./policy.js";
export { PiiCategory, scanTextForPii, summarizeSensitiveCategories, findPiiMatches, processOcrResult, reconstructOcrFragments, detectPiiMultiSignal } from "./detection.js";
export {
  createLocalizedPiiItem,
  sanitizeLocalizedItems,
  generatePiiId,
  transformViewportToBitmap,
  transformPageToBitmap,
  transformYoloToBitmap,
  transformBitmapToViewport
} from "./localization.js";
export { analyzeDomElementSemantics } from "./dom-semantics.js";
export { fuseDetectedPiiItems, areBoundingBoxesOverlapping } from "./fusion.js";
export { DETECTION_CONFIG, EVIDENCE_GROUPS, calculateMultiSignalConfidence } from "./config.js";
export { analyzeTaskIntent, evaluatePiiTaskRelevance, inferSemanticRole, determineTaskNecessity } from "./context-analyzer.js";
export {
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  TASK_NECESSITY_LEVELS,
  SEMANTIC_ROLES,
  CONTEXT_EVIDENCE_CODES,
  SENSITIVITY_LEVELS,
  SECURITY_LEVELS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  POLICY_REASON_CODES,
  TASK_AWARE_POLICY_REASON_CODES,
  TASK_AWARE_POLICY_DECISION_SHAPE,
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
export { POLICY_VERSION, CATEGORY_SENSITIVITY_MAP, PUBLIC_SAFE_CATEGORIES, DEFAULT_CATEGORY_ROLES, POLICY_CONFIG } from "./policy-config.js";
export { evaluatePiiPolicyItem, evaluateBatchPrivacyPolicy, sanitizeRemotePayload, generateOpaqueToken, generatePiiToken } from "./policy-engine.js";
export { VAULT_VERSION, VAULT_CONFIG } from "./vault-config.js";
export {
  createLocalPrivacyVault,
  privacyVault,
  storeSecret,
  retrieveSecret,
  storeSecretWithToken,
  retrieveSecretByToken,
  registerToken,
  getVaultIdForToken,
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
  DomDriver,
  createDomDriver,
  domDriver,
  resolveDomElement
} from "./dom-driver.js";
export {
  InteractiveElementRegistry,
  createInteractiveElementRegistry,
  interactiveElementRegistry
} from "./interactive-element-registry.js";
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
  OpenRouterTransport,
  GroqTransport,
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
export {
  extractDomTextNodes,
  generateDomNodeId
} from "./dom-extractor.js";
export {
  GLINER_MODEL_METADATA,
  GLINER_TARGET_LABELS,
  GLINER_TAXONOMY_MAP,
  GLINER_CONFIG
} from "./gliner-config.js";
export {
  GlinerAdapter,
  glinerAdapter
} from "./gliner-adapter.js";
export {
  HybridPiiDetector,
  hybridPiiDetector
} from "./hybrid-pii-detector.js";
export {
  redactTextString,
  redactDomNodes
} from "./dom-redactor.js";
export {
  YoloDetector,
  yoloDetector,
  YOLO_TARGET_CLASSES,
  YOLO_CONFIG
} from "./yolo-detector.js";
export {
  redactImageRegions,
  redactImageLocally,
  isBboxCompletelyCovered,
  evaluateImagePiiPolicy,
  REDACTION_STYLES
} from "./image-redactor.js";
export {
  ImageOCR,
  recognizeImageText,
  normalizeBoundingBox,
  normalizeConfidence
} from "./image-ocr.js";

export {
  GoalParser,
  CONSTRAINT_OPERATORS,
  BROWSER_OPERATIONS,
  TASK_DOMAINS,
  CANDIDATE_ROLES
} from "./goal-parser.js";

export {
  TaskPlanner,
  TASK_STATUS
} from "./task-planner.js";

export {
  ExecutionStateManager
} from "./execution-state-manager.js";

export {
  DynamicReplanner
} from "./dynamic-replanner.js";

export {
  GoalCompletionChecker
} from "./goal-checker.js";

export {
  MultimodalVisionAgent,
  DEFAULT_MULTIMODAL_MODEL,
  HUGGINGFACE_DEFAULT_MODEL,
  OPENROUTER_DEFAULT_MODEL
} from "./multimodal-vision-agent.js";

export {
  sanitizeTelemetryString,
  sanitizeTelemetryTask,
  sanitizeTelemetryError,
  createSafePrivacyDecisionTelemetry,
  sanitizeTelemetryData,
  assertNoTelemetryLeaks
} from "./telemetry-sanitizer.js";

export {
  VISUALIZATION_COLORS,
  formatReviewerDecisionBadge,
  evaluateMixedContentDemo,
  assertCrossRepresentationConsistency
} from "./reviewer-transparency-engine.js";


