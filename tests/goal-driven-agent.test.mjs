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
import { extractElementDescription } from "../packages/privacy-core/src/interactive-element-registry.js";
import { deriveGeneralizedFallbackAction, extractNavigationUrl } from "../apps/extension/src/popup.js";

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
  assert.ok(types.includes("add_to_cart"));

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

test("24. MultimodalVisionAgent invokes Hugging Face router with Qwen3-VL-4B-Instruct", async () => {
  let requestedUrl = "";
  let requestedHeaders = {};
  let requestedBody = null;

  const mockFetch = async (url, opts) => {
    requestedUrl = url;
    requestedHeaders = opts.headers;
    requestedBody = JSON.parse(opts.body);

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                observation: "Found search field via Qwen3-VL vision",
                goal_progress: { isSatisfied: false },
                next_task: "Enter search query",
                action: {
                  actionType: "TYPE",
                  target: "el_input_search",
                  parameters: { text: "white sneakers" },
                  thenPressEnter: true,
                  reasoningSummary: "Qwen3-VL planned search"
                }
              })
            }
          }
        ]
      })
    };
  };

  const result = await MultimodalVisionAgent.reason({
    apiKey: "hf_sample_token_12345",
    model: "Qwen/Qwen3-VL-4B-Instruct",
    provider: "huggingface",
    goal: GoalParser.parse("Search for white sneakers"),
    currentTask: { type: "search", description: "Search for white sneakers" },
    executionState: {},
    interactiveElements: [{ elementId: "el_input_search", tag: "input", type: "search" }],
    fetchClient: mockFetch
  });

  assert.strictEqual(requestedUrl, "https://router.huggingface.co/v1/chat/completions");
  assert.strictEqual(requestedHeaders.Authorization, "Bearer hf_sample_token_12345");
  assert.strictEqual(requestedBody.model, "Qwen/Qwen3-VL-4B-Instruct");
  assert.strictEqual(result.action.actionType, "TYPE");
  assert.strictEqual(result.action.target, "el_input_search");
  assert.strictEqual(result.action.parameters.text, "white sneakers");
  assert.strictEqual(result.action.thenPressEnter, true);
});

test("25. GoalCompletionChecker rejects premature completion when search has not been executed", () => {
  const goal = GoalParser.parse("search for white nike shoes under 8000");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  // Only an unrelated click occurred, no search was ever executed
  const checkRes = GoalCompletionChecker.check({
    goal,
    stateManager,
    planner,
    actionHistory: ["Step 1: [CLICK] on el_128 (close_modal)"]
  });

  assert.strictEqual(checkRes.isSatisfied, false);
  assert.strictEqual(checkRes.completed, false);
  assert.ok(checkRes.missingRequirements.some(r => r.includes("Search") || r.includes("Pending required task")));
});

test("26. InteractiveElementRegistry tags sponsored ads and filter facets properly", () => {
  // Sponsored ad card
  const adEl = {
    tagName: "A",
    text: "SHOEGR Cleaner Kit with Spray for White Shoes",
    closest: (selector) => selector.includes("sponsored") ? {} : null,
    getAttribute: (name) => name === "href" ? "https://amazon.in/dp/B001?pd_rd_w=123" : null
  };
  const adDesc = extractElementDescription(adEl, "el_ad_1");
  assert.strictEqual(adDesc.isSponsored, true);
  assert.strictEqual(adDesc.isAd, true);

  // Price input in filter sidebar
  const priceInputEl = {
    tagName: "INPUT",
    getAttribute: (name) => {
      if (name === "type") return "text";
      if (name === "name") return "high-price";
      if (name === "id") return "high-price";
      if (name === "placeholder") return "Max";
      return null;
    },
    closest: (selector) => selector.includes("s-refinements") ? {} : null
  };
  const priceDesc = extractElementDescription(priceInputEl, "el_price_1");
  assert.strictEqual(priceDesc.isFilter, true);
  assert.strictEqual(priceDesc.isMaxPriceInput, true);
  assert.strictEqual(priceDesc.filterCategory, "price");
});

test("27. deriveGeneralizedFallbackAction prioritizes price input and strictly ignores sponsored ads", () => {
  const goal = GoalParser.parse("search for white nike shoes under 8000");
  const planner = new TaskPlanner(goal);
  const stateManager = new ExecutionStateManager({ goal });

  // Simulate currently in filter task
  const currentTask = {
    id: "task_3",
    type: "filter",
    description: "Locate and apply filters matching constraints"
  };

  const interactiveElements = [
    // Element 1: An ad titled "White Shoes Cleaner" (like el_391 in real trace)
    {
      elementId: "el_ad_391",
      tag: "a",
      text: "SHOEGR Sneaker Cleaner Kit for White Shoes",
      isSponsored: true,
      isAd: true
    },
    // Element 2: The high-price input field
    {
      elementId: "el_price_max",
      tag: "input",
      type: "text",
      name: "high-price",
      placeholder: "Max",
      isFilter: true,
      isMaxPriceInput: true,
      filterCategory: "price"
    },
    // Element 3: Color filter checkbox
    {
      elementId: "el_color_white",
      tag: "input",
      type: "checkbox",
      text: "White",
      isFilter: true,
      filterCategory: "color"
    }
  ];

  const action = deriveGeneralizedFallbackAction({
    currentTask,
    goal,
    interactiveElements,
    stateManager,
    stepNum: 2
  });

  // Must NOT target the ad
  assert.notStrictEqual(action.target, "el_ad_391");
  // Must prioritize the price input over generic color matching
  assert.strictEqual(action.target, "el_price_max");
  assert.strictEqual(action.actionType, "TYPE");
  assert.strictEqual(action.parameters.text, "8000");
  assert.strictEqual(action.thenPressEnter, true);
  assert.strictEqual(action.isFilter, true);
  assert.strictEqual(action.filterName, "price");
});

// =====================================================================
// 8. UNIVERSAL MULTI-WEBSITE & MULTI-DOMAIN TESTS
// =====================================================================

test("28. extractNavigationUrl strictly stays on current active tab and never forces Amazon redirect", () => {
  const goal = GoalParser.parse("buy white sneakers under 5000");

  // User is already on Myntra
  const urlOnMyntra = extractNavigationUrl("buy white sneakers under 5000", "https://www.myntra.com/shoes", goal);
  assert.strictEqual(urlOnMyntra, null, "Must stay on Myntra without redirecting to Amazon");

  // User is on a local form page
  const urlOnLocalhost = extractNavigationUrl("fill out the registration form", "http://localhost:3000/register.html", GoalParser.parse("fill out the registration form"));
  assert.strictEqual(urlOnLocalhost, null, "Must stay on local form without redirecting");

  // User is on Nike's website
  const urlOnNike = extractNavigationUrl("find running shoes under 7000", "https://www.nike.com/in/", goal);
  assert.strictEqual(urlOnNike, null, "Must stay on Nike without redirecting to Amazon");
});

test("29. extractNavigationUrl navigates accurately to requested platforms and URLs", () => {
  // Explicit website requests from internal newtab
  const wikiNav = extractNavigationUrl("search on wikipedia for quantum computing", "chrome://newtab", GoalParser.parse("search on wikipedia for quantum computing"));
  assert.strictEqual(wikiNav, "https://www.wikipedia.org");

  const flipkartNav = extractNavigationUrl("open flipkart and search for noise cancelling headphones", "chrome://newtab", GoalParser.parse("open flipkart and search for noise cancelling headphones"));
  assert.strictEqual(flipkartNav, "https://www.flipkart.com");

  const githubNav = extractNavigationUrl("navigate to github.com and find tensorflow", "chrome://newtab", GoalParser.parse("navigate to github.com and find tensorflow"));
  assert.strictEqual(githubNav, "https://github.com");

  const googleNav = extractNavigationUrl("search on google for machine learning news", "chrome://newtab", GoalParser.parse("search on google for machine learning news"));
  assert.strictEqual(googleNav, "https://www.google.com");

  // Explicit full URL
  const directNav = extractNavigationUrl("open https://news.ycombinator.com and read top story", "chrome://newtab", GoalParser.parse("open https://news.ycombinator.com and read top story"));
  assert.strictEqual(directNav, "https://news.ycombinator.com");

  // Raw domain on internal tab
  const rawDomainNav = extractNavigationUrl("cnn.com latest headlines", "chrome://newtab/", GoalParser.parse("cnn.com latest headlines"));
  assert.strictEqual(rawDomainNav, "https://cnn.com");

  // Fallback to Google on internal newtab for general query
  const fallbackNav = extractNavigationUrl("what is quantum computing", "edge://newtab", GoalParser.parse("what is quantum computing"));
  assert.strictEqual(fallbackNav, "https://www.google.com");
});

test("30. deriveGeneralizedFallbackAction handles Google search with textarea[name='q'] and cleans query", () => {
  const goal = GoalParser.parse("search on google for autonomous browser agents");
  const stateManager = new ExecutionStateManager({ goal });

  const currentTask = {
    id: "task_1",
    type: "search",
    description: "Search for autonomous browser agents"
  };

  const interactiveElements = [
    {
      elementId: "el_google_q",
      tag: "textarea",
      name: "q",
      id: "APjFqb",
      placeholder: "Search Google or type a URL",
      semanticType: "search"
    }
  ];

  const action = deriveGeneralizedFallbackAction({
    currentTask,
    goal,
    interactiveElements,
    stateManager,
    stepNum: 1
  });

  assert.strictEqual(action.actionType, "TYPE");
  assert.strictEqual(action.target, "el_google_q");
  assert.strictEqual(action.parameters.text, "autonomous browser agents");
  assert.strictEqual(action.thenPressEnter, true);
});

test("31. deriveGeneralizedFallbackAction populates form fields using extracted constraints and semantic types", () => {
  const goal = GoalParser.parse("Fill out contact form with email test@example.com, name Alice Smith, and phone 9876543210");
  const stateManager = new ExecutionStateManager({ goal });

  const currentTask = {
    id: "task_1",
    type: "fill_form",
    description: "Fill form fields"
  };

  // Step 1: Populates name
  const elementsStep1 = [
    { elementId: "el_name", tag: "input", type: "text", name: "full_name", placeholder: "Your Name", semanticType: "name", value: "" },
    { elementId: "el_email", tag: "input", type: "email", name: "user_email", placeholder: "Email", semanticType: "email", value: "" }
  ];

  const action1 = deriveGeneralizedFallbackAction({
    currentTask,
    goal,
    interactiveElements: elementsStep1,
    stateManager,
    stepNum: 1
  });

  assert.strictEqual(action1.actionType, "TYPE");
  assert.strictEqual(action1.target, "el_name");
  assert.strictEqual(action1.parameters.text, "Alice Smith");

  // Step 2: Once name is filled, populates email
  const elementsStep2 = [
    { elementId: "el_name", tag: "input", type: "text", name: "full_name", semanticType: "name", value: "Alice Smith" },
    { elementId: "el_email", tag: "input", type: "email", name: "user_email", placeholder: "Email", semanticType: "email", value: "" }
  ];

  const action2 = deriveGeneralizedFallbackAction({
    currentTask,
    goal,
    interactiveElements: elementsStep2,
    stateManager,
    stepNum: 2
  });

  assert.strictEqual(action2.actionType, "TYPE");
  assert.strictEqual(action2.target, "el_email");
  assert.strictEqual(action2.parameters.text, "test@example.com");
});

test("32. deriveGeneralizedFallbackAction checks agreement checkboxes and clicks submit on forms", () => {
  const goal = GoalParser.parse("complete registration form and submit");
  const stateManager = new ExecutionStateManager({ goal });

  const currentTask = {
    id: "task_2",
    type: "fill_form",
    description: "Complete form and submit"
  };

  // When text inputs are filled, checks the terms checkbox
  const elementsWithCheckbox = [
    { elementId: "el_name", tag: "input", type: "text", value: "Alice" },
    { elementId: "el_agree", tag: "input", type: "checkbox", name: "agree_terms", checked: false, ariaLabel: "I agree to Terms & Conditions" }
  ];

  const actionCheckbox = deriveGeneralizedFallbackAction({
    currentTask,
    goal,
    interactiveElements: elementsWithCheckbox,
    stateManager,
    stepNum: 2
  });

  assert.strictEqual(actionCheckbox.actionType, "CHECK");
  assert.strictEqual(actionCheckbox.target, "el_agree");

  // When all inputs are checked, advances to submit
  const elementsReadyToSubmit = [
    { elementId: "el_name", tag: "input", type: "text", value: "Alice" },
    { elementId: "el_agree", tag: "input", type: "checkbox", name: "agree_terms", checked: true },
    { elementId: "el_submit_btn", tag: "button", type: "submit", text: "Submit Registration" }
  ];

  const actionSubmit = deriveGeneralizedFallbackAction({
    currentTask: { type: "submit_form", description: "Submit form" },
    goal,
    interactiveElements: elementsReadyToSubmit,
    stateManager,
    stepNum: 3
  });

  assert.strictEqual(actionSubmit.actionType, "CLICK");
  assert.strictEqual(actionSubmit.target, "el_submit_btn");
});

test("33. TaskPlanner produces domain-tailored execution plans for diverse tasks", () => {
  // 1. Form Filling Plan
  const formGoal = GoalParser.parse("Fill out job application form and submit");
  const formPlanner = new TaskPlanner(formGoal);
  const formTypes = formPlanner.tasks.map(t => t.type);
  assert.deepStrictEqual(formTypes, ["fill_form", "submit_form", "verify_goal"]);

  // 2. Research / Knowledge Retrieval Plan
  const researchGoal = GoalParser.parse("Search wikipedia for quantum computing and read summary");
  const researchPlanner = new TaskPlanner(researchGoal);
  const researchTypes = researchPlanner.tasks.map(t => t.type);
  assert.deepStrictEqual(researchTypes, ["navigate", "search", "select_candidate", "verify_goal"]);

  // 3. Navigation Plan
  const navGoal = GoalParser.parse("Go to https://github.com and inspect page");
  const navPlanner = new TaskPlanner(navGoal);
  const navTypes = navPlanner.tasks.map(t => t.type);
  assert.deepStrictEqual(navTypes, ["navigate", "inspect", "verify_goal"]);

  // 4. E-commerce Shopping Plan (includes initial navigate if starting from blank tab)
  const shopGoal = GoalParser.parse("Buy white running shoes under 5000 and add to cart");
  const shopPlanner = new TaskPlanner(shopGoal);
  const shopTypes = shopPlanner.tasks.map(t => t.type);
  assert.deepStrictEqual(shopTypes, ["navigate", "search", "filter", "select_candidate", "add_to_cart", "verify_goal"]);

  // 5. Generic UI Action Plan (e.g. subscribe / follow / bookmark)
  const actionGoal = GoalParser.parse("Open youtube and search for joshua weissman and subscribe");
  const actionPlanner = new TaskPlanner(actionGoal);
  const actionTypes = actionPlanner.tasks.map(t => t.type);
  assert.deepStrictEqual(actionTypes, ["navigate", "search", "select_candidate", "perform_action", "verify_goal"]);
});

test("34. MultimodalVisionAgent uses HUGGINGFACE_API_KEY / HF_TOKEN from env when no apiKey provided", async () => {
  let requestedUrl = "";
  let requestedAuth = "";

  const mockFetch = async (url, opts) => {
    requestedUrl = url;
    requestedAuth = opts.headers["Authorization"];
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                observation: "Fallback Hugging Face token successful",
                goal_progress: { isSatisfied: true },
                action: { actionType: "DONE", reasoningSummary: "Task completed" }
              })
            }
          }
        ]
      })
    };
  };

  const prevHfKey = process.env.HUGGINGFACE_API_KEY;
  const prevHfToken = process.env.HF_TOKEN;
  try {
    process.env.HUGGINGFACE_API_KEY = "hf_env_token_from_dotenv_99999";
    delete process.env.HF_TOKEN;

    const result = await MultimodalVisionAgent.reason({
      apiKey: "", // empty - user did not provide token in extension
      goal: GoalParser.parse("Test env token fallback"),
      fetchClient: mockFetch
    });

    assert.strictEqual(requestedUrl, "https://router.huggingface.co/v1/chat/completions");
    assert.strictEqual(requestedAuth, "Bearer hf_env_token_from_dotenv_99999");
    assert.strictEqual(result.action.actionType, "DONE");
  } finally {
    if (prevHfKey !== undefined) process.env.HUGGINGFACE_API_KEY = prevHfKey;
    else delete process.env.HUGGINGFACE_API_KEY;
    if (prevHfToken !== undefined) process.env.HF_TOKEN = prevHfToken;
    else delete process.env.HF_TOKEN;
  }
});

