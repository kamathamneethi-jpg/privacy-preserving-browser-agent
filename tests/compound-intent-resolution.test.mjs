import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GoalParser,
  TaskPlanner,
  GoalCompletionChecker,
  ExecutionStateManager,
  BROWSER_OPERATIONS,
  TASK_DOMAINS
} from "../packages/privacy-core/src/index.js";

import { deriveGeneralizedFallbackAction } from "../apps/extension/src/popup.js";
import { computeAutonomousAgentDecision } from "../scripts/extension-log-server.mjs";

describe("Compound User Intent & Generic UI Action Architecture Test Suite", () => {

  // --------------------------------------------------------------------------
  // Test A: YouTube Regression - Parse compound subscribe intent
  // --------------------------------------------------------------------------
  it("A: Parses 'open youtube and search for joshua weissman and subscribe' preserving actionIntent", () => {
    const goal = GoalParser.parse("open youtube and search for joshua weissman and subscribe");

    assert.ok(goal.operations.includes("perform_action"), "Operations must include perform_action");
    assert.ok(goal.operations.includes("search"), "Operations must include search");
    assert.ok(goal.operations.includes("navigate"), "Operations must include navigate");
    assert.equal(goal.actionIntent, "subscribe", "Action intent must be 'subscribe'");
    assert.equal(goal.targetEntity, "joshua weissman", "Target entity must be extracted cleanly");
  });

  // --------------------------------------------------------------------------
  // Test B: Generic Synthetic Follow Intent
  // --------------------------------------------------------------------------
  it("B: Parses 'open platform and search for creator and follow' generically", () => {
    const goal = GoalParser.parse("open platform and search for creator and follow");

    assert.ok(goal.operations.includes("perform_action"), "Operations must include perform_action");
    assert.equal(goal.actionIntent, "follow", "Action intent must be 'follow'");
    assert.equal(goal.targetEntity, "creator", "Target entity must be extracted cleanly");
  });

  // --------------------------------------------------------------------------
  // Test C: Generic Bookmark Intent
  // --------------------------------------------------------------------------
  it("C: Parses 'open site and search for item and bookmark' generically", () => {
    const goal = GoalParser.parse("open site and search for item and bookmark");

    assert.ok(goal.operations.includes("perform_action"), "Operations must include perform_action");
    assert.equal(goal.actionIntent, "bookmark", "Action intent must be 'bookmark'");
    assert.equal(goal.targetEntity, "item", "Target entity must be extracted cleanly");
  });

  // --------------------------------------------------------------------------
  // Test D: TaskPlanner Decomposition for Compound Action
  // --------------------------------------------------------------------------
  it("D1: TaskPlanner creates generic perform_action task with actionIntent", () => {
    const goal = GoalParser.parse("open youtube and search for joshua weissman and subscribe");
    const planner = new TaskPlanner(goal);

    const taskTypes = planner.tasks.map(t => t.type);
    assert.ok(taskTypes.includes("navigate"), "Plan includes navigate");
    assert.ok(taskTypes.includes("search"), "Plan includes search");
    assert.ok(taskTypes.includes("select_candidate"), "Plan includes select_candidate");
    assert.ok(taskTypes.includes("perform_action"), "Plan includes perform_action");
    assert.ok(taskTypes.includes("verify_goal"), "Plan includes verify_goal");

    const actionTask = planner.tasks.find(t => t.type === "perform_action");
    assert.ok(actionTask, "perform_action task must exist");
    assert.equal(actionTask.actionIntent, "subscribe", "Task actionIntent must be 'subscribe'");
  });

  // --------------------------------------------------------------------------
  // Test D2: GoalCompletionChecker Gating - Pending vs Completed Action
  // --------------------------------------------------------------------------
  it("D2: GoalCompletionChecker isSatisfied remains false until perform_action executes", () => {
    const goal = GoalParser.parse("open youtube and search for joshua weissman and subscribe");
    const stateManager = new ExecutionStateManager(goal);
    const planner = new TaskPlanner(goal);

    // Initial state (no actions taken)
    const initialCheck = GoalCompletionChecker.check({ goal, stateManager, planner, actionHistory: stateManager.actionHistory });
    assert.equal(initialCheck.isSatisfied, false, "Initial state cannot be satisfied");

    // Simulate Step 1: Navigate completed
    planner.completeCurrentTask({ url: "https://www.youtube.com" });
    stateManager.recordActionOutcome({ actionType: "NAVIGATE", target: "window", ok: true, reason: "Navigated to youtube.com" });

    // Simulate Step 2: Search completed
    planner.completeCurrentTask({ query: "joshua weissman" });
    stateManager.recordActionOutcome({ actionType: "TYPE", target: "el_search", ok: true, reason: "Entered search query for joshua weissman" });

    // Simulate Step 3: Select Candidate completed
    planner.completeCurrentTask({ candidate: "Joshua Weissman Channel" });
    stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_candidate", ok: true, reason: "Selected channel candidate" });

    // Current active task is now perform_action ("subscribe")
    assert.equal(planner.getCurrentTask()?.type, "perform_action");

    // GoalCompletionChecker MUST NOT report completion before perform_action executes!
    const midCheck = GoalCompletionChecker.check({ goal, stateManager, planner, actionHistory: stateManager.actionHistory });
    assert.equal(midCheck.isSatisfied, false, "Must NOT be satisfied before perform_action has executed");
    assert.ok(midCheck.missingRequirements.some(r => r.includes("subscribe") || r.includes("perform_action")), "Must list uncompleted subscribe action");

    // Simulate Step 4: Perform Action ("subscribe") executes successfully
    planner.completeCurrentTask({ result: "Subscribed" });
    stateManager.recordActionOutcome({
      actionType: "CLICK",
      target: "el_sub_btn",
      actionIntent: "subscribe",
      ok: true,
      reason: "Executing user-requested action 'subscribe' via Subscribe button"
    });

    // Verify task
    if (planner.getCurrentTask()?.type === "verify_goal") {
      planner.completeCurrentTask({ verified: true });
    }

    // Now goal completion checker should be satisfied
    const finalCheck = GoalCompletionChecker.check({ goal, stateManager, planner, actionHistory: stateManager.actionHistory });
    assert.equal(finalCheck.isSatisfied, true, "Goal MUST be satisfied after requested action succeeded");
  });

  // --------------------------------------------------------------------------
  // Test E: Regression - add_to_cart preserved and not turned into generic perform_action
  // --------------------------------------------------------------------------
  it("E: Regression - 'search for shoes and add to cart' retains add_to_cart operation", () => {
    const goal = GoalParser.parse("search for shoes and add to cart");

    assert.ok(goal.operations.includes(BROWSER_OPERATIONS.ADD_TO_CART), "Operations must include add_to_cart");
    assert.equal(goal.operations.includes(BROWSER_OPERATIONS.PERFORM_ACTION), false, "add_to_cart must not be classified as generic perform_action");
    assert.equal(goal.actionIntent, null, "actionIntent must be null for standard add_to_cart");

    const planner = new TaskPlanner(goal);
    const types = planner.tasks.map(t => t.type);
    assert.ok(types.includes("add_to_cart"), "Planner must generate add_to_cart task");
    assert.equal(types.includes("perform_action"), false, "Planner must not generate perform_action task for add_to_cart");
  });

  // --------------------------------------------------------------------------
  // Test F: Regression - Standard search does not acquire perform_action
  // --------------------------------------------------------------------------
  it("F: Regression - 'search for white running shoes under 7k' remains pure search/filter", () => {
    const goal = GoalParser.parse("search for white running shoes under 7k");

    assert.ok(goal.operations.includes("search"), "Operations must include search");
    assert.ok(goal.operations.includes("filter"), "Operations must include filter");
    assert.equal(goal.operations.includes("perform_action"), false, "Must not include perform_action");
    assert.equal(goal.actionIntent, null, "actionIntent must be null");
  });

  // --------------------------------------------------------------------------
  // Test G: Generic Action Execution & Target Matching
  // --------------------------------------------------------------------------
  it("G: Generic fallback action matches button with visible text or ariaLabel for actionIntent without website selectors", () => {
    const goal = GoalParser.parse("open youtube and search for joshua weissman and subscribe");
    const stateManager = new ExecutionStateManager(goal);
    const currentTask = { type: "perform_action", actionIntent: "subscribe" };

    const interactiveElements = [
      { elementId: "el_logo", tag: "a", text: "Home", ariaLabel: "YouTube Home" },
      { elementId: "el_search_input", tag: "input", name: "search_query", type: "text" },
      { elementId: "el_video_title", tag: "a", text: "Joshua Weissman 100-Hour Brownies" },
      { elementId: "el_subscribe_btn", tag: "button", text: "Subscribe", ariaLabel: "Subscribe to Joshua Weissman." }
    ];

    const action = deriveGeneralizedFallbackAction({
      currentTask,
      goal,
      interactiveElements,
      stateManager,
      stepNum: 3
    });

    assert.ok(action, "Action must be derived");
    assert.equal(action.actionType, "CLICK", "Action type must be CLICK");
    assert.equal(action.target, "el_subscribe_btn", "Must resolve to el_subscribe_btn matching actionIntent 'subscribe'");
    assert.equal(action.actionIntent, "subscribe", "Preserves actionIntent 'subscribe'");
  });

  // --------------------------------------------------------------------------
  // Test H: Extension Log Server Autonomous Decision Matching for Generic UI Actions
  // --------------------------------------------------------------------------
  it("H: extension-log-server autonomous decision resolver executes perform_action generically", () => {
    const goal = GoalParser.parse("open site and search for creator and follow");
    const currentTask = { type: "perform_action", actionIntent: "follow" };

    const interactiveElements = [
      { elementId: "el_profile_card", tag: "div", text: "Creator Profile" },
      { elementId: "el_follow_btn", tag: "button", text: "Follow", ariaLabel: "Follow Creator" }
    ];

    const decision = computeAutonomousAgentDecision({
      goal,
      currentTask,
      executionState: {},
      interactiveElements,
      actionHistory: ["Step 1: [NAVIGATE] on window", "Step 2: [TYPE] on searchbox"]
    });

    assert.equal(decision.ok, true);
    assert.equal(decision.action.actionType, "CLICK");
    assert.equal(decision.action.target, "el_follow_btn");
    assert.equal(decision.action.actionIntent, "follow");
  });
});
