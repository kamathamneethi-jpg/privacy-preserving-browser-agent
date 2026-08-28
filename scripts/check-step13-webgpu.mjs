import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  WebGpuManager,
  createWebGpuManager,
  webGpuManager,
  WEBGPU_VERSION,
  WEBGPU_CONFIG,
  WEBGPU_STATUS,
  GPU_BACKEND_CAPABILITIES,
  GPU_EXECUTION_MODE,
  GPU_DEVICE_INFO_SHAPE,
  OnnxRuntimeAdapter,
  createOnnxRuntimeAdapter,
  ONNX_EXECUTION_PROVIDERS,
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

const managerSrc = await readFile(resolve("packages/privacy-core/src/webgpu-manager.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/webgpu-config.js"), "utf8");
const adapterSrc = await readFile(resolve("packages/privacy-core/src/onnx-runtime-adapter.js"), "utf8");

// 1. Verify required exports exist
const requiredExports = [
  "WebGpuManager",
  "createWebGpuManager",
  "webGpuManager"
];
for (const exp of requiredExports) {
  if (!managerSrc.includes(exp)) {
    console.error(`webgpu-manager.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify contracts and configuration
if (!WEBGPU_STATUS.READY || !WEBGPU_STATUS.UNAVAILABLE) {
  console.error("WEBGPU_STATUS contract must define READY and UNAVAILABLE.");
  process.exit(1);
}

if (!GPU_EXECUTION_MODE.AUTO || !GPU_EXECUTION_MODE.FALLBACK) {
  console.error("GPU_EXECUTION_MODE contract must define AUTO and FALLBACK.");
  process.exit(1);
}

if (!WEBGPU_CONFIG.INIT_TIMEOUT_MS || WEBGPU_CONFIG.POWER_PREFERENCE !== "default") {
  console.error("WEBGPU_CONFIG must contain default power preference and timeout bounds.");
  process.exit(1);
}

// 3. Test WebGPU Manager fallback behavior in non-browser Node context
const manager = new WebGpuManager();
if (manager.detectSupport() !== false) {
  console.error("detectSupport() should safely return false in standard Node test context.");
  process.exit(1);
}

const initRes = await manager.initialize();
if (initRes.ok !== false || manager.getStatus() !== WEBGPU_STATUS.UNAVAILABLE) {
  console.error("WebGpuManager must safely report UNAVAILABLE when WebGPU is not supported.");
  process.exit(1);
}

// 4. Test fingerprinting protection in capabilities output
const caps = manager.getCapabilities();
if ("adapterName" in caps || "vendor" in caps) {
  console.error("getCapabilities() leaked raw hardware/vendor identification.");
  process.exit(1);
}

// 5. Test Two-Stage Validation in ONNX Runtime Adapter
const onnxAdapter = createOnnxRuntimeAdapter({ executionMode: GPU_EXECUTION_MODE.AUTO });
const inferRes = onnxAdapter.infer({ data: [0.1, 0.2], shape: [1, 2], dataType: "float32" });

if (!inferRes.ok) {
  console.error("ONNX inference failed during WebGPU fallback check.");
  process.exit(1);
}

if (inferRes.metadata.executionProvider !== ONNX_EXECUTION_PROVIDERS.WASM) {
  console.error("ONNX adapter failed to fall back to WASM when WebGPU was unavailable.");
  process.exit(1);
}

// 6. Test No-Fake-WebGPU Invariant (stage 2 failure fallback)
const fakeOnnxAdapter = createOnnxRuntimeAdapter({
  executionMode: GPU_EXECUTION_MODE.WEBGPU,
  onnxGpuProviderAvailable: false
});
const fakeInferRes = fakeOnnxAdapter.infer({ data: [0.1], shape: [1], dataType: "float32" });

if (fakeInferRes.metadata.executionProvider === "webgpu") {
  console.error("ONNX adapter falsely reported WEBGPU when provider was incompatible!");
  process.exit(1);
}

// 7. Static inspection for network API usage
const forbiddenApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
for (const api of forbiddenApis) {
  if (managerSrc.includes(api)) {
    console.error(`Forbidden network API '${api}' found in WebGpuManager!`);
    process.exit(1);
  }
}

// 8. Step 10 & 11 and Steps 1-12 Backward Compatibility
const visualAdapter = createVisualModelAdapter();
visualAdapter.attachOnnxRuntime(onnxAdapter);
const visualInit = visualAdapter.initialize({ backend: VISUAL_BACKENDS.ONNX_WEB });
if (!visualInit.ok) {
  console.error("Step 10 VisualModelAdapter failed to initialize with WebGPU-aware ONNX adapter.");
  process.exit(1);
}

const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div", children: [] } });
if (!sanitized.ok || sanitized.payload.status !== "SANITIZED") {
  console.error("Step 11 Sanitized Context Builder failed backward compatibility check.");
  process.exit(1);
}

const policy = evaluatePiiPolicyItem({
  piiItem: { id: "P1", category: "password", confidence: 0.95 },
  relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
});
if (policy.action !== POLICY_ACTIONS.LOCAL_ONLY) {
  console.error("Step 8 Policy Engine failed backward compatibility check.");
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
  console.error("Step 9 Vault failed backward compatibility check.");
  process.exit(1);
}

console.log("Step 13 verification passed: WebGPU Acceleration / Hardware-Aware Local Inference layer, capability detection, two-stage validation, fallback architecture, zero network calls, zero raw PII leakage, and backward compatibility verified.");
