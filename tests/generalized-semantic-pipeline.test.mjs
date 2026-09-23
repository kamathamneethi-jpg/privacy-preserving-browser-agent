/**
 * Generalized Semantic Pipeline & Action State Isolation Regression Suite
 *
 * Validates:
 * A. "change the email to alice@example.com" -> FILL email only (NO click).
 * B. "change the phone number to 9876543210" -> FILL phone only (NO click).
 * C. "click confirm order" -> CLICK confirm button only (NO fill, NO OTP hijack).
 * D. "click submit" -> CLICK submit button only.
 * E. "change the email to alice@example.com and click confirm order" -> FILL then CLICK sequentially.
 * F. "change the phone number to 9876543210 and click submit" -> FILL then CLICK sequentially.
 * G. Independent sequential tasks: Task 1 (FILL) followed by Task 2 (CLICK) - ZERO value bleeding.
 * H. Independent sequential tasks: Task 1 (CLICK) followed by Task 2 (FILL) - ZERO target bleeding.
 * I. Unseen fields ("delivery instructions", "postal code") and unseen buttons ("activate license", "proceed to checkout").
 * J. Natural language phrasing variations (enter Y into X, type Y in X, update X to Y, press X, activate X).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GoalParser,
  TaskPlanner,
  BROWSER_OPERATIONS,
  TASK_DOMAINS,
  ExecutionStateManager,
  resolveSemanticTarget
} from "../packages/privacy-core/src/index.js";

import { deriveGeneralizedFallbackAction } from "../apps/extension/src/popup.js";
import { computeAutonomousAgentDecision } from "../scripts/extension-log-server.mjs";

function getControlledFixtureElements(overrides = {}) {
  return [
    {
      elementId: "el_1",
      tag: "input",
      type: "email",
      id: "recipient-email",
      name: "recipient_email",
      value: overrides.recipient_email !== undefined ? overrides.recipient_email : "alex.taylor@example.net",
      labelText: "Recipient Email Address:",
      ariaLabel: "",
      placeholder: "",
      semanticType: "email",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "el_2",
      tag: "input",
      type: "tel",
      id: "customer-phone",
      name: "customer_phone",
      value: overrides.customer_phone !== undefined ? overrides.customer_phone : "+1-555-0188",
      labelText: "Customer Contact Phone:",
      ariaLabel: "",
      placeholder: "",
      semanticType: "phone",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "el_3",
      tag: "input",
      type: "password",
      id: "account-password",
      name: "account_password",
      value: overrides.account_password !== undefined ? overrides.account_password : "SyntheticDemoSecret#2026",
      labelText: "Account Password (Required for Registration):",
      ariaLabel: "",
      placeholder: "",
      semanticType: "password",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "el_4",
      tag: "input",
      type: "text",
      id: "auth-otp",
      name: "auth_otp",
      value: overrides.auth_otp !== undefined ? overrides.auth_otp : "958214",
      labelText: "Two-Factor Authentication Code:",
      ariaLabel: "",
      placeholder: "Enter 6-digit OTP",
      semanticType: "otp",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "el_5",
      tag: "button",
      type: "submit",
      id: "btn-submit-order",
      name: "",
      text: "Confirm Order",
      ariaLabel: "",
      role: "button",
      isInteractive: true,
      isVisible: true
    }
  ];
}

function getUnseenCustomPageElements() {
  return [
    {
      elementId: "custom_el_1",
      tag: "input",
      type: "text",
      id: "txt-postcode",
      name: "postal_code",
      value: "90210",
      labelText: "Postal Code / Zip Code",
      placeholder: "Enter ZIP",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "custom_el_2",
      tag: "textarea",
      id: "txt-delivery-notes",
      name: "delivery_notes",
      value: "",
      labelText: "Special Delivery Instructions",
      placeholder: "Delivery instructions for courier",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "custom_el_3",
      tag: "button",
      type: "button",
      id: "btn-activate-subscription",
      name: "activate",
      text: "Activate Subscription",
      ariaLabel: "Activate Membership License",
      role: "button",
      isInteractive: true,
      isVisible: true
    },
    {
      elementId: "custom_el_4",
      tag: "button",
      type: "submit",
      id: "btn-checkout",
      text: "Proceed to Checkout",
      role: "button",
      isInteractive: true,
      isVisible: true
    }
  ];
}

describe("Generalized Semantic Pipeline & Action State Isolation", () => {

  // Test A
  it("A. 'change the email to alice@example.com' plans and executes FILL on email field ONLY without clicking", () => {
    const task = "change the email to alice@example.com";
    const goal = GoalParser.parse(task);

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING);
    assert.equal(goal.clickTarget, null, "Must NOT have any clickTarget");
    assert.ok(goal.constraints.some(c => c.value === "alice@example.com"));

    const elements = getControlledFixtureElements();
    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const tasks = planner.tasks;

    assert.ok(tasks.some(t => t.type === "fill_form"), "Must have fill_form task");
    assert.ok(!tasks.some(t => t.type === "submit_form"), "Must NOT have submit_form task");

    const stateManager = new ExecutionStateManager({ goal });
    const action = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action, "Must propose an action");
    assert.equal(action.actionType, "TYPE");
    assert.equal(action.target, "el_1", "Must target email input el_1");
    assert.equal(action.parameters.text, "alice@example.com");

    // Server reasoning check
    const serverDecision = computeAutonomousAgentDecision({
      goal,
      currentTask: planner.getCurrentTask(),
      executionState: stateManager.getStateSummary(),
      interactiveElements: elements
    });
    assert.equal(serverDecision.action.actionType, "TYPE");
    assert.equal(serverDecision.action.target, "el_1");
    assert.equal(serverDecision.action.parameters.text, "alice@example.com");
    assert.equal(serverDecision.next_task, null, "Must NOT chain into submit_form");
  });

  // Test B
  it("B. 'change the phone number to 9876543210' plans and executes FILL on phone field ONLY", () => {
    const task = "change the phone number to 9876543210";
    const goal = GoalParser.parse(task);

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING);
    assert.equal(goal.clickTarget, null);

    const phoneConstraint = goal.constraints.find(c => c.value === "9876543210");
    assert.ok(phoneConstraint, "Must extract phone constraint with value 9876543210");

    const elements = getControlledFixtureElements();
    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const stateManager = new ExecutionStateManager({ goal });

    const action = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action);
    assert.equal(action.actionType, "TYPE");
    assert.equal(action.target, "el_2", "Must target phone input el_2");
    assert.equal(action.parameters.text, "9876543210");

    const serverDecision = computeAutonomousAgentDecision({
      goal,
      currentTask: planner.getCurrentTask(),
      executionState: stateManager.getStateSummary(),
      interactiveElements: elements
    });
    assert.equal(serverDecision.action.actionType, "TYPE");
    assert.equal(serverDecision.action.target, "el_2");
    assert.equal(serverDecision.action.parameters.text, "9876543210");
    assert.equal(serverDecision.next_task, null);
  });

  // Test C
  it("C. 'click confirm order' executes ONLY CLICK on confirm button (NO fill, NO OTP hijack)", () => {
    const task = "click confirm order";
    const goal = GoalParser.parse(task);

    assert.equal(goal.clickTarget, "confirm order");
    assert.equal(goal.constraints.length, 0, "Must have zero field constraints");

    const elements = getControlledFixtureElements();
    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const tasks = planner.tasks;

    assert.ok(tasks.some(t => t.type === "submit_form" || t.type === "perform_action"), "Must have click/action task");
    assert.ok(!tasks.some(t => t.type === "fill_form"), "Must NOT have fill_form task");

    const stateManager = new ExecutionStateManager({ goal });
    const action = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action);
    assert.equal(action.actionType, "CLICK");
    assert.equal(action.target, "el_5", "Must target confirm order button el_5");
    assert.deepEqual(action.parameters, {}, "Must have empty parameters (NO inherited values)");

    const serverDecision = computeAutonomousAgentDecision({
      goal,
      currentTask: planner.getCurrentTask(),
      executionState: stateManager.getStateSummary(),
      interactiveElements: elements
    });
    assert.equal(serverDecision.action.actionType, "CLICK");
    assert.equal(serverDecision.action.target, "el_5");
    assert.deepEqual(serverDecision.action.parameters, {});
  });

  // Test D
  it("D. 'click submit' executes ONLY CLICK on matching submit button", () => {
    const task = "click submit";
    const goal = GoalParser.parse(task);

    assert.equal(goal.clickTarget, "submit");

    const elements = getControlledFixtureElements();
    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const stateManager = new ExecutionStateManager({ goal });

    const action = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action);
    assert.equal(action.actionType, "CLICK");
    assert.equal(action.target, "el_5", "Must target submit button el_5");
    assert.deepEqual(action.parameters, {});
  });

  // Test E
  it("E. 'change the email to alice@example.com and click confirm order' executes sequentially: FILL -> CLICK", () => {
    const task = "change the email to alice@example.com and click confirm order";
    const goal = GoalParser.parse(task);

    assert.ok(goal.constraints.some(c => c.value === "alice@example.com"));
    assert.equal(goal.clickTarget, "confirm order");

    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const tasks = planner.tasks;

    const fillTaskIndex = tasks.findIndex(t => t.type === "fill_form");
    const submitTaskIndex = tasks.findIndex(t => t.type === "submit_form" || t.type === "perform_action");

    assert.ok(fillTaskIndex !== -1, "Must contain fill_form");
    assert.ok(submitTaskIndex !== -1, "Must contain submit_form");
    assert.ok(fillTaskIndex < submitTaskIndex, "fill_form MUST precede submit_form");

    // Step 1: Initial DOM
    let elements = getControlledFixtureElements({ recipient_email: "alex.taylor@example.net" });
    const stateManager = new ExecutionStateManager({ goal });

    const action1 = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.equal(action1.actionType, "TYPE");
    assert.equal(action1.target, "el_1");
    assert.equal(action1.parameters.text, "alice@example.com");

    // Simulate Step 1 DOM Mutation: Email field updated to alice@example.com
    elements = getControlledFixtureElements({ recipient_email: "alice@example.com" });
    planner.completeCurrentTask({ elementId: "el_1", value: "alice@example.com" });

    // Step 2: Now currentTask is submit_form
    const action2 = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 2
    });

    assert.ok(action2);
    assert.equal(action2.actionType, "CLICK");
    assert.equal(action2.target, "el_5");
    assert.deepEqual(action2.parameters, {}, "CLICK must NOT inherit email value");
  });

  // Test F
  it("F. 'change the phone number to 9876543210 and click submit' executes sequentially: FILL -> CLICK", () => {
    const task = "change the phone number to 9876543210 and click submit";
    const goal = GoalParser.parse(task);

    assert.ok(goal.constraints.some(c => c.value === "9876543210"));
    assert.equal(goal.clickTarget, "submit");

    const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
    const stateManager = new ExecutionStateManager({ goal });

    // Step 1: Phone update
    let elements = getControlledFixtureElements({ customer_phone: "+1-555-0188" });
    const action1 = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.equal(action1.actionType, "TYPE");
    assert.equal(action1.target, "el_2");
    assert.equal(action1.parameters.text, "9876543210");

    // Simulate Step 1 DOM Mutation
    elements = getControlledFixtureElements({ customer_phone: "9876543210" });
    planner.completeCurrentTask({ elementId: "el_2", value: "9876543210" });

    // Step 2: Submit click
    const action2 = deriveGeneralizedFallbackAction({
      currentTask: planner.getCurrentTask(),
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 2
    });

    assert.equal(action2.actionType, "CLICK");
    assert.equal(action2.target, "el_5");
    assert.deepEqual(action2.parameters, {});
  });

  // Test G: Independent sequential tasks (FILL followed by CLICK) -> No value leakage
  it("G. Independent sequential tasks: Task 1 ('change email to alice@example.com') followed by Task 2 ('click confirm order') has ZERO value bleeding", () => {
    const elements = getControlledFixtureElements();

    // Run Task 1
    const goal1 = GoalParser.parse("change email to alice@example.com");
    const planner1 = new TaskPlanner(goal1, { url: "http://localhost/demo" });
    const stateManager1 = new ExecutionStateManager({ goal: goal1 });

    const action1 = deriveGeneralizedFallbackAction({
      currentTask: planner1.getCurrentTask(),
      goal: goal1,
      interactiveElements: elements,
      stateManager: stateManager1,
      stepNum: 1
    });

    assert.equal(action1.actionType, "TYPE");
    assert.equal(action1.parameters.text, "alice@example.com");

    // Run Task 2 INDEPENDENTLY
    const goal2 = GoalParser.parse("click confirm order");
    const planner2 = new TaskPlanner(goal2, { url: "http://localhost/demo" });
    const stateManager2 = new ExecutionStateManager({ goal: goal2 });

    const action2 = deriveGeneralizedFallbackAction({
      currentTask: planner2.getCurrentTask(),
      goal: goal2,
      interactiveElements: elements,
      stateManager: stateManager2,
      stepNum: 1
    });

    assert.equal(action2.actionType, "CLICK");
    assert.equal(action2.target, "el_5");
    assert.equal(action2.parameters.text, undefined, "Second task MUST NOT inherit first task's email value");
    assert.deepEqual(action2.parameters, {});
  });

  // Test H: Independent sequential tasks (CLICK followed by FILL) -> No target leakage
  it("H. Independent sequential tasks: Task 1 ('click confirm order') followed by Task 2 ('change phone number to 9876543210') has ZERO target bleeding", () => {
    const elements = getControlledFixtureElements();

    // Run Task 1
    const goal1 = GoalParser.parse("click confirm order");
    const planner1 = new TaskPlanner(goal1, { url: "http://localhost/demo" });
    const stateManager1 = new ExecutionStateManager({ goal: goal1 });
    const action1 = deriveGeneralizedFallbackAction({
      currentTask: planner1.getCurrentTask(),
      goal: goal1,
      interactiveElements: elements,
      stateManager: stateManager1,
      stepNum: 1
    });
    assert.equal(action1.actionType, "CLICK");
    assert.equal(action1.target, "el_5");

    // Run Task 2 INDEPENDENTLY
    const goal2 = GoalParser.parse("change phone number to 9876543210");
    const planner2 = new TaskPlanner(goal2, { url: "http://localhost/demo" });
    const stateManager2 = new ExecutionStateManager({ goal: goal2 });
    const action2 = deriveGeneralizedFallbackAction({
      currentTask: planner2.getCurrentTask(),
      goal: goal2,
      interactiveElements: elements,
      stateManager: stateManager2,
      stepNum: 1
    });

    assert.equal(action2.actionType, "TYPE");
    assert.equal(action2.target, "el_2", "Second task MUST NOT inherit click target el_5 as fill target");
    assert.equal(action2.parameters.text, "9876543210");
  });

  // Test I: Unseen field and unseen button
  it("I. Unseen fields and buttons resolve semantically without hardcoded rules", () => {
    const customElements = getUnseenCustomPageElements();

    // Unseen field: "update delivery instructions to Leave at front door"
    const goalField = GoalParser.parse("update delivery instructions to Leave at front door");
    assert.ok(goalField.constraints.some(c => c.value === "Leave at front door"));

    const resolvedField = resolveSemanticTarget(customElements, {
      targetSemantic: "delivery instructions",
      mode: "input"
    });
    assert.ok(resolvedField, "Must resolve delivery instructions textarea");
    assert.equal(resolvedField.elementId, "custom_el_2");

    // Unseen button: "activate subscription"
    const goalBtn = GoalParser.parse("activate subscription");
    assert.equal(goalBtn.clickTarget, "subscription");

    const resolvedBtn = resolveSemanticTarget(customElements, {
      targetSemantic: "activate subscription",
      mode: "click"
    });
    assert.ok(resolvedBtn, "Must resolve activate subscription button");
    assert.equal(resolvedBtn.elementId, "custom_el_3");

    // Unseen button: "proceed to checkout"
    const resolvedCheckout = resolveSemanticTarget(customElements, {
      targetSemantic: "proceed to checkout",
      mode: "click"
    });
    assert.ok(resolvedCheckout);
    assert.equal(resolvedCheckout.elementId, "custom_el_4");
  });

  // Test J: Natural language phrasing variations
  it("J. Generic NLP phrasings for field update and click", () => {
    const elements = getControlledFixtureElements();

    const phrasings = [
      { text: "update email to bob@example.com", expectedTarget: "el_1", expectedVal: "bob@example.com", type: "TYPE" },
      { text: "enter bob@example.com into email", expectedTarget: "el_1", expectedVal: "bob@example.com", type: "TYPE" },
      { text: "type 5551234 in phone", expectedTarget: "el_2", expectedVal: "5551234", type: "TYPE" },
      { text: "set phone number to 5551234", expectedTarget: "el_2", expectedVal: "5551234", type: "TYPE" },
      { text: "press confirm order", expectedTarget: "el_5", expectedVal: null, type: "CLICK" },
      { text: "select confirm order", expectedTarget: "el_5", expectedVal: null, type: "CLICK" },
      { text: "confirm order", expectedTarget: "el_5", expectedVal: null, type: "CLICK" }
    ];

    for (const p of phrasings) {
      const goal = GoalParser.parse(p.text);
      const planner = new TaskPlanner(goal, { url: "http://localhost/demo" });
      const stateManager = new ExecutionStateManager({ goal });

      const action = deriveGeneralizedFallbackAction({
        currentTask: planner.getCurrentTask(),
        goal,
        interactiveElements: elements,
        stateManager,
        stepNum: 1
      });

      assert.ok(action, `Action must be generated for '${p.text}'`);
      assert.equal(action.actionType, p.type, `Action type mismatch for '${p.text}'`);
      assert.equal(action.target, p.expectedTarget, `Target mismatch for '${p.text}'`);
      if (p.expectedVal !== null) {
        assert.equal(action.parameters.text, p.expectedVal, `Value mismatch for '${p.text}'`);
      } else {
        assert.deepEqual(action.parameters, {}, `Parameters must be empty for '${p.text}'`);
      }
    }
  });

  // Test K: Source level check - no hardcoding of specific fixture strings in semantic-target-resolver
  it("K. Zero hardcoded example strings or selectors in semantic-target-resolver", () => {
    const resolverCode = fs.readFileSync(new URL("../packages/privacy-core/src/semantic-target-resolver.js", import.meta.url), "utf8");

    assert.ok(!resolverCode.includes("recipient-email"), "Must not hardcode recipient-email");
    assert.ok(!resolverCode.includes("customer-phone"), "Must not hardcode customer-phone");
    assert.ok(!resolverCode.includes("btn-submit-order"), "Must not hardcode btn-submit-order");
    assert.ok(!resolverCode.includes("alex@gmail.com"), "Must not hardcode alex@gmail.com");
    assert.ok(!resolverCode.includes("abc@gmail.com"), "Must not hardcode abc@gmail.com");
    assert.ok(!resolverCode.includes("controlled-privacy-demo"), "Must not hardcode controlled-privacy-demo");
  });
});
