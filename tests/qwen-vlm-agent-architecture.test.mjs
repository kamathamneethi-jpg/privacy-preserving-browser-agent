import test from "node:test";
import assert from "node:assert/strict";

import {
  createAgentState,
  updateAgentStateFromVlm,
  recordAgentAction,
  detectExecutionLoop,
  validateVlmAction,
  MultimodalVisionAgent,
  createLocalPrivacyVault,
  storeSecretWithToken,
  isProviderCircuitOpen,
  tripProviderCircuit,
  resetProviderCircuit
} from "../packages/privacy-core/src/index.js";

import { computeAutonomousAgentDecision, isClientRateLimited, resetRateLimits } from "../scripts/extension-log-server.mjs";

test("Qwen VLM Agent Architecture Test Suite", async (t) => {

  // 1. AgentState Initialization
  await t.test("createAgentState initializes clean working memory", () => {
    const state = createAgentState({
      userRequest: "Change email to alex@gmail.com and confirm order",
      maxIterations: 8
    });

    assert.equal(state.goal.userRequest, "Change email to alex@gmail.com and confirm order");
    assert.equal(state.goal.status, "in_progress");
    assert.equal(state.status, "planning");
    assert.equal(state.iteration, 0);
    assert.equal(state.maxIterations, 8);
    assert.deepEqual(state.tasks, []);
    assert.equal(state.currentTaskId, null);
    assert.deepEqual(state.actionHistory, []);
  });

  // 2. AgentState Update from Qwen VLM Response
  await t.test("updateAgentStateFromVlm updates tasks, currentTaskId, and goal status", () => {
    const state = createAgentState({ userRequest: "Search for shoes" });

    const vlmResponse = {
      goal: { description: "Search for shoes", status: "in_progress" },
      tasks: [
        { id: "task_1", description: "Type search query", status: "in_progress" },
        { id: "task_2", description: "Click first product", status: "pending" }
      ],
      currentTaskId: "task_1",
      action: { type: "TYPE", target: "el_search", value: "shoes" },
      replan: false,
      reason: "Entering search query into search box"
    };

    updateAgentStateFromVlm(state, vlmResponse);

    assert.equal(state.iteration, 1);
    assert.equal(state.status, "running");
    assert.equal(state.tasks.length, 2);
    assert.equal(state.currentTaskId, "task_1");
    assert.deepEqual(state.pendingTasks, ["task_2"]);
    assert.deepEqual(state.completedTasks, []);

    // Simulate next step: task_1 is completed, task_2 is current
    const vlmResponse2 = {
      goal: { status: "in_progress" },
      taskUpdate: {
        completedTaskIds: ["task_1"]
      },
      currentTaskId: "task_2",
      action: { type: "CLICK", target: "el_product_1" },
      reason: "Clicking product"
    };

    updateAgentStateFromVlm(state, vlmResponse2);
    assert.equal(state.iteration, 2);
    assert.equal(state.currentTaskId, "task_2");
    assert.ok(state.completedTasks.includes("task_1"));
    const t1 = state.tasks.find(t => t.id === "task_1");
    assert.equal(t1.status, "completed");
  });

  // 3. Dynamic Replanning Support in AgentState
  await t.test("updateAgentStateFromVlm handles dynamic replanning by replacing tasks", () => {
    const state = createAgentState({ userRequest: "Filter and checkout" });
    state.tasks = [
      { id: "task_1", description: "Filter items", status: "completed" },
      { id: "task_2", description: "Checkout", status: "pending" }
    ];
    state.completedTasks = ["task_1"];

    const replanResponse = {
      replan: true,
      reason: "Category selection required before checkout",
      tasks: [
        { id: "task_1", description: "Filter items", status: "completed" },
        { id: "task_select_category", description: "Select category popup", status: "in_progress" },
        { id: "task_2", description: "Checkout", status: "pending" }
      ],
      currentTaskId: "task_select_category"
    };

    updateAgentStateFromVlm(state, replanResponse);
    assert.equal(state.tasks.length, 3);
    assert.equal(state.currentTaskId, "task_select_category");
    assert.equal(state.replanCount, 1);
  });

  // 4. Action Validator: Rejects unsupported action types
  await t.test("validateVlmAction rejects unsupported actions", () => {
    const res = validateVlmAction({ type: "EXECUTE_JAVASCRIPT_INJECTION", target: "el_1" });
    assert.equal(res.valid, false);
    assert.match(res.error, /Unsupported action type/);
  });

  // 5. Action Validator: Verifies element existence in interactive DOM
  await t.test("validateVlmAction verifies DOM element existence for CLICK and TYPE", () => {
    const dom = [{ elementId: "el_1", tag: "button", text: "Submit" }];

    // Valid target
    const validRes = validateVlmAction({ type: "CLICK", target: "el_1" }, { interactiveElements: dom });
    assert.equal(validRes.valid, true);
    assert.equal(validRes.action.target, "el_1");

    // Missing target
    const invalidRes = validateVlmAction({ type: "CLICK", target: "el_99" }, { interactiveElements: dom });
    assert.equal(invalidRes.valid, false);
    assert.match(invalidRes.error, /not found in the current interactive DOM snapshot/);
  });

  // 6. Action Validator: Blocks dangerous NAVIGATE protocols
  await t.test("validateVlmAction blocks javascript: and file: URLs in NAVIGATE", () => {
    const badJs = validateVlmAction({ type: "NAVIGATE", url: "javascript:alert(1)" });
    assert.equal(badJs.valid, false);
    assert.match(badJs.error, /Blocked dangerous URL protocol/);

    const badFile = validateVlmAction({ type: "NAVIGATE", url: "file:///etc/passwd" });
    assert.equal(badFile.valid, false);
    assert.match(badFile.error, /Blocked dangerous URL protocol/);

    const goodUrl = validateVlmAction({ type: "NAVIGATE", url: "https://example.com" });
    assert.equal(goodUrl.valid, true);
    assert.equal(goodUrl.action.url, "https://example.com");
  });

  // 7. Action Validator: Resolves local privacy tokens via PrivacyVault
  await t.test("validateVlmAction resolves privacy tokens locally from PrivacyVault", () => {
    const vault = createLocalPrivacyVault();
    const token = "{{EMAIL_1}}";
    vault.storeSecretWithToken(token, {
      category: "EMAIL_ADDRESS",
      secretValue: "alex@gmail.com",
      purpose: "LOCAL_ACTION"
    });

    const dom = [{ elementId: "el_email", tag: "input", type: "email" }];
    const res = validateVlmAction(
      { type: "TYPE", target: "el_email", value: token },
      { interactiveElements: dom, privacyVault: vault }
    );

    assert.equal(res.valid, true);
    assert.equal(res.action.value, "alex@gmail.com");
    assert.equal(res.action.parameters.text, "alex@gmail.com");
  });

  // 8. Action Validator: Validates DONE / COMPLETE actions
  await t.test("validateVlmAction validates DONE and COMPLETE actions", () => {
    const doneRes = validateVlmAction({ type: "DONE" });
    assert.equal(doneRes.valid, true);
    assert.equal(doneRes.action.type, "DONE");

    const completeRes = validateVlmAction({ type: "COMPLETE" });
    assert.equal(completeRes.valid, true);
    assert.equal(completeRes.action.type, "DONE");
  });

  // 9. Loop Detection: Detects 3x repeated action stagnation
  await t.test("detectExecutionLoop flags 3x repeated actions", () => {
    const state = createAgentState({ userRequest: "Test Loop" });
    const action = { type: "CLICK", target: "el_stuck" };

    recordAgentAction(state, { actionType: "CLICK", targetId: "el_stuck" });
    assert.equal(detectExecutionLoop(state, action).isLoop, false);

    recordAgentAction(state, { actionType: "CLICK", targetId: "el_stuck" });
    assert.equal(detectExecutionLoop(state, action).isLoop, false);

    recordAgentAction(state, { actionType: "CLICK", targetId: "el_stuck" });
    const loopResult = detectExecutionLoop(state, action);
    assert.equal(loopResult.isLoop, true);
    assert.match(loopResult.reason, /repeated 3 times/i);
  });

  // 10. MultimodalVisionAgent: System prompt and output schema parsing
  await t.test("MultimodalVisionAgent builds Qwen VLM prompt and parses response", () => {
    const sysPrompt = MultimodalVisionAgent.buildSystemPrompt();
    assert.match(sysPrompt, /Qwen VLM/);
    assert.match(sysPrompt, /currentTaskId/);
    assert.match(sysPrompt, /taskUpdate/);

    const rawJsonResponse = JSON.stringify({
      goal: { description: "Change email to alex@gmail.com", status: "in_progress" },
      tasks: [
        { id: "task_1", description: "Change email", status: "in_progress" },
        { id: "task_2", description: "Confirm Order", status: "pending" }
      ],
      currentTaskId: "task_1",
      taskUpdate: { completedTaskIds: [], newTaskIds: [] },
      action: {
        type: "TYPE",
        target: "el_email",
        value: "alex@gmail.com"
      },
      replan: false,
      reason: "Entering updated email"
    });

    const parsed = MultimodalVisionAgent.parseModelResponse(rawJsonResponse);
    assert.equal(parsed.goal.status, "in_progress");
    assert.equal(parsed.tasks.length, 2);
    assert.equal(parsed.currentTaskId, "task_1");
    assert.equal(parsed.action.type, "TYPE");
    assert.equal(parsed.action.target, "el_email");
    assert.equal(parsed.action.value, "alex@gmail.com");
    assert.equal(parsed.action.parameters.text, "alex@gmail.com");
    assert.equal(parsed.reason, "Entering updated email");
  });

  // 11. MultimodalVisionAgent: Zero raw PII in outbound messages assertion
  await t.test("MultimodalVisionAgent throws if raw secret is in outbound text payload", () => {
    assert.throws(() => {
      MultimodalVisionAgent.buildMultimodalMessages({
        userGoal: "Test raw secret",
        sanitizedDomContext: "Leaked raw password SecretPass123! in DOM",
        rawPiiValues: ["SecretPass123!"]
      });
    }, /SECURITY ASSERTION FAILED/);
  });

  // 12. Local Reasoning Server: Conforms to Qwen VLM response schema
  await t.test("computeAutonomousAgentDecision returns Qwen VLM compliant schema", () => {
    const decision = computeAutonomousAgentDecision({
      userGoal: "Confirm order",
      interactiveElements: [
        { elementId: "el_confirm", id: "el_confirm", tag: "button", text: "Confirm Order" }
      ]
    });

    assert.equal(decision.ok, true);
    assert.ok(decision.goal);
    assert.equal(decision.goal.status, "completed");
    assert.ok(Array.isArray(decision.tasks));
    assert.ok(decision.currentTaskId);
    assert.ok(decision.action);
    assert.equal(decision.action.type, "CLICK");
    assert.equal(decision.action.target, "el_confirm");
    assert.equal(typeof decision.reason, "string");
  });

  // 13. MultimodalVisionAgent sanitizes sensitive element labels and title, proceeding with transmission
  await t.test("MultimodalVisionAgent sanitizes sensitive element labels and title, proceeding with transmission", () => {
    const rawSecretEmail = "shahrukhmdsss9@gmail.com";
    const messages = MultimodalVisionAgent.buildMultimodalMessages({
      userGoal: "open sider ai mail",
      pageTitle: `Inbox (738) - ${rawSecretEmail} - Gmail`,
      currentUrl: `https://mail.google.com/mail/u/0/?q=sider#inbox`,
      interactiveElements: [
        { elementId: "el_1", tag: "a", text: `Google Account (${rawSecretEmail})`, ariaLabel: `Account: ${rawSecretEmail}` },
        { elementId: "el_2", tag: "input", placeholder: "Search mail", value: "" }
      ],
      sanitizedDomContext: "Inbox page content sanitized",
      rawPiiValues: [rawSecretEmail]
    });

    assert.ok(Array.isArray(messages));
    assert.equal(messages.length, 2);
    const userMsg = messages.find(m => m.role === "user");
    assert.ok(userMsg);
    const textPart = userMsg.content.find(c => c.type === "text");
    assert.ok(textPart);
    assert.equal(textPart.text.includes(rawSecretEmail), false, "Zero raw secret email in outbound text payload");
    assert.ok(textPart.text.includes("[EMAIL_REDACTED]") || textPart.text.includes("[REDACTED]"));
  });

  // 14. MultimodalVisionAgent.reason sends sanitized payload and reports telemetry
  await t.test("MultimodalVisionAgent.reason sends sanitized payload and reports telemetry", async () => {
    const rawSecretEmail = "shahrukhmdsss9@gmail.com";
    const telemetryEvents = [];
    let receivedPayload = null;

    const mockFetch = async (url, options) => {
      receivedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  goal: { description: "Open email", status: "in_progress" },
                  tasks: [{ id: "task_1", description: "Click email", status: "in_progress" }],
                  currentTaskId: "task_1",
                  action: { type: "CLICK", target: "el_1" },
                  reason: "Clicking target email link"
                })
              }
            }
          ]
        })
      };
    };

    const res = await MultimodalVisionAgent.reason({
      apiKey: "test-key-12345",
      provider: "huggingface",
      model: "Qwen/Qwen2.5-VL-72B-Instruct",
      userGoal: "open sider ai mail",
      pageTitle: `Inbox - ${rawSecretEmail} - Gmail`,
      interactiveElements: [
        { elementId: "el_1", tag: "a", text: `Google Account (${rawSecretEmail})` }
      ],
      sanitizedDomContext: "Sanitized Gmail inbox",
      rawPiiValues: [rawSecretEmail],
      fetchClient: mockFetch,
      onTelemetry: (evt) => telemetryEvents.push(evt)
    });

    assert.ok(res);
    assert.equal(res.action.type, "CLICK");
    assert.equal(res.action.target, "el_1");
    assert.ok(receivedPayload);
    const sentText = JSON.stringify(receivedPayload);
    assert.equal(sentText.includes(rawSecretEmail), false, "Outbound API payload contains ZERO raw PII");
    assert.ok(telemetryEvents.some(e => e.status === "REQUEST"), "REQUEST telemetry reported");
    assert.ok(telemetryEvents.some(e => e.status === "RESPONSE"), "RESPONSE telemetry reported");
  });

  // 15. MultimodalVisionAgent.reason dispatches API call with sanitized DOM and screenshot even if page has PII
  await t.test("MultimodalVisionAgent.reason dispatches API call with sanitized DOM and screenshot even if page has PII", async () => {
    const rawSecretEmail = "sensitive-user@domain.com";
    const rawPhone = "9876543210";
    let receivedPayload = null;

    const mockFetch = async (url, options) => {
      receivedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  goal: { description: "Manage Account", status: "in_progress" },
                  tasks: [{ id: "task_1", description: "Click profile settings", status: "in_progress" }],
                  currentTaskId: "task_1",
                  action: { type: "CLICK", target: "el_profile" },
                  reason: "Accessing profile settings safely"
                })
              }
            }
          ]
        })
      };
    };

    const res = await MultimodalVisionAgent.reason({
      apiKey: "test-key-12345",
      provider: "huggingface",
      model: "Qwen/Qwen2.5-VL-72B-Instruct",
      userGoal: `Check status for ${rawSecretEmail}`,
      pageTitle: `Dashboard: ${rawSecretEmail} (${rawPhone})`,
      currentUrl: `https://example.com/account?email=${rawSecretEmail}`,
      interactiveElements: [
        { elementId: "el_profile", tag: "button", text: `User: ${rawSecretEmail}`, ariaLabel: `Phone: ${rawPhone}` }
      ],
      screenshotBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      sanitizedDomContext: `Raw finding leaked into DOM text: Email is ${rawSecretEmail}, phone is ${rawPhone}`,
      rawPiiValues: [rawSecretEmail, rawPhone],
      fetchClient: mockFetch
    });

    assert.ok(res, "Decision successfully returned by reason()");
    assert.equal(res.action.type, "CLICK");
    assert.equal(res.action.target, "el_profile");
    assert.ok(receivedPayload, "Remote API call was dispatched");

    const sentText = JSON.stringify(receivedPayload);
    assert.equal(sentText.includes(rawSecretEmail), false, "Zero raw email in transmitted payload");
    assert.equal(sentText.includes(rawPhone), false, "Zero raw phone in transmitted payload");

    // Verify screenshot image_url and sanitized DOM are both present in user message
    const userMsg = receivedPayload.messages.find(m => m.role === "user");
    assert.ok(userMsg, "User message present in payload");
    const imagePart = userMsg.content.find(c => c.type === "image_url");
    const textPart = userMsg.content.find(c => c.type === "text");
    assert.ok(imagePart, "Redacted screenshot is sent in API payload");
    assert.ok(textPart, "Sanitized DOM is sent in API payload");
    assert.ok(imagePart.image_url.url.startsWith("data:image/"), "Valid image URL is transmitted");
  });

  // 16. recordAgentAction Backward and Forward Field Compatibility
  await t.test("recordAgentAction stores actionType, type, status, reason, and actionIntent", () => {
    const state = createAgentState({ userRequest: "Automate task" });
    recordAgentAction(state, {
      action: "type",
      target: "el_search_box",
      value: "shoes",
      reason: "Typing search query",
      result: "success"
    });

    assert.equal(state.actionHistory.length, 1);
    const item = state.lastAction;
    assert.equal(item.action, "TYPE");
    assert.equal(item.actionType, "TYPE");
    assert.equal(item.type, "TYPE");
    assert.equal(item.target, "el_search_box");
    assert.equal(item.targetId, "el_search_box");
    assert.equal(item.value, "shoes");
    assert.equal(item.status, "success");
    assert.equal(item.result, "success");
    assert.equal(item.reason, "Typing search query");
  });

  // 17. MultimodalVisionAgent.reason deeply sanitizes nested agentState and tasks
  await t.test("MultimodalVisionAgent.reason deeply sanitizes nested agentState and tasks with zero secrets transmitted", async () => {
    let capturedPayload = null;
    const rawSecretSSN = "987-65-4321";
    const rawSecretToken = "sec_token_999888";

    const mockFetch = async (url, opts) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  goal: { description: "Safe action", status: "completed" },
                  action: { type: "DONE" },
                  reason: "Finished successfully"
                })
              }
            }
          ]
        })
      };
    };

    const res = await MultimodalVisionAgent.reason({
      apiKey: "test-key-mock",
      provider: "groq",
      model: "llama-3.2-11b-vision-preview",
      userGoal: `Secure lookup for ${rawSecretSSN}`,
      agentState: {
        iteration: 1,
        status: "running",
        tasks: [
          { id: "task_1", description: `Verify SSN: ${rawSecretSSN}`, status: "completed" },
          { id: "task_2", description: `Enter token ${rawSecretToken}`, status: "pending" }
        ],
        completedTasks: [`task_${rawSecretSSN}`],
        pendingTasks: ["task_2"]
      },
      tasks: [
        { id: "task_1", description: `Verify SSN: ${rawSecretSSN}` }
      ],
      currentTask: { id: "task_2", description: `Enter token ${rawSecretToken}` },
      rawPiiValues: [rawSecretSSN, rawSecretToken],
      screenshotBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      sanitizedDomContext: "Safe page context",
      fetchClient: mockFetch
    });

    assert.ok(res, "Decision received");
    assert.ok(capturedPayload, "API call dispatched");
    const jsonStr = JSON.stringify(capturedPayload);
    assert.equal(jsonStr.includes(rawSecretSSN), false, "Raw SSN scrubbed from remote payload");
    assert.equal(jsonStr.includes(rawSecretToken), false, "Raw token scrubbed from remote payload");
  });

  // 18. Autonomous Agent cleans conversational queries and progresses past search
  await t.test("computeAutonomousAgentDecision cleans search query and selects candidate once search performed", () => {
    // Step 1: Initial search from conversational prompt
    const decisionStep1 = computeAutonomousAgentDecision({
      userGoal: "please open the sider ai email",
      actionHistory: [],
      interactiveElements: [
        { elementId: "el_search", tag: "input", type: "search", name: "q" }
      ]
    });

    assert.equal(decisionStep1.ok, true);
    assert.equal(decisionStep1.action.actionType, "TYPE");
    assert.equal(decisionStep1.action.target, "el_search");
    assert.equal(decisionStep1.action.parameters.text, "sider ai");

    // Step 2: After search has been performed, select matching email row
    const decisionStep2 = computeAutonomousAgentDecision({
      userGoal: "please open the sider ai email",
      actionHistory: [
        { action: "TYPE", target: "el_search", value: "sider ai", reason: "Typed query" }
      ],
      interactiveElements: [
        { elementId: "el_search", tag: "input", type: "search", name: "q" },
        { elementId: "el_row_1", tag: "tr", text: "Sider AI - Welcome to Sider! Confirm your email" },
        { elementId: "el_row_2", tag: "tr", text: "Google Cloud - Monthly Billing Invoice" }
      ]
    });

    assert.equal(decisionStep2.ok, true);
    assert.equal(decisionStep2.action.actionType, "CLICK");
    assert.equal(decisionStep2.action.target, "el_row_1");
    assert.ok(decisionStep2.action.reasoningSummary.includes("Sider AI"));
  });

  // 19. Provider Circuit Breaker Protection on HTTP 402/429
  await t.test("Circuit breaker trips on HTTP 402 and auto-routes subsequent steps to local agent without remote fetch", async () => {
    resetProviderCircuit();
    const testProvider = "huggingface";
    const testModel = "Qwen/Qwen2.5-VL-72B-Instruct";

    assert.equal(isProviderCircuitOpen(testProvider, testModel), false);

    let remoteFetchAttempts = 0;
    let localFetchAttempts = 0;

    const mockFetch = async (url, options) => {
      if (url.includes("huggingface.co")) {
        remoteFetchAttempts++;
        // Simulate HTTP 402 Payment Required (Credits Depleted)
        return {
          ok: false,
          status: 402,
          statusText: "Payment Required",
          text: async () => JSON.stringify({ error: "You have depleted your monthly included credits." })
        };
      }
      if (url.includes("8765/api/agent/reason")) {
        localFetchAttempts++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            observation: "Fallback local agent decision",
            action: { type: "CLICK", target: "el_local_btn" }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    // Step 1: Initial call encounters 402, trips circuit breaker, and falls back to local agent
    const res1 = await MultimodalVisionAgent.reason({
      apiKey: "hf_test_token_12345",
      provider: testProvider,
      model: testModel,
      userGoal: "Find blue running shoes",
      fetchClient: mockFetch
    });

    assert.equal(remoteFetchAttempts, 1);
    assert.equal(localFetchAttempts, 1);
    assert.equal(res1.ok, true);
    assert.equal(res1.action.target, "el_local_btn");

    // Circuit breaker is now OPEN
    assert.equal(isProviderCircuitOpen(testProvider, testModel), true);

    // Step 2: Next call with circuit open must issue ZERO remote fetches and route straight to local agent
    const res2 = await MultimodalVisionAgent.reason({
      apiKey: "hf_test_token_12345",
      provider: testProvider,
      model: testModel,
      userGoal: "Select first shoe",
      fetchClient: mockFetch
    });

    // Remote fetch count did NOT increase (0 spam calls issued)
    assert.equal(remoteFetchAttempts, 1);
    // Local fetch was called cleanly
    assert.equal(localFetchAttempts, 2);
    assert.equal(res2.action.target, "el_local_btn");

    // Reset circuit breaker and verify it closes
    resetProviderCircuit(testProvider, testModel);
    assert.equal(isProviderCircuitOpen(testProvider, testModel), false);
  });

  // 20. Server IP Rate Limiter Verification
  await t.test("isClientRateLimited enforces sliding window threshold and blocks spam", () => {
    resetRateLimits();
    const testIp = "10.0.0.42";
    const maxReqs = 5;

    // First 5 requests within window are allowed
    for (let i = 0; i < maxReqs; i++) {
      assert.equal(isClientRateLimited(testIp, maxReqs, 60000), false);
    }

    // 6th request is blocked by rate limiter
    assert.equal(isClientRateLimited(testIp, maxReqs, 60000), true);

    // After reset, requests are allowed again
    resetRateLimits();
    assert.equal(isClientRateLimited(testIp, maxReqs, 60000), false);
  });
});



