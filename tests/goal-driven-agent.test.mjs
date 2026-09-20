import test from "node:test";
import assert from "node:assert/strict";

import {
  GoalParser,
  CONSTRAINT_OPERATORS,
  BROWSER_OPERATIONS,
  TASK_DOMAINS,
  TaskPlanner,
  TASK_STATUS,
  ExecutionStateManager,
  DynamicReplanner,
  GoalCompletionChecker,
  MultimodalVisionAgent,
  DEFAULT_MULTIMODAL_MODEL
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// 1. GOAL PARSER TESTS
// =====================================================================

test("1. GoalParser extracts e-commerce goal with price, color, and cart constraints", () => {
  const goalStr = "Find a waterproof winter jacket under $150 in black and add the best reviewed one to my cart";
  const parsed = GoalParser.parse(goalStr);

  assert.strictEqual(parsed.domain, TASK_DOMAINS.ECOMMERCE);
  assert.ok(parsed.targetEntity.toLowerCase().includes("jacket") || parsed.targetEntity.toLowerCase().includes("winter"));
  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.ADD_TO_CART));
  
  // Verify price constraint under 150
  const priceConstraint = parsed.constraints.find(c => c.type === "price" || c.name === "price");
  assert.ok(priceConstraint, "Price constraint should be identified");
  assert.strictEqual(priceConstraint.operator, CONSTRAINT_OPERATORS.LESS_THAN_OR_EQUAL);
  assert.strictEqual(priceConstraint.value, 150);

  // Verify color constraint
  const colorConstraint = parsed.constraints.find(c => c.type === "color" || c.name === "color");
  assert.ok(colorConstraint, "Color constraint should be identified");
  assert.strictEqual(colorConstraint.value.toLowerCase(), "black");
});

test("2. GoalParser extracts form-filling goal and submission intent", () => {
  const goalStr = "Fill out the employee registration form with my details and submit";
  const parsed = GoalParser.parse(goalStr);

  assert.strictEqual(parsed.domain, TASK_DOMAINS.FORM_FILLING);
  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.SUBMIT_FORM));
  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.FILL_FORM));
  assert.ok(parsed.summary.length > 0);
});

test("3. GoalParser extracts candidate comparison goal with minimum candidate count", () => {
  const goalStr = "Compare the top 2 laptops with 16GB RAM and select the cheapest one";
  const parsed = GoalParser.parse(goalStr);

  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.COMPARE_CANDIDATES));
  const candidateConstraint = parsed.constraints.find(c => c.name === "candidate_count");
  assert.ok(candidateConstraint, "Candidate count constraint must exist");
  assert.strictEqual(candidateConstraint.value, 2);

  const ramConstraint = parsed.constraints.find(c => c.name === "spec" && String(c.value).includes("16gb"));
  assert.ok(ramConstraint, "RAM spec constraint must be extracted");
});

test("4. GoalParser extracts navigation goal and target URL", () => {
  const goalStr = "Navigate to https://wikipedia.org and search for Quantum Computing";
  const parsed = GoalParser.parse(goalStr);

  assert.strictEqual(parsed.domain, TASK_DOMAINS.NAVIGATION);
  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.NAVIGATE));
  assert.ok(parsed.operations.includes(BROWSER_OPERATIONS.SEARCH));
  const navConstraint = parsed.constraints.find(c => c.type === "url");
  assert.ok(navConstraint);
  assert.ok(navConstraint.value.includes("wikipedia.org"));
});

// =====================================================================
// 2. TASK PLANNER TESTS
// =====================================================================

test("5. TaskPlanner generates structured task sequence for e-commerce goal", () => {
  const goal = GoalParser.parse("Search for running shoes and add to cart");
  const planner = new TaskPlanner(goal);

  assert.ok(planner.tasks.length >= 3, "Plan should contain at least search, select, and add_to_cart");
  const types = planner.tasks.map(t => t.type);
  assert.ok(types.includes("search"));
  assert.ok(types.includes("select_candidate") || types.includes("inspect_candidate"));
  assert.ok(types.includes("perform_action"));

  const current = planner.getCurrentTask();
  assert.strictEqual(current.status, TASK_STATUS.PENDING);
});

test("6. TaskPlanner handles immediate task insertion for obstacles", () => {
  const goal = GoalParser.parse("Search for running shoes");
  const planner = new TaskPlanner(goal);
  const initialCount = planner.tasks.length;

  const inserted = planner.insertImmediateTask({
    type: "close_modal",
    description: "Dismiss cookie banner",
    metadata: { elementId: "el_modal_close" }
  });

  assert.strictEqual(planner.tasks.length, initialCount + 1);
  assert.strictEqual(planner.getCurrentTask().id, inserted.id);
  assert.strictEqual(planner.getCurrentTask().type, "close_modal");
});

test("7. TaskPlanner advances through tasks sequentially", () => {
  const goal = GoalParser.parse("Search for headphones and click first item");
  const planner = new TaskPlanner(goal);

  const task1 = planner.getCurrentTask();
  planner.completeCurrentTask({ query: "headphones" });
  assert.strictEqual(task1.status, TASK_STATUS.COMPLETED);

  const task2 = planner.getCurrentTask();
  assert.notStrictEqual(task2.id, task1.id);
});

test("8. TaskPlanner replanPlan preserves completed history", () => {
  const goal = GoalParser.parse("Search for boots");
  const planner = new TaskPlanner(goal);
  planner.completeCurrentTask({ query: "boots" });

  planner.replanPlan([
    { type: "filter", description: "Filter by size 9" },
    { type: "select_candidate", description: "Select first result" }
  ]);

  const summary = planner.getPlanSummary();
  assert.strictEqual(summary.completedTasks, 1);
  assert.strictEqual(summary.pendingTasks, 2);
  assert.strictEqual(summary.totalTasks, 3);
});

// =====================================================================
// 3. EXECUTION STATE MANAGER TESTS
// =====================================================================

test("9. ExecutionStateManager records observations and candidate details", () => {
  const goal = GoalParser.parse("Find best rated book");
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.updateObservation({
    url: "https://books.example.com",
    title: "Book Store",
    domElements: [{ elementId: "el_1" }, { elementId: "el_2" }],
    hasScreenshot: true,
    piiCount: 0
  });

  assert.strictEqual(stateManager.currentObservation.url, "https://books.example.com");
  assert.strictEqual(stateManager.currentObservation.hasScreenshot, true);

  stateManager.recordCandidate({
    id: "cand_1",
    title: "Clean Code",
    price: 35,
    rating: 4.8
  });

  assert.strictEqual(stateManager.candidatesInspected.length, 1);
  assert.strictEqual(stateManager.candidatesInspected[0].title, "Clean Code");

  // Prevent duplicate insertion
  stateManager.recordCandidate({
    id: "cand_1",
    title: "Clean Code",
    price: 35
  });
  assert.strictEqual(stateManager.candidatesInspected.length, 1);
});

test("10. ExecutionStateManager records filters and checks application", () => {
  const goal = GoalParser.parse("Find size 10 shoes in red");
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.recordFilter("size", "10");
  assert.strictEqual(stateManager.isFilterApplied("size", "10"), true);
  assert.strictEqual(stateManager.isFilterApplied("color", "red"), false);
});

test("11. ExecutionStateManager detects action loops", () => {
  const goal = GoalParser.parse("Click button");
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_btn_1", ok: true });
  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_btn_1", ok: true });
  const outcome3 = stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_btn_1", ok: true });

  assert.strictEqual(outcome3.isLoopDetected, true);
  assert.ok(outcome3.loopReason.includes("Repeated identical action"));
});

test("12. ExecutionStateManager tracks consecutive failures correctly", () => {
  const goal = GoalParser.parse("Test failure tracking");
  const stateManager = new ExecutionStateManager({ goal, maxConsecutiveFailures: 3 });

  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_1", ok: false });
  assert.strictEqual(stateManager.consecutiveFailures, 1);

  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_2", ok: false });
  assert.strictEqual(stateManager.consecutiveFailures, 2);

  // Success resets failure counter
  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_3", ok: true });
  assert.strictEqual(stateManager.consecutiveFailures, 0);
});

// =====================================================================
// 4. DYNAMIC REPLANNER TESTS
// =====================================================================

test("13. DynamicReplanner detects modal obstacle and inserts close task", () => {
  const goal = GoalParser.parse("Search for shoes");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  const domElements = [
    { elementId: "el_overlay", tag: "div", text: "We value your privacy. Accept our cookie policy." },
    { elementId: "el_accept", tag: "button", text: "Accept All" }
  ];

  const obstacle = DynamicReplanner.evaluate({
    domElements,
    pageUrl: "https://shop.example.com",
    pageTitle: "Shop",
    currentTask: planner.getCurrentTask(),
    goal,
    consecutiveFailures: 0,
    actionHistory: []
  });

  assert.ok(obstacle, "Obstacle should be detected");
  assert.strictEqual(obstacle.type, "modal_overlay");

  const replanRes = DynamicReplanner.replan({
    obstacle,
    planner,
    stateManager,
    goal,
    domElements
  });

  assert.strictEqual(replanRes.replanned, true);
  assert.strictEqual(planner.getCurrentTask().type, "close_modal");
  assert.strictEqual(planner.getCurrentTask().metadata.targetId, "el_accept");
});

test("14. DynamicReplanner detects zero search results and refines query without relaxing constraints", () => {
  const goal = GoalParser.parse("Find rare vintage jacket size M");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  const domElements = [
    { elementId: "el_msg", tag: "p", text: "No results found for your search" }
  ];

  const obstacle = DynamicReplanner.evaluate({
    domElements,
    pageUrl: "https://shop.example.com/search",
    pageTitle: "Search Results",
    currentTask: planner.getCurrentTask(),
    goal,
    consecutiveFailures: 0,
    actionHistory: ["Step 1: TYPE 'rare vintage jacket size M'"]
  });

  assert.ok(obstacle);
  assert.strictEqual(obstacle.type, "zero_results");

  const replanRes = DynamicReplanner.replan({
    obstacle,
    planner,
    stateManager,
    goal,
    domElements
  });

  assert.strictEqual(replanRes.replanned, true);
  assert.strictEqual(planner.getCurrentTask().type, "search");
  // Ensure constraints remain intact
  assert.strictEqual(stateManager.relaxedConstraints.length, 0, "Never relax constraints automatically");
});

test("15. DynamicReplanner halts when max replan budget exceeded", () => {
  const goal = GoalParser.parse("Search test");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal, maxReplans: 1 });
  stateManager.replanCount = 1;

  const obstacle = { type: "zero_results", description: "Zero results" };
  const replanRes = DynamicReplanner.replan({
    obstacle,
    planner,
    stateManager,
    goal,
    domElements: []
  });

  assert.strictEqual(replanRes.replanned, false);
  assert.ok(replanRes.reason.includes("Maximum replan budget"));
});

// =====================================================================
// 5. GOAL COMPLETION CHECKER TESTS
// =====================================================================

test("16. GoalCompletionChecker rejects completion if cart action missing for e-commerce goal", () => {
  const goal = GoalParser.parse("Find Nike shoes and add to cart");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.recordCandidate({ id: "cand_1", title: "Nike Air Max" });

  const checkRes = GoalCompletionChecker.check({
    goal,
    stateManager,
    planner,
    actionHistory: ["Step 1: [SEARCH] running shoes", "Step 2: [CLICK] product card"]
  });

  assert.strictEqual(checkRes.isSatisfied, false);
  assert.ok(checkRes.reason.includes("add to cart") || checkRes.reason.includes("pending"));
});

test("17. GoalCompletionChecker confirms completion when all requirements met", () => {
  const goal = GoalParser.parse("Find Nike shoes and add to cart");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.recordCandidate({ id: "cand_1", title: "Nike Air Max" });
  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_add_to_cart", ok: true, reason: "Added item to cart" });

  // Complete all tasks in planner
  while (planner.getCurrentTask()) {
    planner.completeCurrentTask();
  }

  const checkRes = GoalCompletionChecker.check({
    goal,
    stateManager,
    planner,
    actionHistory: ["Step 1: [SEARCH]", "Step 2: [CLICK] Add to Cart"]
  });

  assert.strictEqual(checkRes.isSatisfied, true);
  assert.ok(checkRes.reason.includes("genuinely satisfied"));
});

test("18. GoalCompletionChecker rejects completion if candidate comparison requirement unmet", () => {
  const goal = GoalParser.parse("Compare 2 laptops with 16GB RAM");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  // Only 1 candidate inspected
  stateManager.recordCandidate({ id: "cand_1", title: "Laptop A" });

  const checkRes = GoalCompletionChecker.check({
    goal,
    stateManager,
    planner,
    actionHistory: ["Step 1: [CLICK] Laptop A"]
  });

  assert.strictEqual(checkRes.isSatisfied, false);
  assert.ok(checkRes.reason.includes("Comparison requires at least 2 candidates"));
});

test("19. GoalCompletionChecker confirms form submission when form filled and submitted", () => {
  const goal = GoalParser.parse("Fill contact form and submit");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  stateManager.recordActionOutcome({ actionType: "TYPE", target: "el_name", ok: true });
  stateManager.recordActionOutcome({ actionType: "CLICK", target: "el_submit", ok: true, reason: "Form submitted" });

  while (planner.getCurrentTask()) {
    planner.completeCurrentTask();
  }

  const checkRes = GoalCompletionChecker.check({
    goal,
    stateManager,
    planner,
    actionHistory: ["Step 1: [TYPE] Name", "Step 2: [CLICK] Submit"]
  });

  assert.strictEqual(checkRes.isSatisfied, true);
});

// =====================================================================
// 6. MULTIMODAL VISION AGENT TESTS
// =====================================================================

test("20. MultimodalVisionAgent builds dual representation messages (DOM + Screenshot)", () => {
  const goal = GoalParser.parse("Search for shoes");
  const currentTask = { type: "search", description: "Search for shoes" };
  const executionState = { stepCount: 1, inspectedCount: 0 };
  const interactiveElements = [
    { elementId: "el_1", tag: "input", type: "search", placeholder: "Search..." }
  ];
  const screenshotBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const messages = MultimodalVisionAgent.buildMultimodalMessages({
    goal,
    currentTask,
    executionState,
    interactiveElements,
    screenshotBase64,
    actionHistory: [],
    sanitizedDomContext: "<div>Search Page</div>",
    rawPiiValues: []
  });

  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].role, "system");
  assert.strictEqual(messages[1].role, "user");

  // User message should contain multimodal array: text + image_url
  assert.ok(Array.isArray(messages[1].content));
  const hasText = messages[1].content.some(part => part.type === "text" && part.text.includes("el_1"));
  const hasImage = messages[1].content.some(part => part.type === "image_url" && part.image_url.url === screenshotBase64);

  assert.strictEqual(hasText, true);
  assert.strictEqual(hasImage, true);
});

test("21. MultimodalVisionAgent asserts zero raw PII in outgoing payload", () => {
  const goal = GoalParser.parse("Search for user info");
  const currentTask = { type: "search" };
  const executionState = {};
  const interactiveElements = [
    { elementId: "el_1", tag: "input", text: "Safe element" }
  ];

  assert.throws(() => {
    MultimodalVisionAgent.buildMultimodalMessages({
      goal,
      currentTask,
      executionState,
      interactiveElements,
      sanitizedDomContext: "Leaked context containing unredacted raw secret 4111222233334444",
      rawPiiValues: ["4111222233334444"]
    });
  }, /SECURITY ASSERTION FAILED/);
});

test("22. MultimodalVisionAgent parses structured reasoning JSON cleanly", () => {
  const rawModelResponse = "```json\n" + JSON.stringify({
    observation: "Found search input bar on the landing page",
    goal_progress: { isSatisfied: false, remainingTasks: ["search", "add_to_cart"] },
    next_task: "Enter search query into search box",
    action: {
      actionType: "TYPE",
      target: "el_search",
      parameters: { text: "waterproof boots" },
      thenPressEnter: true,
      reasoningSummary: "Entering search keywords"
    }
  }) + "\n```";

  const parsed = MultimodalVisionAgent.parseModelResponse(rawModelResponse);

  assert.strictEqual(parsed.action.actionType, "TYPE");
  assert.strictEqual(parsed.action.target, "el_search");
  assert.strictEqual(parsed.action.parameters.text, "waterproof boots");
  assert.strictEqual(parsed.action.thenPressEnter, true);
  assert.strictEqual(parsed.goal_progress.isSatisfied, false);
});

test("23. MultimodalVisionAgent handles missing API key gracefully without throwing uncaught exception", async () => {
  const result = await MultimodalVisionAgent.reason({
    apiKey: "",
    model: DEFAULT_MULTIMODAL_MODEL,
    provider: "openrouter",
    goal: GoalParser.parse("Find shoes"),
    currentTask: { type: "search" },
    executionState: {},
    interactiveElements: []
  });

  assert.strictEqual(result, null);
});
