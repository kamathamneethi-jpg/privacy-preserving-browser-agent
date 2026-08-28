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
  SANITIZED_PAYLOAD_SHAPE
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
