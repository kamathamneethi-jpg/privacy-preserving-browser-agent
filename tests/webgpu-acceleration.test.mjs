import { test } from "node:test";
import assert from "node:assert/strict";
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
  ONNX_INFERENCE_STATUS,
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

// --- 1. Export & Contract Verification ---

test("1. WebGPU contracts exist and adhere to immutability rules", () => {
  assert.equal(WEBGPU_STATUS.READY, "READY");
  assert.equal(WEBGPU_STATUS.UNAVAILABLE, "UNAVAILABLE");
  assert.equal(GPU_BACKEND_CAPABILITIES.WEBGPU, "webgpu");
  assert.equal(GPU_BACKEND_CAPABILITIES.WASM, "wasm");
  assert.equal(GPU_EXECUTION_MODE.AUTO, "AUTO");
  assert.equal(GPU_EXECUTION_MODE.FALLBACK, "FALLBACK");
  assert.equal(GPU_DEVICE_INFO_SHAPE.available, "boolean");
  assert.throws(() => { WEBGPU_STATUS.NEW_PROP = "test"; }, TypeError);
});

test("2. WebGPU configuration contains defaults, power preferences, and timeouts", () => {
  assert.equal(WEBGPU_VERSION, "1.0.0");
  assert.equal(WEBGPU_CONFIG.DEFAULT_MODE, GPU_EXECUTION_MODE.AUTO);
  assert.equal(WEBGPU_CONFIG.FALLBACK_PROVIDER, GPU_BACKEND_CAPABILITIES.WASM);
  assert.equal(WEBGPU_CONFIG.POWER_PREFERENCE, "default"); // Does not hardcode high-performance
  assert.equal(WEBGPU_CONFIG.INIT_TIMEOUT_MS, 3000);
  assert.equal(WEBGPU_CONFIG.MAX_WORKLOAD_ELEMENTS, 10000000);
  assert.equal(WEBGPU_CONFIG.SAFE_FALLBACK_ON_ERROR, true);
});

// --- 2. Manager Instantiation & Capability Detection ---

test("3. WebGpuManager instantiation and default lifecycle state", () => {
  const manager = new WebGpuManager();
  assert.equal(manager.getStatus(), WEBGPU_STATUS.UNINITIALIZED);
  assert.equal(manager.isAvailable(), false);
});

test("4. Unsupported environment (Node.js without WebGPU API) fails safely", async () => {
  const manager = new WebGpuManager();
  assert.equal(manager.detectSupport(), false);

  const initResult = await manager.initialize();
  assert.equal(initResult.ok, false);
  assert.equal(initResult.available, false);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.UNAVAILABLE);
});

test("5. Absence of navigator.gpu is handled safely without throwing exceptions", async () => {
  const manager = new WebGpuManager();
  const adapter = await manager.requestAdapter();
  assert.equal(adapter, null);
  assert.equal(manager.detectSupport(), false);
});


test("6. GPU Adapter acquisition failure is handled safely", async () => {
  const customGpuProvider = {
    requestAdapter: async () => null // simulate adapter rejection
  };
  const manager = new WebGpuManager({ customGpuProvider });
  const initResult = await manager.initialize();

  assert.equal(initResult.ok, false);
  assert.equal(initResult.available, false);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.UNAVAILABLE);
});

test("7. GPU Device acquisition failure is handled safely", async () => {
  const customGpuProvider = {
    requestAdapter: async () => ({
      requestDevice: async () => null // simulate device rejection
    })
  };
  const manager = new WebGpuManager({ customGpuProvider });
  const initResult = await manager.initialize();

  assert.equal(initResult.ok, false);
  assert.equal(initResult.available, false);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.UNAVAILABLE);
});

test("8. Successful mocked WebGPU initialization reaches READY status", async () => {
  const mockDevice = {
    limits: { maxTextureDimension2D: 16384 },
    features: ["texture-compression-bc"],
    destroy: () => {}
  };
  const customGpuProvider = {
    requestAdapter: async () => ({
      requestDevice: async () => mockDevice
    })
  };

  const manager = new WebGpuManager({ customGpuProvider });
  const initResult = await manager.initialize();

  assert.equal(initResult.ok, true);
  assert.equal(initResult.available, true);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.READY);
  assert.equal(manager.isAvailable(), true);
});

test("9. Capability metadata is strictly non-identifying (no vendor or renderer strings)", async () => {
  const mockDevice = {
    limits: { maxTextureDimension2D: 8192 },
    features: ["bgra8unorm-storage"],
    destroy: () => {}
  };
  const customGpuProvider = {
    requestAdapter: async () => ({
      requestDevice: async () => mockDevice
    })
  };

  const manager = new WebGpuManager({ customGpuProvider });
  await manager.initialize();

  const caps = manager.getCapabilities();
  assert.equal(caps.available, true);
  assert.equal(caps.maxTextureDimension2D, 8192);
  assert.ok(Array.isArray(caps.supportedFeatures));
  
  // Verify fingerprinting safety: No raw vendor/device info
  assert.equal("adapterName" in caps, false);
  assert.equal("vendor" in caps, false);
  assert.equal("architecture" in caps, false);
});

// --- 3. Two-Stage Hardware & ONNX Provider Validation ---

test("10. Two-Stage Validation: AUTO mode falls back to WASM when WebGPU browser API is unavailable", () => {
  const onnxAdapter = createOnnxRuntimeAdapter({
    executionMode: GPU_EXECUTION_MODE.AUTO
  });

  const res = onnxAdapter.infer({ data: [1.0, 2.0], shape: [1, 2], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
  assert.equal(res.metadata.executionProvider !== "webgpu", true);
});

test("11. Two-Stage Validation: AUTO mode falls back to WASM when ONNX WebGPU provider is incompatible", async () => {
  // Stage 1 passes (Mock WebGPU browser API ready)
  const mockDevice = { limits: {}, features: [], destroy: () => {} };
  const gpuManager = new WebGpuManager({
    customGpuProvider: { requestAdapter: async () => ({ requestDevice: async () => mockDevice }) }
  });
  await gpuManager.initialize();

  // Stage 2 fails (ONNX Runtime WebGPU provider incompatible / missing)
  const onnxAdapter = createOnnxRuntimeAdapter({
    executionMode: GPU_EXECUTION_MODE.AUTO,
    webGpuManager: gpuManager,
    onnxGpuProviderAvailable: false // Stage 2 failure
  });

  const res = onnxAdapter.infer({ data: [1.0, 2.0], shape: [1, 2], dataType: "float32" });
  assert.equal(res.ok, true);
  // Strict Invariant: Must fall back to WASM because Stage 2 failed!
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
});

test("12. Two-Stage Validation: WEBGPU provider reported ONLY when BOTH Stage 1 & Stage 2 pass", async () => {
  // Stage 1 passes
  const mockDevice = { limits: {}, features: [], destroy: () => {} };
  const gpuManager = new WebGpuManager({
    customGpuProvider: { requestAdapter: async () => ({ requestDevice: async () => mockDevice }) }
  });
  await gpuManager.initialize();

  // Stage 2 passes
  const onnxAdapter = createOnnxRuntimeAdapter({
    executionMode: GPU_EXECUTION_MODE.AUTO,
    webGpuManager: gpuManager,
    onnxGpuProviderAvailable: true // Both Stage 1 and Stage 2 pass
  });

  const res = onnxAdapter.infer({ data: [1.0, 2.0], shape: [1, 2], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WEBGPU);
});

test("13. Explicit WEBGPU mode falls back safely to WASM when WebGPU is unavailable", () => {
  const onnxAdapter = createOnnxRuntimeAdapter({
    executionMode: GPU_EXECUTION_MODE.WEBGPU,
    onnxGpuProviderAvailable: false
  });

  const res = onnxAdapter.infer({ data: [1.0], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  // Guarantee: No fake WEBGPU reporting
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
});

test("14. Explicit FALLBACK mode forces WASM provider execution", () => {
  const onnxAdapter = createOnnxRuntimeAdapter({
    executionMode: GPU_EXECUTION_MODE.FALLBACK,
    onnxGpuProviderAvailable: true
  });

  const res = onnxAdapter.infer({ data: [1.0], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
});

test("15. WASM provider remains fully functional", () => {
  const adapter = createOnnxRuntimeAdapter({ provider: ONNX_EXECUTION_PROVIDERS.WASM });
  const res = adapter.infer({ data: [0.5], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
});

test("16. CPU provider remains fully functional", () => {
  const adapter = createOnnxRuntimeAdapter({ provider: ONNX_EXECUTION_PROVIDERS.CPU });
  const res = adapter.infer({ data: [0.5], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.CPU);
});

test("17. Mock provider remains fully functional", () => {
  const adapter = createOnnxRuntimeAdapter({
    provider: ONNX_EXECUTION_PROVIDERS.MOCK_TEST,
    testProvider: () => ({ outputs: { mockRes: [1, 2, 3] } })
  });
  const res = adapter.infer({ data: [0.5], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.outputs.mockRes, [1, 2, 3]);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.MOCK_TEST);
});

// --- 4. Resource Safety & Lifecycle ---

test("18. Device loss handling transitions WebGpuManager status to ERROR", async () => {
  let lossCallback;
  const mockDevice = {
    limits: {},
    features: [],
    lost: new Promise((resolve) => { lossCallback = resolve; }),
    destroy: () => {}
  };
  const manager = new WebGpuManager({
    customGpuProvider: { requestAdapter: async () => ({ requestDevice: async () => mockDevice }) }
  });

  await manager.initialize();
  assert.equal(manager.isAvailable(), true);

  // Trigger device loss event
  lossCallback({ reason: "destroyed" });
  await new Promise((r) => setTimeout(r, 10)); // tick

  assert.equal(manager.getStatus(), WEBGPU_STATUS.ERROR);
  assert.equal(manager.isAvailable(), false);
});

test("19. dispose() releases GPU manager resources and state cleanly", async () => {
  let destroyed = false;
  const mockDevice = {
    limits: {},
    features: [],
    destroy: () => { destroyed = true; }
  };
  const manager = new WebGpuManager({
    customGpuProvider: { requestAdapter: async () => ({ requestDevice: async () => mockDevice }) }
  });

  await manager.initialize();
  assert.equal(manager.isAvailable(), true);

  const disposeRes = manager.dispose();
  assert.equal(disposeRes.ok, true);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.DISPOSED);
  assert.equal(manager.isAvailable(), false);
  assert.equal(destroyed, true);
});

test("20. Re-initialization after disposal is safe", async () => {
  const mockDevice = { limits: {}, features: [], destroy: () => {} };
  const manager = new WebGpuManager({
    customGpuProvider: { requestAdapter: async () => ({ requestDevice: async () => mockDevice }) }
  });

  await manager.initialize();
  manager.dispose();
  assert.equal(manager.getStatus(), WEBGPU_STATUS.DISPOSED);

  const reinitRes = await manager.initialize();
  assert.equal(reinitRes.ok, true);
  assert.equal(manager.getStatus(), WEBGPU_STATUS.READY);
});

// --- 5. Privacy, Zero Network & Non-Hardcoding ---

test("21. Static inspection: WebGpuManager source contains zero network APIs", async () => {
  const src = await readFile(resolve("packages/privacy-core/src/webgpu-manager.js"), "utf8");
  const forbiddenApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
  for (const api of forbiddenApis) {
    assert.equal(src.includes(api), false, `Source code must not contain network API '${api}'.`);
  }
});

test("22. Runtime network interception: WebGPU operations initiate zero network calls", async () => {
  let networkAttempted = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkAttempted = true;
    throw new Error("Forbidden network call!");
  };

  try {
    const manager = new WebGpuManager();
    await manager.initialize();
    manager.getCapabilities();
    manager.dispose();
    assert.equal(networkAttempted, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("23. Zero raw PII in WebGPU capability metadata or error logs", async () => {
  const manager = new WebGpuManager();
  await manager.initialize();
  const capsString = JSON.stringify(manager.getCapabilities());

  assert.equal(capsString.includes("password"), false);
  assert.equal(capsString.includes("creditCard"), false);
  assert.equal(capsString.includes("email"), false);
});

test("24. Dynamic Operation: No hardcoded GPU, vendor, or browser string assumptions", () => {
  const manager = new WebGpuManager();
  const caps = manager.getCapabilities();

  // Verify generic limits without vendor-specific branching
  assert.ok(typeof caps.maxTextureDimension2D === "number");
  assert.ok(Array.isArray(caps.supportedFeatures));
});

// --- 6. Step 10 & 11 Integration & Backward Compatibility ---

test("25. Step 10 VisualModelAdapter operates smoothly with hardware-aware ONNX adapter", () => {
  const visualAdapter = createVisualModelAdapter();
  const onnxAdapter = createOnnxRuntimeAdapter({ executionMode: GPU_EXECUTION_MODE.AUTO });

  visualAdapter.attachOnnxRuntime(onnxAdapter);
  const initRes = visualAdapter.initialize({ backend: VISUAL_BACKENDS.ONNX_WEB });

  assert.equal(initRes.ok, true);
  assert.equal(visualAdapter.onnxAdapter.isReady(), true);
});

test("26. Step 11 SanitizedContextBuilder remains 100% intact", () => {
  const payload = buildSanitizedReasoningPayload({
    domTree: { tagName: "body", children: [] }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.payload.status, "SANITIZED");
});

test("27. Steps 1-9 Privacy Engine & Vault operations remain fully backward compatible", () => {
  const policy = evaluatePiiPolicyItem({
    piiItem: { id: "P1", category: "password", confidence: 0.95 },
    relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(policy.action, POLICY_ACTIONS.LOCAL_ONLY);

  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "GpuPass123!", purpose: VAULT_PURPOSES.LOGIN });
  const retrieved = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.secretValue, "GpuPass123!");
});

test("28. Step 12 ONNX Runtime test suite compatibility remains intact", () => {
  const onnxAdapter = createOnnxRuntimeAdapter();
  assert.equal(onnxAdapter.getState(), ONNX_INFERENCE_STATUS.READY);
  onnxAdapter.dispose();
  assert.equal(onnxAdapter.getState(), ONNX_INFERENCE_STATUS.DISPOSED);
});
