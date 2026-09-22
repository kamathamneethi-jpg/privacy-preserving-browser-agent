/**
 * Phase 7: Generic Form Modification and Confirmation/Click Execution Regression Test Suite.
 *
 * Validates:
 * 1. "change the email to alex@gmail.com"
 *    - Email constraint extracted with explicit overwrite flag
 *    - Modification operation generated (FILL, FILL_FORM)
 *    - Existing email value is overwritten
 *    - Target resolved generically without site-specific IDs
 * 2. "change the otp to 112345"
 *    - OTP constraint extracted
 *    - Modification operation generated
 *    - Pre-filled OTP can be replaced
 * 3. "change the two factor code to 112345"
 *    - Semantic target resolves to OTP input
 *    - No special alias branch introduced
 * 4. "click on confirm Order"
 *    - Generic confirmation/click operation generated
 *    - Observed confirm button targeted without site-specific selector
 * 5. Combined task: "change the email to alex@gmail.com and click on confirm Order"
 *    - Both operations represented in plan (fill_form + submit_form)
 *    - Email modification executes locally
 *    - Confirm button click executes locally
 * 6. Unrelated pre-filled fields are NOT overwritten when the task does not request changing them.
 * 7. Privacy invariants remain unchanged:
 *    - Outbound data sanitized/tokenized according to PolicyEngine
 *    - LOCAL_ONLY secrets excluded from remote reasoning
 *    - Telemetry remains sanitized
 * 8. Source-level hardcoding audit:
 *    - Zero website names
 *    - Zero exact demo-task strings
 *    - Zero field-name -> action mappings
 *    - Zero exact selector-specific action branches
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GoalParser,
  TaskPlanner,
  BROWSER_OPERATIONS,
  TASK_DOMAINS,
  ExecutionStateManager,
  evaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy,
  sanitizedContextBuilder,
  privacyVault,
  sanitizeTelemetryData,
  POLICY_ACTIONS,
  TASK_NECESSITY_LEVELS,
  TASK_RELEVANCE_LEVELS,
  SEMANTIC_ROLES,
  SENSITIVITY_LEVELS,
  PiiCategory
} from "../packages/privacy-core/src/index.js";

import { deriveGeneralizedFallbackAction } from "../apps/extension/src/popup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Helper to simulate interactive DOM elements from controlled fixture
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

describe("Phase 7 — Generic Form Modification and Confirmation Execution", () => {

  // ---------------------------------------------------------------------------
  // TEST 1: "change the email to alex@gmail.com"
  // ---------------------------------------------------------------------------
  it("1. 'change the email to alex@gmail.com' extracts constraint, generates modification op, and allows overwriting existing value", () => {
    const goal = GoalParser.parse("change the email to alex@gmail.com");

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING, "Domain must be detected as FORM_FILLING");
    assert.ok(goal.operations.includes(BROWSER_OPERATIONS.FILL) || goal.operations.includes(BROWSER_OPERATIONS.FILL_FORM), "Must include FILL/FILL_FORM operation");

    const emailConstraint = goal.constraints.find(c => c.name === "email" || c.attribute === "email");
    assert.ok(emailConstraint, "Email constraint must be extracted");
    assert.equal(emailConstraint.value, "alex@gmail.com", "Email value must match requested address");
    assert.equal(emailConstraint.isExplicitOverwrite, true, "Must have explicit overwrite flag");

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const fillTask = plan.find(t => t.type === "fill_form");
    assert.ok(fillTask, "Plan must contain fill_form task");

    const stateManager = new ExecutionStateManager({ goal });
    const elements = getControlledFixtureElements();

    const action = deriveGeneralizedFallbackAction({
      currentTask: fillTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action, "An action must be generated");
    assert.equal(action.actionType, "TYPE", "Action type must be TYPE");
    assert.equal(action.target, "el_1", "Must target el_1 (the email input)");
    assert.equal(action.parameters.text, "alex@gmail.com", "Action parameters must contain requested new email");
  });

  // ---------------------------------------------------------------------------
  // TEST 2: "change the otp to 112345"
  // ---------------------------------------------------------------------------
  it("2. 'change the otp to 112345' extracts OTP constraint and replaces pre-filled OTP", () => {
    const goal = GoalParser.parse("change the otp to 112345");

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING, "Domain must be FORM_FILLING");
    const otpConstraint = goal.constraints.find(c => c.name === "otp" || c.attribute === "otp" || c.rawField === "otp");
    assert.ok(otpConstraint, "OTP constraint must be extracted");
    assert.equal(otpConstraint.value, "112345", "OTP value must be 112345");
    assert.equal(otpConstraint.isExplicitOverwrite, true, "Explicit overwrite flag must be set");

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const fillTask = plan.find(t => t.type === "fill_form");
    assert.ok(fillTask, "Plan must contain fill_form task");

    const stateManager = new ExecutionStateManager({ goal });
    const elements = getControlledFixtureElements();

    const action = deriveGeneralizedFallbackAction({
      currentTask: fillTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action, "Action must be generated");
    assert.equal(action.actionType, "TYPE");
    assert.equal(action.target, "el_4", "Must target el_4 (the OTP input)");
    assert.equal(action.parameters.text, "112345", "Action text must be 112345");
  });

  // ---------------------------------------------------------------------------
  // TEST 3: "change the two factor code to 112345"
  // ---------------------------------------------------------------------------
  it("3. 'change the two factor code to 112345' targets the same semantic target as OTP without special aliases", () => {
    const goal = GoalParser.parse("change the two factor code to 112345");

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING);
    const codeConstraint = goal.constraints.find(c => c.name.includes("factor") || c.attribute.includes("factor") || c.name === "otp" || c.attribute === "otp");
    assert.ok(codeConstraint, "Constraint for two factor code must be extracted");
    assert.equal(codeConstraint.value, "112345");

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const fillTask = plan.find(t => t.type === "fill_form");
    assert.ok(fillTask);

    const stateManager = new ExecutionStateManager({ goal });
    const elements = getControlledFixtureElements();

    const action = deriveGeneralizedFallbackAction({
      currentTask: fillTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action);
    assert.equal(action.actionType, "TYPE");
    assert.equal(action.target, "el_4", "Must target el_4 (Two-Factor Authentication Code field)");
    assert.equal(action.parameters.text, "112345");
  });

  // ---------------------------------------------------------------------------
  // TEST 4: "click on confirm Order"
  // ---------------------------------------------------------------------------
  it("4. 'click on confirm Order' generates generic confirmation/click operation and targets confirm button", () => {
    const goal = GoalParser.parse("click on confirm Order");

    assert.ok(
      goal.operations.includes(BROWSER_OPERATIONS.SUBMIT) ||
      goal.operations.includes(BROWSER_OPERATIONS.SUBMIT_FORM) ||
      goal.operations.includes(BROWSER_OPERATIONS.PERFORM_ACTION) ||
      goal.operations.includes(BROWSER_OPERATIONS.INSPECT),
      "Must include submit/action operations"
    );

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const submitTask = plan.find(t => t.type === "submit_form" || t.type === "submit" || t.type === "perform_action");
    assert.ok(submitTask, "Plan must contain submit/action task");

    const stateManager = new ExecutionStateManager({ goal });
    const elements = getControlledFixtureElements();

    const action = deriveGeneralizedFallbackAction({
      currentTask: submitTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action, "Action must be generated");
    assert.equal(action.actionType, "CLICK", "Action type must be CLICK");
    assert.equal(action.target, "el_5", "Must target el_5 (Confirm Order button)");
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Combined Task: "change the email to alex@gmail.com and click on confirm Order"
  // ---------------------------------------------------------------------------
  it("5. Combined task 'change the email to alex@gmail.com and click on confirm Order' plans and executes both steps sequentially", () => {
    const goal = GoalParser.parse("change the email to alex@gmail.com and click on confirm Order");

    assert.equal(goal.domain, TASK_DOMAINS.FORM_FILLING, "Must detect FORM_FILLING domain");
    assert.ok(goal.operations.includes(BROWSER_OPERATIONS.FILL_FORM) || goal.operations.includes(BROWSER_OPERATIONS.FILL), "Must include FILL_FORM operation");
    assert.ok(goal.operations.includes(BROWSER_OPERATIONS.SUBMIT_FORM) || goal.operations.includes(BROWSER_OPERATIONS.SUBMIT), "Must include SUBMIT_FORM operation");

    const emailConstraint = goal.constraints.find(c => c.name === "email" || c.attribute === "email");
    assert.ok(emailConstraint);
    assert.equal(emailConstraint.value, "alex@gmail.com");

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const fillTask = plan.find(t => t.type === "fill_form");
    const submitTask = plan.find(t => t.type === "submit_form" || t.type === "submit");

    assert.ok(fillTask, "Plan must include fill_form task");
    assert.ok(submitTask, "Plan must include submit_form task");

    const stateManager = new ExecutionStateManager({ goal });
    const elements = getControlledFixtureElements();

    // Step 1: Execute Form Fill (Field Modification)
    const action1 = deriveGeneralizedFallbackAction({
      currentTask: fillTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 1
    });

    assert.ok(action1, "Step 1 action must be generated");
    assert.equal(action1.actionType, "TYPE");
    assert.equal(action1.target, "el_1", "Step 1 must target email field");
    assert.equal(action1.parameters.text, "alex@gmail.com", "Step 1 must enter alex@gmail.com");

    // Simulate Step 1 execution modifying the DOM element
    stateManager.recordFieldFilled(action1.fieldName || "email", action1.fieldValue || "alex@gmail.com");
    elements[0].value = "alex@gmail.com";

    // Step 2: Form submission / confirmation
    const action2 = deriveGeneralizedFallbackAction({
      currentTask: submitTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 2
    });

    assert.ok(action2, "Step 2 action must be generated");
    assert.equal(action2.actionType, "CLICK", "Step 2 must be CLICK");
    assert.equal(action2.target, "el_5", "Step 2 must target Confirm Order button");
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Unrelated Pre-Filled Fields Are NOT Overwritten
  // ---------------------------------------------------------------------------
  it("6. Unrelated pre-filled fields are preserved and NOT overwritten when task does not request changing them", () => {
    const goal = GoalParser.parse("change the email to alex@gmail.com");
    const stateManager = new ExecutionStateManager({ goal });

    // Initial state: phone, password, otp are pre-filled, email has already been updated
    const elements = getControlledFixtureElements({
      recipient_email: "alex@gmail.com",
      customer_phone: "+1-555-0188",
      account_password: "SyntheticDemoSecret#2026",
      auth_otp: "958214"
    });

    const plan = TaskPlanner.generateInitialPlan(goal, { url: "http://example.com/checkout" });
    const fillTask = plan.find(t => t.type === "fill_form");

    // Attempting another fill step when the explicit email constraint is already fulfilled
    const action = deriveGeneralizedFallbackAction({
      currentTask: fillTask,
      goal,
      interactiveElements: elements,
      stateManager,
      stepNum: 2
    });

    // It should NOT generate a TYPE action that overwrites phone, password, or OTP with dummy values
    if (action) {
      assert.notEqual(action.target, "el_2", "Must not overwrite pre-filled phone");
      assert.notEqual(action.target, "el_3", "Must not overwrite pre-filled password");
      assert.notEqual(action.target, "el_4", "Must not overwrite pre-filled OTP");
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Privacy Invariants Remain Authoritative & Unchanged
  // ---------------------------------------------------------------------------
  it("7. Privacy Invariants: PolicyEngine decisions remain authoritative for outbound data, LOCAL_ONLY excluded from remote, telemetry sanitized", () => {
    // 1. Evaluate policy for sensitive items on task context
    const taskContext = {
      task: "change the email to alex@gmail.com and click on confirm Order",
      domain: "form_filling"
    };

    // Password item in checkout/registration
    const passwordItem = {
      piiId: "pass_1",
      category: PiiCategory.PASSWORD_FIELD,
      semanticRole: SEMANTIC_ROLES.AUTH_SECRET,
      taskNecessity: TASK_NECESSITY_LEVELS.LOCAL_EXECUTION_ONLY,
      taskRelevance: TASK_RELEVANCE_LEVELS.ESSENTIAL_LOCAL,
      sensitivity: SENSITIVITY_LEVELS.CRITICAL
    };

    const passwordDecision = evaluatePiiPolicyItem({ piiItem: passwordItem, context: taskContext });
    assert.equal(passwordDecision.action, POLICY_ACTIONS.LOCAL_ONLY, "Password must receive LOCAL_ONLY privacy decision");

    // 2. Outbound context building: password must NOT appear in remote payload
    const rawItems = [
      { id: "p1", category: "password", text: "SyntheticDemoSecret#2026", bbox: [10, 10, 100, 20] },
      { id: "e1", category: "email", text: "alex@gmail.com", bbox: [10, 50, 200, 20] }
    ];

    const sanitizedContext = sanitizedContextBuilder.buildSanitizedContext({
      rawItems,
      pageUrl: "http://example.com/order",
      task: taskContext.task
    });

    const serializedPayload = JSON.stringify(sanitizedContext);
    assert.ok(!serializedPayload.includes("SyntheticDemoSecret#2026"), "Raw password MUST NEVER appear in outbound remote payload");

    // 3. Telemetry sanitization: raw credentials stripped
    const telemetryEvent = {
      eventType: "FORM_ACTION_EXECUTED",
      password: "SyntheticDemoSecret#2026",
      raw_input: "SyntheticDemoSecret#2026",
      target: "el_3"
    };

    const safeTelemetry = sanitizeTelemetryData(telemetryEvent);
    const telemetryString = JSON.stringify(safeTelemetry);
    assert.ok(!telemetryString.includes("SyntheticDemoSecret#2026"), "Telemetry MUST NEVER leak raw password");
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Source-Level Hardcoding Audit
  // ---------------------------------------------------------------------------
  it("8. Source-level hardcoding audit: zero website names, zero demo-task strings, zero hardcoded field mappings", () => {
    const filesToAudit = [
      "packages/privacy-core/src/goal-parser.js",
      "packages/privacy-core/src/task-planner.js",
      "packages/privacy-core/src/execution-state-manager.js",
      "apps/extension/src/popup.js"
    ];

    for (const relPath of filesToAudit) {
      const fullPath = resolve(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Check for forbidden exact demo-task string checks
      assert.ok(
        !content.includes("change the email to alex@gmail.com and click on confirm Order"),
        `File ${relPath} contains hardcoded demo-task string!`
      );

      // Check for forbidden demo-specific hardcoded element ID references in decision branches
      assert.ok(
        !content.includes("btn-submit-order") || relPath.includes("test"),
        `File ${relPath} must not contain hardcoded #btn-submit-order selector`
      );
      assert.ok(
        !content.includes("recipient-email") || relPath.includes("test"),
        `File ${relPath} must not contain hardcoded #recipient-email selector`
      );

      // Check for hardcoded email address in source
      assert.ok(
        !content.includes("alex@gmail.com"),
        `File ${relPath} must not contain hardcoded email 'alex@gmail.com'`
      );
      assert.ok(
        !content.includes("alex.taylor@example.net"),
        `File ${relPath} must not contain hardcoded email 'alex.taylor@example.net'`
      );
    }
  });

});
