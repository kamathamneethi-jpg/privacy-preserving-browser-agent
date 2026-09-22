import test from "node:test";
import assert from "node:assert/strict";

import {
  createAgentState,
  updateAgentStateFromVlm,
  recordAgentAction,
  detectExecutionLoop,
  validateVlmAction,
  SUPPORTED_VLM_ACTION_TYPES,
  MultimodalVisionAgent,
  createLocalPrivacyVault,
  storeSecretWithToken
} from "../packages/privacy-core/src/index.js";

import { computeAutonomousAgentDecision } from "../scripts/extension-log-server.mjs";

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
});
