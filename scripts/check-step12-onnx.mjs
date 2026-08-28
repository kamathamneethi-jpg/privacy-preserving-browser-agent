import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  OnnxRuntimeAdapter,
  createOnnxRuntimeAdapter,
  onnxRuntimeAdapter,
  initializeOnnxRuntime,
  runLocalInference,
  disposeOnnxRuntime,
  validateTensorShape,
  calculateTensorElementCount,
  ONNX_RUNTIME_VERSION,
  ONNX_CONFIG,
  ONNX_INFERENCE_STATUS,
  ONNX_EXECUTION_PROVIDERS,
  ONNX_MODEL_TYPES,
  ONNX_INFERENCE_RESULT_SHAPE,
  VisualModelAdapter,
  createVisualModelAdapter,
  VISUAL_BACKENDS,
  buildSanitizedReasoningPayload,
  evaluatePiiPolicyItem,
  storeSecret,
  retrieveSecret,
  clearVault,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  VAULT_PURPOSES
} from "../packages/privacy-core/src/index.js";

const adapterSrc = await readFile(resolve("packages/privacy-core/src/onnx-runtime-adapter.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/onnx-config.js"), "utf8");
const contractsSrc = await readFile(resolve("packages/shared-types/src/privacy-contracts.js"), "utf8");

// 1. Verify exports exist
const requiredExports = [
  "OnnxRuntimeAdapter",
  "createOnnxRuntimeAdapter",
  "onnxRuntimeAdapter",
  "initializeOnnxRuntime",
  "runLocalInference",
  "disposeOnnxRuntime",
  "validateTensorShape",
  "calculateTensorElementCount"
];
for (const exp of requiredExports) {
  if (!adapterSrc.includes(exp)) {
    console.error(`onnx-runtime-adapter.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify contracts and configuration
if (!ONNX_INFERENCE_STATUS.READY || !ONNX_INFERENCE_STATUS.DISPOSED) {
  console.error("ONNX inference status must define READY and DISPOSED.");
  process.exit(1);
}

if (!ONNX_EXECUTION_PROVIDERS.WASM || !ONNX_EXECUTION_PROVIDERS.WEBGPU) {
  console.error("ONNX execution providers must define WASM and WEBGPU.");
  process.exit(1);
}

if (!ONNX_CONFIG.INFERENCE_TIMEOUT_MS || ONNX_CONFIG.MAX_TENSOR_ELEMENTS !== 5000000) {
  console.error("ONNX configuration is invalid or missing defaults.");
  process.exit(1);
}

// 3. Test local inference lifecycle
initializeOnnxRuntime({ provider: ONNX_EXECUTION_PROVIDERS.WASM });
const inferResult = runLocalInference({
  data: [0.1, 0.2, 0.3, 0.4],
  shape: [1, 4],
  dataType: "float32"
});

if (!inferResult.ok || !inferResult.outputs) {
  console.error("Local ONNX inference failed.");
  process.exit(1);
}

if (inferResult.metadata.provider !== ONNX_EXECUTION_PROVIDERS.WASM || !inferResult.metadata.onDevice) {
  console.error("ONNX metadata is invalid or missing onDevice tag.");
  process.exit(1);
}

// 4. Test tensor shape & element count validators
if (!validateTensorShape([1, 3, 224, 224]) || calculateTensorElementCount([1, 3, 224, 224]) !== 150528) {
  console.error("Tensor shape or element count validation failed.");
  process.exit(1);
}

// 5. Static inspection: Verify zero network calls in adapter implementation
const forbiddenNetworkApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
for (const api of forbiddenNetworkApis) {
  if (adapterSrc.includes(api)) {
    console.error(`Forbidden network API '${api}' found in local ONNX adapter implementation!`);
    process.exit(1);
  }
}

// 6. Runtime network interception test
let networkTriggered = false;
const origFetch = globalThis.fetch;
globalThis.fetch = () => {
  networkTriggered = true;
  throw new Error("Network call prohibited!");
};
try {
  runLocalInference({ data: [1.0], shape: [1], dataType: "float32" });
  if (networkTriggered) {
    console.error("Runtime network call was initiated during local ONNX inference!");
    process.exit(1);
  }
} finally {
  globalThis.fetch = origFetch;
}

// 7. Test fail-closed error handling for uninitialized/disposed runtime
const customAdapter = new OnnxRuntimeAdapter();
if (customAdapter.isReady()) {
  console.error("Adapter should not be ready before initialization.");
  process.exit(1);
}
customAdapter.initialize();
if (!customAdapter.isReady()) {
  console.error("Adapter failed to reach READY state.");
  process.exit(1);
}
customAdapter.dispose();
if (customAdapter.isReady() || customAdapter.getState() !== ONNX_INFERENCE_STATUS.DISPOSED) {
  console.error("Adapter failed to dispose properly.");
  process.exit(1);
}

// 8. Test Step 10 Visual Model Adapter integration
const visualAdapter = createVisualModelAdapter();
visualAdapter.attachOnnxRuntime(onnxRuntimeAdapter);
const visualInit = visualAdapter.initialize({ backend: VISUAL_BACKENDS.ONNX_WEB });
if (!visualInit.ok || visualInit.backend !== VISUAL_BACKENDS.ONNX_WEB) {
  console.error("Step 10 VisualModelAdapter failed to integrate with ONNX_WEB backend.");
  process.exit(1);
}

// 9. Step 11 & Steps 1-9 Backward Compatibility Verification
const sanitized = buildSanitizedReasoningPayload({
  domTree: { tagName: "div", children: [] }
});
if (!sanitized.ok || sanitized.payload.status !== "SANITIZED") {
  console.error("Step 11 Sanitized Context Builder failed backward compatibility.");
  process.exit(1);
}

const policy = evaluatePiiPolicyItem({
  piiItem: { id: "P1", category: "password", confidence: 0.95 },
  relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
});
if (policy.action !== POLICY_ACTIONS.LOCAL_ONLY) {
  console.error("Step 8 Policy Engine failed backward compatibility.");
  process.exit(1);
}

clearVault();
const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });
const retrieved = retrieveSecret({
  vaultId: stored.vaultId,
  purpose: VAULT_PURPOSES.LOGIN,
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  authorization: { authorizationGranted: true }
});
if (!retrieved.ok || retrieved.secretValue !== "Pass123!") {
  console.error("Step 9 Vault failed backward compatibility.");
  process.exit(1);
}

console.log("Step 12 verification passed: ONNX Runtime Web / Local ML Inference layer, contracts, tensor validation, lifecycle, zero network transmission, Step 10/11 integration, and backward compatibility verified.");
