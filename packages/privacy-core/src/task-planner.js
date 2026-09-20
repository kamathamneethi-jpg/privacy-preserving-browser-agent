/**
 * Dynamic Task Planner Module.
 * Decomposes high-level structured goals into dynamic, manageable sub-tasks.
 *
 * Invariant: Tasks are NOT a rigid fixed sequence. The planner maintains task state
 * and allows tasks to be dynamically inserted, skipped, reordered, or branched
 * based on live browser observations and replanning events.
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
  constructor(goalSpec = {}) {
    this.goalSpec = goalSpec;
    this.plan = Object.keys(goalSpec).length > 0 ? TaskPlanner.generateInitialPlan(goalSpec) : [];
    this.currentTaskIndex = 0;
  }

  get tasks() {
    return this.plan;
  }

  set tasks(val) {
    this.plan = val;
  }

  /**
   * Generates an initial task plan from a structured goal.
   * Adapts dynamically to the domain and requested operations.
   *
   * @param {object} goalSpec - Output of GoalParser.parse()
   * @returns {Array<object>} Initial task plan
   */
  static generateInitialPlan(goalSpec) {
    const tasks = [];
    let counter = 1;

    const domain = goalSpec.domain || TASK_DOMAINS.GENERAL;
    const ops = new Set(goalSpec.operations || goalSpec.required_operations || []);
    const constraints = goalSpec.constraints || [];
    const targetEntity = goalSpec.targetEntity || "item";

    // 1. Navigation / Search Destination Task
    if (ops.has(BROWSER_OPERATIONS.NAVIGATE) || goalSpec.targetWebsite || (!goalSpec.currentUrl && domain !== TASK_DOMAINS.FORM_FILLING)) {
      tasks.push({
        id: `task_${counter++}`,
        type: "navigate",
        description: `Navigate to appropriate website for ${targetEntity}`,
        status: TASK_STATUS.PENDING
      });
    }

    // 2. Query / Search Input Task (Ecommerce, Research, or explicitly requested search)
    if (ops.has(BROWSER_OPERATIONS.SEARCH) || domain === TASK_DOMAINS.ECOMMERCE || domain === TASK_DOMAINS.RESEARCH) {
      tasks.push({
        id: `task_${counter++}`,
        type: "search",
        description: `Locate search bar and enter query for "${targetEntity}"`,
        status: TASK_STATUS.PENDING
      });
    }

    // 3. Filter Application Task (if filterable constraints exist, mainly ecommerce or faceted search)
    const hasFilterableConstraints = constraints.some(c => c.name !== "url" && c.name !== "candidate_count" && c.attribute !== "url");
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
    if (domain === TASK_DOMAINS.NAVIGATION) {
      tasks.push({
        id: `task_${counter++}`,
        type: "inspect",
        description: `Inspect target page elements and verify content`,
        status: TASK_STATUS.PENDING
      });
    } else if (ops.has(BROWSER_OPERATIONS.INSPECT) || domain === TASK_DOMAINS.ECOMMERCE || domain === TASK_DOMAINS.RESEARCH) {
      tasks.push({
        id: `task_${counter++}`,
        type: "select_candidate",
        description: domain === TASK_DOMAINS.RESEARCH ? `Inspect primary article or search result for "${targetEntity}"` : `Inspect visible candidate results and verify attributes`,
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

    // 7. Final Action Task (submit form, add to cart, book)
    if (domain === TASK_DOMAINS.FORM_FILLING || ops.has(BROWSER_OPERATIONS.SUBMIT) || ops.has(BROWSER_OPERATIONS.ADD_TO_CART) || ops.has(BROWSER_OPERATIONS.SUBMIT_FORM) || /add to cart|buy|submit|book/i.test(goalSpec.rawRequest || goalSpec.originalGoal || "")) {
      const isCart = ops.has(BROWSER_OPERATIONS.ADD_TO_CART) || /add to cart|buy/i.test(goalSpec.rawRequest || goalSpec.originalGoal || "");
      const isForm = domain === TASK_DOMAINS.FORM_FILLING || ops.has(BROWSER_OPERATIONS.SUBMIT_FORM);
      tasks.push({
        id: `task_${counter++}`,
        type: isForm ? "submit_form" : (isCart ? "perform_action" : "submit"),
        description: isForm ? "Submit completed form" : (isCart ? "Add selected item to cart" : "Execute requested final action"),
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
   * Initializes the planner with a goal specification.
   */
  initialize(goalSpec) {
    this.goalSpec = goalSpec;
    this.plan = TaskPlanner.generateInitialPlan(goalSpec);
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
