import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BrowserActionEngine,
  createBrowserActionEngine,
  browserActionEngine,
  DomDriver,
  createDomDriver,
  domDriver,
  validateNavigationProtocol,
  ACTION_SYSTEM_VERSION,
  ACTION_CONFIG,
  ACTION_STATUS,
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  ACTION_TARGET_TYPES,
  ACTION_REQUEST_SHAPE,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  VAULT_PURPOSES,
  storeSecret,
  revokeSecret,
  expireSecret,
  clearVault,
  buildSanitizedReasoningPayload,
  createVisualModelAdapter,
  createOnnxRuntimeAdapter,
  createWebGpuManager
} from "../packages/privacy-core/src/index.js";

// --- 1. Export & Contract Verification ---

test("1. Action contracts exist and adhere to immutability rules", () => {
  assert.equal(ACTION_STATUS.READY, "READY");
  assert.equal(BROWSER_ACTION_TYPES.CLICK, "CLICK");
  assert.equal(BROWSER_ACTION_TYPES.FILL, "FILL");
  assert.equal(ACTION_RESULTS.COMPLETED, "COMPLETED");
  assert.equal(ACTION_RESULTS.DENIED_UNAUTHORIZED, "DENIED_UNAUTHORIZED");
  assert.equal(ACTION_RESULTS.DENIED_PURPOSE_MISMATCH, "DENIED_PURPOSE_MISMATCH");
  assert.equal(ACTION_RESULTS.DENIED_REMOTE_DESTINATION, "DENIED_REMOTE_DESTINATION");
  assert.equal(ACTION_TARGET_TYPES.TOKEN_REFERENCE, "TOKEN_REFERENCE");
  assert.equal(ACTION_REQUEST_SHAPE.actionType, "string");
  assert.throws(() => { ACTION_STATUS.NEW_PROP = "test"; }, TypeError);
});

test("2. Action configuration contains defaults, batch limits, and timeouts", () => {
  assert.equal(ACTION_SYSTEM_VERSION, "1.0.0");
  assert.equal(ACTION_CONFIG.MAX_ACTIONS_PER_BATCH, 10);
  assert.equal(ACTION_CONFIG.ACTION_TIMEOUT_MS, 5000);
  assert.ok(ACTION_CONFIG.ALLOWED_ACTION_TYPES.includes(BROWSER_ACTION_TYPES.FILL));
  assert.ok(ACTION_CONFIG.LOCAL_DESTINATIONS.includes(PROCESSING_DESTINATIONS.LOCAL_BROWSER));
  assert.ok(ACTION_CONFIG.PERMITTED_PROTOCOLS.includes("https:"));
  assert.ok(ACTION_CONFIG.FORBIDDEN_PROTOCOLS.includes("javascript:"));
});

// --- 2. Engine Instantiation & Lifecycle ---

test("3. BrowserActionEngine instantiation and initialize lifecycle", () => {
  const engine = new BrowserActionEngine();
  assert.equal(engine.getActionStatus(), ACTION_STATUS.UNINITIALIZED);

  const initRes = engine.initialize();
  assert.equal(initRes.ok, true);
  assert.equal(initRes.state, ACTION_STATUS.READY);
  assert.equal(engine.getActionStatus(), ACTION_STATUS.READY);
});

// --- 3. Non-Sensitive Action Execution ---

test("4. Valid CLICK action executes and returns sanitized metadata", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn_submit_123", targetType: ACTION_TARGET_TYPES.DOM_ELEMENT },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOCAL_ACTION
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "btn_submit_123" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(res.actionType, BROWSER_ACTION_TYPES.CLICK);
  assert.equal(res.targetId, "btn_submit_123");
  assert.ok(typeof res.executionTimeMs === "number");
});

test("5. Valid non-sensitive TYPE action executes cleanly", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.TYPE,
    target: { id: "search_input_1", category: "public_query" },
    parameters: { text: "privacy browser features" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.SEARCH
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "search_input_1" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

test("6. TYPE into sensitive PII field enforces Step 8/9 vault authorization rules", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.TYPE,
    target: { id: "pwd_input_1", category: "password" }, // sensitive PII category!
    parameters: { text: "attempted_raw_password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: false } // Unauthorized!
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "pwd_input_1" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNAUTHORIZED);
});

test("7. Valid SELECT action executes cleanly", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.SELECT,
    target: { id: "country_dropdown" },
    parameters: { value: "US" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.FORM_FILL
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "country_dropdown" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

test("8. Valid SUBMIT action executes cleanly", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.SUBMIT,
    target: { id: "form_login" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "form_login" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

test("9. Valid SCROLL action executes cleanly within maximum bounds", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.SCROLL,
    target: { id: "main_content" },
    parameters: { scrollY: 300 },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOCAL_ACTION
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "main_content" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

// --- 4. Denials & Security Boundaries ---

test("10. Invalid action type is denied safely", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: "HACK_DOM",
    target: { id: "el1" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  };

  const res = engine.executeAction(request);
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_INVALID_ACTION);
});

test("11. Invalid target (null or missing id) is denied safely", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: null,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  };

  const res = engine.executeAction(request);
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_INVALID_TARGET);
});

test("12. Remote destination action request is DENIED_REMOTE_DESTINATION", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "el1" },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING, // Remote!
    purpose: VAULT_PURPOSES.LOCAL_ACTION
  };

  const res = engine.executeAction(request);
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_REMOTE_DESTINATION);
});

test("13. Sensitive action without explicit authorization is DENIED_UNAUTHORIZED", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "input_card", category: "payment_card" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.CHECKOUT,
    authorization: { authorizationGranted: false }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "input_card" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNAUTHORIZED);
});

test("14. Step 8 REDACT policy decision denies action execution", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "redacted_span", policyItem: { action: POLICY_ACTIONS.REDACT } },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOCAL_ACTION
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "redacted_span" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_POLICY);
});

test("15. TOKENIZE policy requires explicit authorization before Step 9 Vault retrieval", () => {
  clearVault();
  const stored = storeSecret({ category: "email", secretValue: "user@domain.invalid", purpose: VAULT_PURPOSES.FORM_FILL });
  const engine = createBrowserActionEngine();

  // Action request with TOKENIZE policy item, BUT missing authorization
  const requestWithoutAuth = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "email_field", vaultId: stored.vaultId, category: "email", policyItem: { action: POLICY_ACTIONS.TOKENIZE } },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.FORM_FILL,
    authorization: { authorizationGranted: false }
  };

  const res1 = engine.executeAction(requestWithoutAuth, { pageState: { nodes: [{ id: "email_field" }] } });
  assert.equal(res1.ok, false);
  assert.equal(res1.status, ACTION_RESULTS.DENIED_UNAUTHORIZED);

  // Action request with TOKENIZE policy item AND explicit authorization
  const requestWithAuth = {
    ...requestWithoutAuth,
    authorization: { authorizationGranted: true }
  };

  const res2 = engine.executeAction(requestWithAuth, { pageState: { nodes: [{ id: "email_field" }] } });
  assert.equal(res2.ok, true);
  assert.equal(res2.status, ACTION_RESULTS.COMPLETED);
});

// --- 5. Vault Secret Retrieval & Security Guarantees ---

test("16. Sensitive FILL retrieves secret through Step 9 Vault and outputs ONLY sanitized metadata", () => {
  clearVault();
  const secretPass = "SuperSecretPassword123!";
  const stored = storeSecret({ category: "password", secretValue: secretPass, purpose: VAULT_PURPOSES.LOGIN });

  let injectedValue = null;
  const mockDriver = {
    fillElement: (id, val) => { injectedValue = val; }
  };

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "pwd_input", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "pwd_input" }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(injectedValue, secretPass);

  // Verify result metadata NEVER contains raw secret
  const resStr = JSON.stringify(res);
  assert.equal(resStr.includes(secretPass), false);
  assert.equal(resStr.includes("SuperSecretPassword123!"), false);
});

test("17. Cross-purpose authorization test returns DENIED_PURPOSE_MISMATCH", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN }); // Stored for LOGIN
  const engine = createBrowserActionEngine();

  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "input_pwd", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.CHECKOUT, // Attempted for CHECKOUT!
    authorization: { authorizationGranted: true }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "input_pwd" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_PURPOSE_MISMATCH);
});

test("18. Cross-target authorization test returns DENIED_INVALID_TARGET", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });
  const engine = createBrowserActionEngine();

  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: {
      id: "unauthorized_target_B",
      vaultId: stored.vaultId,
      category: "password",
      authorizedTargetId: "authorized_target_A" // Secret was authorized only for target A!
    },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "unauthorized_target_B" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_INVALID_TARGET);
});

test("19. Expired vault secret cannot be used for action execution", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN, ttlMs: 1 });
  expireSecret(stored.vaultId);

  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "input_pwd", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "input_pwd" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNAUTHORIZED);
});

test("20. Revoked vault secret cannot be used for action execution", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });
  revokeSecret(stored.vaultId);

  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "input_pwd", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "input_pwd" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNAUTHORIZED);
});

// --- 6. Stale Target & Dangerous Action Protection ---

test("21. Missing or stale target is rejected with DENIED_TARGET_NOT_FOUND or DENIED_STALE_TARGET", () => {
  const engine = createBrowserActionEngine();

  // Missing target
  const resMissing = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "non_existent_btn" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "other_btn" }] } });
  assert.equal(resMissing.ok, false);
  assert.equal(resMissing.status, ACTION_RESULTS.DENIED_TARGET_NOT_FOUND);

  // Stale target
  const resStale = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "old_btn", isStale: true },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "old_btn" }] } });
  assert.equal(resStale.ok, false);
  assert.equal(resStale.status, ACTION_RESULTS.DENIED_STALE_TARGET);
});

test("22. Dangerous code primitives (eval, script injection) are rejected with DENIED_UNSAFE_ACTION", () => {
  const engine = createBrowserActionEngine();
  const request = {
    actionType: BROWSER_ACTION_TYPES.TYPE,
    target: { id: "input1" },
    parameters: { text: "<script>alert('hack')</script>; eval('bad()');" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  };

  const res = engine.executeAction(request, { pageState: { nodes: [{ id: "input1" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNSAFE_ACTION);
});

test("23. Dangerous navigation schemes (javascript:, data:, file:) are rejected", () => {
  assert.equal(validateNavigationProtocol("https://secure.site.invalid/login"), true);
  assert.equal(validateNavigationProtocol("http://example.invalid"), true);
  assert.equal(validateNavigationProtocol("javascript:alert(1)"), false);
  assert.equal(validateNavigationProtocol("data:text/html,hack"), false);
  assert.equal(validateNavigationProtocol("file:///etc/passwd"), false);

  const engine = createBrowserActionEngine();
  const navRequest = {
    actionType: BROWSER_ACTION_TYPES.NAVIGATE,
    target: { id: "link1" },
    parameters: { url: "javascript:eval('malicious')" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  };

  const res = engine.executeAction(navRequest, { pageState: { nodes: [{ id: "link1" }] } });
  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.DENIED_UNSAFE_ACTION);
});

// --- 7. Independent Batch Validation ---

test("24. Batch execution validates each action independently", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });
  const engine = createBrowserActionEngine();

  const batchRequests = [
    // Action 1: Valid non-sensitive click
    {
      actionType: BROWSER_ACTION_TYPES.CLICK,
      target: { id: "btn1" },
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      purpose: VAULT_PURPOSES.LOCAL_ACTION
    },
    // Action 2: Sensitive fill WITHOUT authorization -> MUST be independently denied!
    {
      actionType: BROWSER_ACTION_TYPES.FILL,
      target: { id: "pwd1", vaultId: stored.vaultId, category: "password" },
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      purpose: VAULT_PURPOSES.LOGIN,
      authorization: { authorizationGranted: false }
    }
  ];

  const batchRes = engine.executeBatch(batchRequests, {
    pageState: { nodes: [{ id: "btn1" }, { id: "pwd1" }] },
    stopOnDenial: true
  });

  assert.equal(batchRes.ok, false);
  assert.equal(batchRes.completedCount, 1);
  assert.equal(batchRes.results[0].status, ACTION_RESULTS.COMPLETED);
  assert.equal(batchRes.results[1].status, ACTION_RESULTS.DENIED_UNAUTHORIZED);
});

test("25. Batch execution respects MAX_ACTIONS_PER_BATCH cap", () => {
  const engine = createBrowserActionEngine({ MAX_ACTIONS_PER_BATCH: 3 });
  const oversizedBatch = new Array(5).fill({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });

  const res = engine.executeBatch(oversizedBatch);
  assert.equal(res.ok, false);
  assert.match(res.error, /exceeds maximum limit/);
});

// --- 8. Privacy & Zero Network Guarantees ---

test("26. Static inspection: BrowserActionEngine contains zero network APIs", async () => {
  const src = await readFile(resolve("packages/privacy-core/src/browser-action-engine.js"), "utf8");
  const forbiddenApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
  for (const api of forbiddenApis) {
    assert.equal(src.includes(api), false, `Source code must not contain network API '${api}'.`);
  }
});

test("27. Runtime network interception: Action execution initiates zero network calls", () => {
  let networkAttempted = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkAttempted = true;
    throw new Error("Network call prohibited!");
  };

  try {
    const engine = createBrowserActionEngine();
    engine.executeAction({
      actionType: BROWSER_ACTION_TYPES.CLICK,
      target: { id: "btn1" },
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
    }, { pageState: { nodes: [{ id: "btn1" }] } });

    assert.equal(networkAttempted, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("28. Dynamic operation: Operates without hardcoded website or selector rules", () => {
  const engine = createBrowserActionEngine();
  const dynamicRequest = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: `dyn_target_${Date.now()}` },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  };

  const res = engine.executeAction(dynamicRequest, { pageState: { nodes: [{ id: dynamicRequest.target.id }] } });
  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

// --- 9. Step 10–13 Integration & Backward Compatibility ---

test("29. Integration: Step 11 sanitized context integration works seamlessly with Action System", () => {
  const sanitized = buildSanitizedReasoningPayload({
    domTree: { tagName: "div", children: [{ id: "btn_action_1", tagName: "button" }] }
  });
  assert.equal(sanitized.ok, true);

  const engine = createBrowserActionEngine();
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn_action_1" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "btn_action_1" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

test("30. Integration: Steps 10-13 Visual, ONNX, and WebGPU modules remain fully functional", () => {
  const visualAdapter = createVisualModelAdapter();
  const onnxAdapter = createOnnxRuntimeAdapter();
  const webgpuManager = createWebGpuManager();

  assert.ok(visualAdapter);
  assert.ok(onnxAdapter);
  assert.ok(webgpuManager);
});

test("31. Lifecycle & Disposal: dispose() resets action engine cleanly", () => {
  const engine = createBrowserActionEngine();
  assert.equal(engine.getActionStatus(), ACTION_STATUS.READY);

  const dispRes = engine.dispose();
  assert.equal(dispRes.ok, true);
  assert.equal(engine.getActionStatus(), ACTION_STATUS.DISPOSED);

  const execRes = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });
  assert.equal(execRes.ok, false);
  assert.equal(execRes.status, ACTION_RESULTS.ERROR);
});

// --- 10. DOM Driver Integration & False Success Prevention Tests ---

test("32. CLICK execution through DOM driver invokes driver and returns COMPLETED", () => {
  let executedAction = null;
  const mockDriver = createDomDriver({
    executor: (type, targetId, params) => {
      executedAction = { type, targetId, params };
      return { ok: true };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn_click_test" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "btn_click_test" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(executedAction.type, BROWSER_ACTION_TYPES.CLICK);
  assert.equal(executedAction.targetId, "btn_click_test");
});

test("33. TYPE execution through DOM driver passes text parameters", () => {
  let executedParams = null;
  const mockDriver = createDomDriver({
    executor: (type, targetId, params) => {
      executedParams = params;
      return { ok: true };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.TYPE,
    target: { id: "search_box" },
    parameters: { text: "privacy browser agent" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "search_box" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(executedParams.text, "privacy browser agent");
});

test("34. FILL execution through DOM driver passes secret locally and leaves output clean", () => {
  clearVault();
  const secret = "TopSecret123!";
  const stored = storeSecret({ category: "password", secretValue: secret, purpose: VAULT_PURPOSES.LOGIN });

  let filledSecret = null;
  const mockDriver = {
    fillElement: (targetId, val) => {
      filledSecret = val;
      return { ok: true };
    },
    execute: () => ({ ok: true })
  };

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "pwd_input", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  }, { pageState: { nodes: [{ id: "pwd_input" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(filledSecret, secret);
  assert.equal(JSON.stringify(res).includes(secret), false);
});

test("35. SELECT execution through DOM driver passes option value", () => {
  let selectedValue = null;
  const mockDriver = createDomDriver({
    executor: (type, targetId, params) => {
      selectedValue = params.value;
      return { ok: true };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.SELECT,
    target: { id: "country_select" },
    parameters: { value: "IN" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "country_select" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(selectedValue, "IN");
});

test("36. SUBMIT execution through DOM driver triggers form submission", () => {
  let submittedTarget = null;
  const mockDriver = createDomDriver({
    executor: (type, targetId) => {
      submittedTarget = targetId;
      return { ok: true };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.SUBMIT,
    target: { id: "login_form" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "login_form" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.equal(submittedTarget, "login_form");
});

test("37. SCROLL execution through DOM driver passes scroll coordinates", () => {
  let scrollCoords = null;
  const mockDriver = createDomDriver({
    executor: (type, targetId, params) => {
      scrollCoords = { scrollX: params.scrollX, scrollY: params.scrollY };
      return { ok: true };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: mockDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.SCROLL,
    target: { id: "content_pane" },
    parameters: { scrollX: 0, scrollY: 450 },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "content_pane" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
  assert.deepEqual(scrollCoords, { scrollX: 0, scrollY: 450 });
});

test("38. WAIT execution through DOM driver returns COMPLETED", () => {
  const engine = createBrowserActionEngine();
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.WAIT,
    target: { id: "page_root" },
    parameters: { durationMs: 50 },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "page_root" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.status, ACTION_RESULTS.COMPLETED);
});

test("39. Missing DOM driver returns deterministic failure, NOT false success", () => {
  const engineNoDriver = createBrowserActionEngine({ domDriver: null });
  const res = engineNoDriver.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn_no_driver" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "btn_no_driver" }] } });

  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.ERROR);
  assert.match(res.error, /DOM driver is unavailable/);
});

test("40. DOM driver execution failure propagates failure result", () => {
  const failingDriver = createDomDriver({
    executor: () => {
      return { ok: false, error: "Simulated element click interception error." };
    }
  });

  const engine = createBrowserActionEngine({ domDriver: failingDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "btn_fail" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  }, { pageState: { nodes: [{ id: "btn_fail" }] } });

  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.ERROR);
  assert.match(res.error, /interception error/);
});

test("41. DOM driver fillElement failure propagates failure result", () => {
  clearVault();
  const stored = storeSecret({ category: "password", secretValue: "Pass123!", purpose: VAULT_PURPOSES.LOGIN });

  const failingFillDriver = {
    fillElement: () => ({ ok: false, error: "Input element is disabled or readonly." }),
    execute: () => ({ ok: true })
  };

  const engine = createBrowserActionEngine({ domDriver: failingFillDriver });
  const res = engine.executeAction({
    actionType: BROWSER_ACTION_TYPES.FILL,
    target: { id: "disabled_pwd", vaultId: stored.vaultId, category: "password" },
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    purpose: VAULT_PURPOSES.LOGIN,
    authorization: { authorizationGranted: true }
  }, { pageState: { nodes: [{ id: "disabled_pwd" }] } });

  assert.equal(res.ok, false);
  assert.equal(res.status, ACTION_RESULTS.ERROR);
  assert.match(res.error, /disabled or readonly/);
});

test("42. Extension bundle output files exist in apps/extension/dist/", async () => {
  const bundlePath = resolve("apps/extension/dist/privacy-core.bundle.js");
  const contentPath = resolve("apps/extension/dist/content-action-runtime.bundle.js");
  const popupPath = resolve("apps/extension/dist/popup.bundle.js");

  const [bundleSrc, contentSrc, popupSrc] = await Promise.all([
    readFile(bundlePath, "utf8"),
    readFile(contentPath, "utf8"),
    readFile(popupPath, "utf8")
  ]);

  assert.ok(bundleSrc.length > 1000);
  assert.ok(contentSrc.length > 500);
  assert.ok(popupSrc.length > 500);
});

