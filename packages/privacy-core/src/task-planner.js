/**
 * Dynamic Task Planner Module.
 * Decomposes high-level structured goals into dynamic, manageable sub-tasks.
 *
 * Invariants:
 * 1. Current-Page-First: If the user is on an active web page and did not request explicit navigation,
 *    the planner operates directly inside the current browser context.
 * 2. Extensible Semantics: Operates on generic capabilities and semantic roles, never hardcoded domains.
 * 3. Dynamic Replanning: Tasks are NOT a rigid fixed sequence. The planner allows tasks to be
 *    inserted, skipped, reordered, or branched based on live browser observations.
 */

import { BROWSER_OPERATIONS, TASK_DOMAINS } from "./goal-parser.js";

export const TASK_STATUS = Object.freeze({
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  FAILED: "failed"
});

export class TaskPlanner {
  constructor(goalSpec = {}, currentBrowserContext = {}) {
    this.goalSpec = goalSpec;
    this.currentBrowserContext = currentBrowserContext;
    this.plan = Object.keys(goalSpec).length > 0 ? TaskPlanner.generateInitialPlan(goalSpec, currentBrowserContext) : [];
    this.currentTaskIndex = 0;
  }

  get tasks() {
    return this.plan;
  }

  set tasks(val) {
    this.plan = val;
  }

  /**
   * Generates an initial task plan from a structured goal and active browser context.
   * Adapts dynamically to page capabilities and requested operations.
   *
   * @param {object} goalSpec - Output of GoalParser.parse()
   * @param {object} [currentBrowserContext={}] - Live browser context ({ url, title, isInternalPage, pageCapabilities })
   * @returns {Array<object>} Initial task plan
   */
  static generateInitialPlan(goalSpec, currentBrowserContext = {}) {
    const tasks = [];
    let counter = 1;

    const domain = goalSpec.domain || TASK_DOMAINS.GENERAL;
    const ops = new Set(goalSpec.operations || goalSpec.required_operations || []);
    const constraints = goalSpec.constraints || [];
    const targetEntity = goalSpec.targetEntity || "item";
    const selection = goalSpec.selection || null;
    const entities = goalSpec.entities || [];
    const navigation = goalSpec.navigation || {};

    const isInternalPage = Boolean(
      currentBrowserContext.isInternalPage ||
      (!currentBrowserContext.url && !goalSpec.currentUrl) ||
      (currentBrowserContext.url && (currentBrowserContext.url.startsWith("chrome://") || currentBrowserContext.url.startsWith("about:") || currentBrowserContext.url.startsWith("chrome-extension://")))
    );

    // 1. Navigation Task:
    // Strictly ONLY when user explicitly requested navigation OR when starting from an empty/internal browser tab
    const requiresExplicitNav = Boolean(navigation.requiresExplicitNavigation || navigation.isExplicit);
    const requiresBlankTabNav = isInternalPage && domain !== TASK_DOMAINS.FORM_FILLING && !goalSpec.currentUrl;

    if (requiresExplicitNav || requiresBlankTabNav || ops.has(BROWSER_OPERATIONS.NAVIGATE)) {
      tasks.push({
        id: `task_${counter++}`,
        type: "navigate",
        description: `Navigate to appropriate website for ${targetEntity}`,
        status: TASK_STATUS.PENDING,
        metadata: {
          destination: navigation.destinationKeyword || goalSpec.targetWebsite || null,
          targetUrl: navigation.targetUrl || null
        }
      });
    }

    // 2. Query / Search Input Task:
    // Triggered when user explicitly instructed search, OR when domain is ecommerce/research and no direct item selection was specified
    const hasDirectItemSelection = Boolean(selection || entities.some(e => e.candidateRoles?.includes("sender") || e.candidateRoles?.includes("author")));
    const shouldSearch = ops.has(BROWSER_OPERATIONS.SEARCH) && (!hasDirectItemSelection || /search|query|find\s+information/i.test(goalSpec.rawRequest || ""));

    if (shouldSearch) {
      tasks.push({
        id: `task_${counter++}`,
        type: "search",
        description: `Locate search bar and enter query for "${targetEntity}"`,
        status: TASK_STATUS.PENDING
      });
    }

    // 3. Filter Application Task (if filterable constraints exist)
    const hasFilterableConstraints = constraints.some(c => c.name !== "url" && c.name !== "candidate_count" && c.attribute !== "url" && c.name !== "sender" && c.name !== "author");
    if (ops.has(BROWSER_OPERATIONS.FILTER) && hasFilterableConstraints && domain !== TASK_DOMAINS.FORM_FILLING && domain !== TASK_DOMAINS.NAVIGATION) {
      const constraintDesc = constraints.map(c => `${c.attribute || c.name} ${c.operator} ${c.value}`).join(", ");
      tasks.push({
        id: `task_${counter++}`,
        type: "filter",
        description: `Locate and apply filters matching constraints: [${constraintDesc}]`,
        status: TASK_STATUS.PENDING
      });
    }

    // 4. Form Filling Task (if form domain)
    if (domain === TASK_DOMAINS.FORM_FILLING || ops.has(BROWSER_OPERATIONS.FILL) || ops.has(BROWSER_OPERATIONS.FILL_FORM)) {
      tasks.push({
        id: `task_${counter++}`,
        type: "fill_form",
        description: `Fill out required form fields with relevant context`,
        status: TASK_STATUS.PENDING
      });
    }

    // 5. Inspect / Select Candidate Results Task
    if (hasDirectItemSelection || ops.has(BROWSER_OPERATIONS.SEARCH) || domain === TASK_DOMAINS.ECOMMERCE || domain === TASK_DOMAINS.RESEARCH) {
      let desc = `Inspect visible candidate results and verify attributes`;
      if (selection?.ordinal) {
        desc = `Locate and select ${selection.ordinal} ${targetEntity} matching constraints`;
      } else if (entities.length > 0) {
        const entDesc = entities.map(e => `${e.preposition || 'matching'} ${e.text}`).join(" ");
        desc = `Locate and select ${targetEntity} ${entDesc}`;
      } else if (domain === TASK_DOMAINS.RESEARCH || ops.has(BROWSER_OPERATIONS.SEARCH)) {
        desc = `Inspect primary article or search result for "${targetEntity}"`;
      }

      tasks.push({
        id: `task_${counter++}`,
        type: "select_candidate",
        description: desc,
        status: TASK_STATUS.PENDING,
        metadata: {
          selection,
          entities,
          constraints
        }
      });
    } else if (domain === TASK_DOMAINS.NAVIGATION || ops.has(BROWSER_OPERATIONS.INSPECT)) {
      tasks.push({
        id: `task_${counter++}`,
        type: "inspect",
        description: `Inspect target page elements and verify content`,
        status: TASK_STATUS.PENDING
      });
    }

    // 6. Comparison Task (if user requested comparison)
    if (ops.has(BROWSER_OPERATIONS.COMPARE) || ops.has(BROWSER_OPERATIONS.COMPARE_CANDIDATES)) {
      tasks.push({
        id: `task_${counter++}`,
        type: "compare",
        description: `Compare inspected candidates against user constraints and select best matching options`,
        status: TASK_STATUS.PENDING
      });
    }

    // 7. Final Action Task (perform_action, submit form, add to cart, book)
    const actionVerb = goalSpec.actionIntent ? String(goalSpec.actionIntent).toLowerCase() : null;
    const isDirectOpenOnly = (actionVerb === "open" || actionVerb === "read" || actionVerb === "view") && hasDirectItemSelection;

    if ((ops.has(BROWSER_OPERATIONS.PERFORM_ACTION) || goalSpec.actionIntent) && !isDirectOpenOnly && domain !== TASK_DOMAINS.FORM_FILLING) {
      const intent = goalSpec.actionIntent || "action";
      tasks.push({
        id: `task_${counter++}`,
        type: "perform_action",
        actionIntent: intent,
        description: `Execute requested action: ${intent} for ${targetEntity}`,
        status: TASK_STATUS.PENDING
      });
    } else if (domain === TASK_DOMAINS.FORM_FILLING || ops.has(BROWSER_OPERATIONS.SUBMIT) || ops.has(BROWSER_OPERATIONS.ADD_TO_CART) || ops.has(BROWSER_OPERATIONS.SUBMIT_FORM) || /add to cart|buy|submit|book|confirm/i.test(goalSpec.rawRequest || goalSpec.originalGoal || "")) {
      const isCart = ops.has(BROWSER_OPERATIONS.ADD_TO_CART) || /add to cart|add to bag|add to basket/i.test(goalSpec.rawRequest || goalSpec.originalGoal || "");
      const isForm = domain === TASK_DOMAINS.FORM_FILLING || ops.has(BROWSER_OPERATIONS.SUBMIT_FORM);
      tasks.push({
        id: `task_${counter++}`,
        type: isCart ? "add_to_cart" : (isForm ? "submit_form" : "submit"),
        actionIntent: goalSpec.actionIntent || (isCart ? "add_to_cart" : (isForm ? "submit" : "action")),
        description: isCart ? "Add selected item to cart" : (isForm ? (goalSpec.actionIntent ? `Submit or confirm form action: ${goalSpec.actionIntent}` : "Submit completed form") : "Execute requested final action"),
        status: TASK_STATUS.PENDING
      });
    }

    // 8. Goal Verification & Summary
    tasks.push({
      id: `task_${counter++}`,
      type: "verify_goal",
      description: `Verify all constraints are met and formulate final response`,
      status: TASK_STATUS.PENDING
    });

    return tasks;
  }

  /**
   * Initializes the planner with a goal specification and optional browser context.
   */
  initialize(goalSpec, currentBrowserContext = {}) {
    this.goalSpec = goalSpec;
    this.currentBrowserContext = currentBrowserContext;
    this.plan = TaskPlanner.generateInitialPlan(goalSpec, currentBrowserContext);
    this.currentTaskIndex = 0;
  }

  /**
   * Returns the current active task.
   */
  getCurrentTask() {
    if (this.currentTaskIndex >= 0 && this.currentTaskIndex < this.plan.length) {
      return this.plan[this.currentTaskIndex];
    }
    return null;
  }

  /**
   * Marks current task complete and advances to the next pending task.
   */
  completeCurrentTask(resultSummary = "") {
    const current = this.getCurrentTask();
    if (current) {
      current.status = TASK_STATUS.COMPLETED;
      current.resultSummary = resultSummary;
    }

    this.currentTaskIndex++;
  }

  /**
   * Inserts an immediate task right before the current task (e.g., handle modal or select category).
   */
  insertImmediateTask(task = {}) {
    const insertIdx = this.currentTaskIndex;
    const newTask = {
      id: `task_dyn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: task.type || "adaptive_step",
      description: task.description || "Adaptive browser step",
      status: TASK_STATUS.PENDING,
      metadata: task.metadata || { targetId: task.targetId },
      reason: task.reason || "Replanned due to browser observation"
    };

    this.plan.splice(insertIdx, 0, newTask);
    return newTask;
  }

  /**
   * Replaces remaining pending tasks with a newly replanned sequence.
   */
  replanPlan(newTasks = []) {
    const completed = this.plan.slice(0, this.currentTaskIndex);
    const formatted = newTasks.map((t, idx) => ({
      id: `task_replan_${idx + 1}`,
      type: t.type || "step",
      description: t.description || "Step",
      status: TASK_STATUS.PENDING,
      metadata: t.metadata || {},
      ...t
    }));

    this.plan = [...completed, ...formatted];
    this.currentTaskIndex = completed.length;
  }

  replanRemaining(newTasks = []) {
    this.replanPlan(newTasks);
  }

  /**
   * Returns serializable summary of the task plan.
   */
  getPlanSummary() {
    const completed = this.plan.filter(t => t.status === TASK_STATUS.COMPLETED);
    const pending = this.plan.filter(t => t.status !== TASK_STATUS.COMPLETED);
    return {
      totalTasks: this.plan.length,
      completedTasks: completed.length,
      pendingTasks: pending.length,
      currentTask: this.getCurrentTask(),
      tasks: [...this.plan]
    };
  }

  getPlanSnapshot() {
    return this.getPlanSummary();
  }
}

