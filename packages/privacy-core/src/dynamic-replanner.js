/**
 * Dynamic Replanner Module.
 * Analyzes browser observations, obstacles, and execution progress to adapt the task plan dynamically.
 *
 * Inviolable Invariant:
 * The agent must NEVER silently relax an explicit user constraint.
 * (e.g. If user specifies "under $150", candidates > $150 are NEVER accepted as fulfilling the constraint).
 */

export class DynamicReplanner {
  /**
   * Evaluates current observation and execution state to determine if replanning is required.
   * Supports both object-style options or dual arguments (observation, executionState).
   */
  static evaluate(arg1, arg2 = {}) {
    if (!arg1) return null;

    let interactiveElements = [];
    let pageTitle = "";
    let pageUrl = "";
    let currentTask = null;
    let goal = null;
    let consecutiveFailures = 0;
    let actionHistory = [];
    let isOverlayOrModal = false;
    let zeroResults = false;

    if (arg1.domElements || arg1.currentTask || arg1.pageUrl || arg1.goal) {
      interactiveElements = arg1.domElements || [];
      pageTitle = arg1.pageTitle || "";
      pageUrl = arg1.pageUrl || "";
      currentTask = arg1.currentTask || null;
      goal = arg1.goal || null;
      consecutiveFailures = arg1.consecutiveFailures || 0;
      actionHistory = arg1.actionHistory || [];
    } else {
      interactiveElements = arg1.interactiveElements || [];
      pageTitle = arg2.browserState?.title || "";
      pageUrl = arg2.browserState?.url || "";
      currentTask = arg2.currentTask || null;
      goal = arg2.goal || null;
      consecutiveFailures = arg2.consecutiveFailures || 0;
      actionHistory = arg2.actionHistory || [];
      isOverlayOrModal = Boolean(arg1.isOverlayOrModal);
      zeroResults = Boolean(arg1.zeroResults);
    }

    // 1. Detect Modal Dialogs / Cookie Consent / Popups blocking the page
    const isModalDetected = isOverlayOrModal ||
      interactiveElements.some(el => {
        const t = (el.text || "").toLowerCase();
        return /\b(cookie policy|we use cookies|privacy preferences|sign up for|subscribe to our newsletter|accept all cookies|cookie consent)\b/i.test(t);
      });

    let modalCloseBtn = null;
    if (isModalDetected) {
      modalCloseBtn = interactiveElements.find(el => {
        // Exclude hidden or invisible zero-size elements
        if (el.bbox && (el.bbox.width <= 0 || el.bbox.height <= 0)) return false;
        const text = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
        const isCloseText = /\b(close|dismiss|agree|accept all|accept cookies|got it|not now|skip|continue without|decline)\b/i.test(text) ||
          (el.tag === "button" && el.text === "×") ||
          (el.attributes && /close/i.test(el.attributes["aria-label"] || ""));
        return isCloseText && (el.tag === "button" || el.tag === "a" || el.role === "button" || !el.tag);
      });
    }

    if (modalCloseBtn && currentTask?.type !== "close_modal") {
      return {
        type: "modal_overlay",
        description: `Dismiss modal/popup by clicking "${modalCloseBtn.text || modalCloseBtn.ariaLabel || 'Close'}"`,
        targetId: modalCloseBtn.elementId,
        element: modalCloseBtn
      };
    }

    // 2. Detect Zero Search Results
    const zeroResultsFound = zeroResults ||
      interactiveElements.some(el => /\b(?:no results found|0 results|did not match any products|no matches found|try checking your spelling)\b/i.test(el.text || ""));

    if (zeroResultsFound) {
      return {
        type: "zero_results",
        description: "Zero results found matching current query and filters. Modifying search strategy.",
        strategy: "REFINE_QUERY_KEEP_CONSTRAINTS"
      };
    }

    // 3. Detect Category / Department Selection required
    const categorySelector = interactiveElements.find(el => {
      const text = (el.text || "").toLowerCase();
      return /\b(select a category|choose category|all departments|select department)\b/i.test(text);
    });

    if (categorySelector && currentTask?.type === "search") {
      return {
        type: "category_selector",
        description: "Website requires selecting a category before displaying results.",
        targetId: categorySelector.elementId
      };
    }

    // 4. Consecutive Failures Recovery
    if (consecutiveFailures >= 2) {
      return {
        type: "consecutive_failures",
        description: `Encountered ${consecutiveFailures} consecutive action failures. Adapting navigation strategy.`,
        failureCount: consecutiveFailures
      };
    }

    return null;
  }

  /**
   * Adapts the plan dynamically based on detected obstacles without relaxing constraints.
   *
   * @param {object} options - { obstacle, planner, stateManager, goal, domElements }
   * @returns {object} { replanned: boolean, reason: string, insertedTask?: object }
   */
  static replan({ obstacle, planner, stateManager, goal, domElements = [] }) {
    if (!obstacle || !planner) {
      return { replanned: false, reason: "Missing obstacle or planner specification." };
    }

    if (stateManager) {
      const maxReplans = stateManager.maxReplans || 5;
      if (stateManager.replanCount >= maxReplans) {
        return {
          replanned: false,
          reason: `Maximum replan budget (${maxReplans}) exceeded. Halting plan modification.`
        };
      }
      stateManager.replanCount = (stateManager.replanCount || 0) + 1;
    }

    // 1. Modal Overlay Dismissal
    if (obstacle.type === "modal_overlay") {
      const insertedTask = planner.insertImmediateTask({
        type: "close_modal",
        description: obstacle.description || "Dismiss modal overlay",
        metadata: { targetId: obstacle.targetId }
      });
      return {
        replanned: true,
        reason: `Inserted immediate task to dismiss modal dialog via ${obstacle.targetId}`,
        insertedTask
      };
    }

    // 2. Zero Results: Refine Query WITHOUT dropping user constraints
    if (obstacle.type === "zero_results") {
      const entity = goal?.targetEntity || "item";
      const insertedTask = planner.insertImmediateTask({
        type: "search",
        description: `Search for '${entity}' with refined keywords while strictly preserving all constraints`,
        metadata: {
          strategy: "REFINE_QUERY_KEEP_CONSTRAINTS",
          targetEntity: entity
        }
      });
      return {
        replanned: true,
        reason: "Zero search results detected. Inserted refined search task without relaxing constraints.",
        insertedTask
      };
    }

    // 3. Category Selector
    if (obstacle.type === "category_selector") {
      const insertedTask = planner.insertImmediateTask({
        type: "select_category",
        description: obstacle.description,
        metadata: { targetId: obstacle.targetId }
      });
      return {
        replanned: true,
        reason: "Inserted task to select required product category.",
        insertedTask
      };
    }

    // 4. Consecutive Failures Recovery
    if (obstacle.type === "consecutive_failures") {
      const insertedTask = planner.insertImmediateTask({
        type: "scroll",
        description: "Scroll viewport down to reveal additional actionable elements",
        metadata: { direction: "down", distance: 450 }
      });
      return {
        replanned: true,
        reason: "Recovering from consecutive failures by scrolling viewport.",
        insertedTask
      };
    }

    return {
      replanned: false,
      reason: `No adaptive strategy defined for obstacle type: ${obstacle.type}`
    };
  }
}
