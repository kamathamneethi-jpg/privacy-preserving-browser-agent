import { test } from "node:test";
import assert from "node:assert/strict";
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
  VISUAL_PERCEPTION_STATUS,
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

test("1. ONNX contracts exist and adhere to immutability rules", () => {
  assert.equal(ONNX_INFERENCE_STATUS.READY, "READY");
  assert.equal(ONNX_INFERENCE_STATUS.DISPOSED, "DISPOSED");
  assert.equal(ONNX_EXECUTION_PROVIDERS.WASM, "wasm");
  assert.equal(ONNX_EXECUTION_PROVIDERS.WEBGPU, "webgpu");
  assert.equal(ONNX_EXECUTION_PROVIDERS.MOCK_TEST, "mock_test");
  assert.equal(ONNX_MODEL_TYPES.FEATURE_EXTRACTOR, "feature_extractor");
  assert.equal(ONNX_INFERENCE_RESULT_SHAPE.ok, "boolean");
  assert.throws(() => { ONNX_INFERENCE_STATUS.NEW_PROP = "test"; }, TypeError);
});

test("2. ONNX configuration contains defaults, bounds, and timeouts", () => {
  assert.equal(ONNX_RUNTIME_VERSION, "1.0.0");
  assert.equal(ONNX_CONFIG.DEFAULT_PROVIDER, ONNX_EXECUTION_PROVIDERS.WASM);
  assert.equal(ONNX_CONFIG.INFERENCE_TIMEOUT_MS, 5000);
  assert.equal(ONNX_CONFIG.MAX_TENSOR_ELEMENTS, 5000000);
  assert.equal(ONNX_CONFIG.MAX_MODEL_SIZE_BYTES, 104857600);
  assert.ok(ONNX_CONFIG.SUPPORTED_PROVIDERS.includes(ONNX_EXECUTION_PROVIDERS.WEBGPU));
  assert.ok(ONNX_CONFIG.SUPPORTED_DATA_TYPES.includes("float32"));
});

// --- 2. Adapter Instantiation & Lifecycle ---

test("3. Adapter instantiation and default lifecycle state", () => {
  const adapter = new OnnxRuntimeAdapter();
  assert.equal(adapter.getState(), ONNX_INFERENCE_STATUS.UNINITIALIZED);
  assert.equal(adapter.isReady(), false);
});

test("4. Initialization lifecycle: UNINITIALIZED -> READY", () => {
  const adapter = new OnnxRuntimeAdapter();
  const initResult = adapter.initialize({ provider: ONNX_EXECUTION_PROVIDERS.WASM });
  assert.equal(initResult.ok, true);
  assert.equal(initResult.state, ONNX_INFERENCE_STATUS.READY);
  assert.equal(adapter.isReady(), true);
});

test("5. Valid model loading: READY -> loadModel() -> READY", () => {
  const adapter = createOnnxRuntimeAdapter();
  const loadResult = adapter.loadModel({
    name: "local_pii_classifier",
    modelType: ONNX_MODEL_TYPES.VISUAL_CLASSIFIER,
    inputShape: [1, 3, 224, 224]
  });

  assert.equal(loadResult.ok, true);
  assert.equal(loadResult.modelType, ONNX_MODEL_TYPES.VISUAL_CLASSIFIER);
  assert.equal(adapter.isReady(), true);
});

test("6. Invalid model configuration fails safely without crashing", () => {
  const adapter = createOnnxRuntimeAdapter();
  
  // Model size exceeding limits
  const oversizedResult = adapter.loadModel({
    buffer: { byteLength: 200000000 } // 200MB > 100MB
  });
  assert.equal(oversizedResult.ok, false);
  assert.match(oversizedResult.error, /exceeds maximum allowable size/);

  // Invalid non-object model
  const nullResult = adapter.loadModel(null);
  assert.equal(nullResult.ok, false);
});

// --- 3. Input & Tensor Shape Validation ---

test("7. validateTensorShape accurately validates dimension arrays", () => {
  assert.equal(validateTensorShape([1, 3, 224, 224]), true);
  assert.equal(validateTensorShape([1]), true);
  assert.equal(validateTensorShape([]), false);
  assert.equal(validateTensorShape([-1, 3]), false);
  assert.equal(validateTensorShape([1, 2.5]), false);
  assert.equal(validateTensorShape("invalid"), false);
});

test("8. calculateTensorElementCount accurately multiplies dimensions", () => {
  assert.equal(calculateTensorElementCount([1, 3, 224, 224]), 150528);
  assert.equal(calculateTensorElementCount([2, 5]), 10);
  assert.equal(calculateTensorElementCount([-1]), 0);
});

test("9. Input tensor validation checks data length, data type, and bounds", () => {
  const adapter = createOnnxRuntimeAdapter();

  // Valid tensor
  const validTensor = {
    data: new Float32Array([1.0, 2.0, 3.0, 4.0]),
    shape: [2, 2],
    dataType: "float32"
  };
  const validCheck = adapter.validateInputTensor(validTensor);
  assert.equal(validCheck.ok, true);
  assert.equal(validCheck.elementCount, 4);

  // Data length mismatch
  const mismatchTensor = {
    data: [1.0, 2.0],
    shape: [2, 2],
    dataType: "float32"
  };
  const mismatchCheck = adapter.validateInputTensor(mismatchTensor);
  assert.equal(mismatchCheck.ok, false);
  assert.match(mismatchCheck.error, /does not match shape product/);

  // Unsupported data type
  const badTypeTensor = {
    data: [1, 2],
    shape: [2],
    dataType: "complex128"
  };
  const badTypeCheck = adapter.validateInputTensor(badTypeTensor);
  assert.equal(badTypeCheck.ok, false);
  assert.match(badTypeCheck.error, /Unsupported tensor data type/);
});

// --- 4. Local Inference Lifecycle & Fail-Closed Safety ---

test("10. Local inference produces structured, safe outputs and metadata", () => {
  const adapter = createOnnxRuntimeAdapter({
    testProvider: (input) => ({ outputs: { featureVector: [0.12, 0.45, 0.89] } })
  });

  const tensorInput = {
    data: [0.5, 0.8],
    shape: [1, 2],
    dataType: "float32"
  };

  const result = adapter.infer(tensorInput);
  assert.equal(result.ok, true);
  assert.deepEqual(result.outputs.featureVector, [0.12, 0.45, 0.89]);
  assert.equal(result.metadata.onDevice, true);
  assert.equal(result.metadata.provider, ONNX_EXECUTION_PROVIDERS.WASM);
  assert.ok(typeof result.metadata.latencyMs === "number");
});

test("11. Uninitialized inference call is rejected safely", () => {
  const adapter = new OnnxRuntimeAdapter();
  const result = adapter.infer({ data: [1], shape: [1], dataType: "float32" });
  assert.equal(result.ok, false);
  assert.match(result.error, /UNINITIALIZED/);
});

test("12. Disposed adapter rejects inference and model load calls safely", () => {
  const adapter = createOnnxRuntimeAdapter();
  adapter.dispose();

  assert.equal(adapter.getState(), ONNX_INFERENCE_STATUS.DISPOSED);
  assert.equal(adapter.isReady(), false);

  const inferResult = adapter.infer({ data: [1], shape: [1], dataType: "float32" });
  assert.equal(inferResult.ok, false);
  assert.match(inferResult.error, /Inference cannot be executed/);

  const loadResult = adapter.loadModel({ name: "test" });
  assert.equal(loadResult.ok, false);
  assert.match(loadResult.error, /Cannot load model while adapter is in 'DISPOSED' state/);
});

test("13. Oversized tensor input exceeding max element cap is rejected safely", () => {
  const adapter = createOnnxRuntimeAdapter({ MAX_TENSOR_ELEMENTS: 10 });
  const oversizedTensor = {
    data: new Array(100).fill(1.0),
    shape: [10, 10],
    dataType: "float32"
  };

  const result = adapter.infer(oversizedTensor);
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds max allowable limit/);
});

test("14. Timeout limit violation returns safe error", () => {
  const adapter = createOnnxRuntimeAdapter({
    INFERENCE_TIMEOUT_MS: 10,
    sessionRunner: () => {
      // Simulate blocking latency
      const start = Date.now();
      while (Date.now() - start < 20) {}
      return { outputs: {} };
    }
  });

  const result = adapter.infer({ data: [1], shape: [1], dataType: "float32" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Inference execution timed out/);
});

// --- 5. Privacy & Network Security Invariants ---

test("15. Static inspection: OnnxRuntimeAdapter source contains zero network APIs", async () => {
  const src = await readFile(resolve("packages/privacy-core/src/onnx-runtime-adapter.js"), "utf8");
  const forbiddenApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
  for (const api of forbiddenApis) {
    assert.equal(src.includes(api), false, `Source code must not contain network API '${api}'.`);
  }
});

test("16. Runtime network interception: Inference attempts zero network calls", () => {
  // Mock global network boundary
  let networkAttempted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkAttempted = true;
    throw new Error("Network calls forbidden during local ONNX inference!");
  };

  try {
    const adapter = createOnnxRuntimeAdapter();
    adapter.infer({ data: [1.0, 2.0], shape: [1, 2], dataType: "float32" });
    assert.equal(networkAttempted, false, "Local ONNX inference must not initiate fetch.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("17. Zero raw PII in inference metadata or error outputs", () => {
  const adapter = createOnnxRuntimeAdapter({
    testProvider: () => ({ outputs: { res: "sensitive_user_secret_12345" } })
  });

  const res = adapter.infer({ data: [1], shape: [1], dataType: "float32" });
  const metadataString = JSON.stringify(res.metadata);

  assert.equal(metadataString.includes("12345"), false);
  assert.equal(metadataString.includes("secret"), false);
});

// --- 6. Step 10 & Step 11 Integration & Regression ---

test("18. Step 10 VisualModelAdapter integration: Attach ONNX adapter and set backend to ONNX_WEB", () => {
  const visualAdapter = createVisualModelAdapter();
  const onnxAdapter = createOnnxRuntimeAdapter();

  visualAdapter.attachOnnxRuntime(onnxAdapter);
  const initResult = visualAdapter.initialize({ backend: VISUAL_BACKENDS.ONNX_WEB });

  assert.equal(initResult.ok, true);
  assert.equal(initResult.backend, VISUAL_BACKENDS.ONNX_WEB);
  assert.equal(visualAdapter.onnxAdapter.isReady(), true);
});

test("19. Step 11 SanitizedContextBuilder integrity remains intact", () => {
  const payloadResult = buildSanitizedReasoningPayload({
    domTree: { tagName: "div", children: [{ textName: "#text", textValue: "Public news snippet" }] }
  });

  assert.equal(payloadResult.ok, true);
  assert.equal(payloadResult.payload.status, "SANITIZED");
});

test("20. Steps 1-9 Backward Compatibility: Policy & Vault operations pass without regression", () => {
  // Step 8 Policy Engine check
  const policy = evaluatePiiPolicyItem({
    piiItem: { id: "P1", category: "password", confidence: 0.95 },
    relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
  });
  assert.equal(policy.action, POLICY_ACTIONS.LOCAL_ONLY);

  // Step 9 Vault check
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "SecretPass!", purpose: VAULT_PURPOSES.LOGIN });
  const retrieved = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.secretValue, "SecretPass!");
});

// --- 7. WebGPU & Non-Hardcoding Scope Boundaries ---

test("21. WEBGPU execution provider parameter falls back safely to WASM when WebGPU hardware is unavailable", () => {
  const adapter = createOnnxRuntimeAdapter();
  const initResult = adapter.initialize({ provider: ONNX_EXECUTION_PROVIDERS.WEBGPU });

  assert.equal(initResult.ok, true);
  
  // In Step 13, WEBGPU falls back safely to WASM when WebGPU hardware/ONNX provider is unavailable
  const res = adapter.infer({ data: [1.0], shape: [1], dataType: "float32" });
  assert.equal(res.ok, true);
  assert.equal(res.metadata.executionProvider, ONNX_EXECUTION_PROVIDERS.WASM);
});

test("22. Dynamic Operation: Operates without hardcoded site/model rules", () => {
  const adapter = createOnnxRuntimeAdapter();
  const result1 = adapter.infer({ data: [0.1, 0.2], shape: [1, 2], dataType: "float32" });
  const result2 = adapter.infer({ data: [0.9, 0.8, 0.7], shape: [1, 3], dataType: "float32" });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
});
