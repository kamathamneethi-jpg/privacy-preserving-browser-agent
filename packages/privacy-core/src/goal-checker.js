/**
 * Goal Completion Checker Module.
 * Evaluates whether the user's original goal and explicit constraints have been satisfied.
 *
 * Invariant: Never flags completion prematurely just because an action (like search or click) succeeded.
 * Evaluates candidate data, constraint verification, and requested operations.
 */

import { CONSTRAINT_OPERATORS } from "./goal-parser.js";
import { TASK_STATUS } from "./task-planner.js";

export class GoalCompletionChecker {
  /**
   * Evaluates current execution state against original user goal and constraints.
   * Supports both:
   *   check({ goal, stateManager, planner, actionHistory, currentDomElements })
   *   check(goalSpec, executionState)
   *
   * @param {object} arg1 - Options object or goalSpec
   * @param {object} [arg2={}] - executionState if using dual arguments
   * @returns {object} { completed: boolean, isSatisfied: boolean, reason: string, missingRequirements: Array<string> }
   */
  static check(arg1 = {}, arg2 = {}) {
    let goal = {};
    let stateManager = {};
    let planner = null;
    let actionHistory = [];
    let candidates = [];
    let constraints = [];
    let operations = new Set();

    if (arg1.goal || arg1.stateManager || arg1.planner || arg1.actionHistory) {
      goal = arg1.goal || {};
      stateManager = arg1.stateManager || {};
      planner = arg1.planner || null;
      actionHistory = arg1.actionHistory || stateManager.actionHistory || [];
      candidates = stateManager.candidatesInspected || stateManager.candidateData || [];
      constraints = goal.constraints || [];
      operations = new Set(goal.operations || goal.required_operations || []);
    } else {
      goal = arg1 || {};
      stateManager = arg2 || {};
      actionHistory = stateManager.actionHistory || [];
      candidates = stateManager.candidateData || stateManager.candidatesInspected || [];
      constraints = goal.constraints || [];
      operations = new Set(goal.required_operations || goal.operations || []);
    }

    const missingRequirements = [];
    const goalText = `${goal.originalGoal || ""} ${goal.rawRequest || ""} ${goal.summary || ""}`.toLowerCase();

    // 1. If no actions were taken at all, task is not complete
    if (actionHistory.length === 0) {
      return {
        completed: false,
        isSatisfied: false,
        reason: "Execution has not started.",
        missingRequirements: ["Execute initial planned tasks"]
      };
    }

    // 2. Check if add to cart or buy was requested and performed
    const requiresCart = operations.has("add_to_cart") || /\b(?:add to cart|add to bag|buy|purchase)\b/i.test(goalText);
    if (requiresCart) {
      const cartActionExecuted = actionHistory.some(a => {
        const text = typeof a === "string" ? a : `${a.actionType || ""} ${a.reason || ""} ${a.target || ""}`;
        return /\b(?:add to cart|cart|bag|bought|purchased|checkout)\b/i.test(text);
      });
      if (!cartActionExecuted) {
        missingRequirements.push("Requested item has not been added to cart yet (add to cart action missing).");
      }
    }

    // 3. Check if form submission was requested and performed (only if NOT an add to cart task)
    const requiresSubmit = !requiresCart && (operations.has("submit_form") || operations.has("submit") || /\b(?:submit|register|book now|complete order)\b/i.test(goalText));
    if (requiresSubmit) {
      const submitExecuted = actionHistory.some(a => {
        const text = typeof a === "string" ? a : `${a.actionType || ""} ${a.reason || ""} ${a.target || ""}`;
        return /\b(?:submit|registered|booked|submitted form|order placed)\b/i.test(text) || (a.actionType === "SUBMIT");
      });
      if (!submitExecuted) {
        missingRequirements.push("Form submission or final action has not been executed yet.");
      }
    }

    // 4. Check if search was requested and performed
    const requiresSearch = operations.has("search") || goal.domain === "ecommerce" || /\b(?:search|find|look for)\b/i.test(goalText);
    if (requiresSearch) {
      const searchActionExecuted = actionHistory.some(a => {
        const text = typeof a === "string" ? a : `${a.actionType || ""} ${a.reason || ""} ${a.target || ""}`;
        return /\b(?:search|entered search|typed into search|field-keywords|searchbox|type)\b/i.test(text);
      });
      if (!searchActionExecuted) {
        missingRequirements.push("Search query has not been executed yet.");
      }
    }

    // 5. Check if comparison was requested and whether enough qualifying candidates exist
    const countConstraint = constraints.find(c => c.name === "candidate_count");
    const minCandidates = countConstraint ? countConstraint.value : (operations.has("compare") || /\bcompare\b/i.test(goalText) ? 2 : 1);
    if (minCandidates > 1 && candidates.length < minCandidates) {
      missingRequirements.push(`Comparison requires at least ${minCandidates} candidates (inspected ${candidates.length}).`);
    }

    // 6. Verify Constraints against Candidates if candidates exist
    if (constraints.length > 0 && candidates.length > 0) {
      let qualifyingCount = 0;
      for (const cand of candidates) {
        let matches = true;
        for (const c of constraints) {
          if (c.name === "candidate_count") continue;
          const val = cand[c.name] ?? cand[c.type] ?? cand[c.attribute];
          if (val !== undefined && val !== null) {
            if (c.operator === CONSTRAINT_OPERATORS.LESS_THAN_OR_EQUAL && Number(val) > Number(c.value)) matches = false;
            if (c.operator === CONSTRAINT_OPERATORS.GREATER_THAN_OR_EQUAL && Number(val) < Number(c.value)) matches = false;
            if (c.operator === CONSTRAINT_OPERATORS.EQUALS && String(val).toLowerCase() !== String(c.value).toLowerCase()) matches = false;
          } else if (cand.title && typeof cand.title === "string" && c.value) {
            // Check if title mentions constraint value (e.g. brand "Nike" in title "Nike Air Max")
            if (String(cand.title).toLowerCase().includes(String(c.value).toLowerCase())) {
              // Matches via title text
            }
          }
        }
        if (matches) qualifyingCount++;
      }
      if (qualifyingCount === 0 && candidates.some(cand => Object.keys(cand).length > 2)) {
        missingRequirements.push("No candidate currently satisfies all specified constraints.");
      }
    }

    // 7. Check if planner has remaining uncompleted required tasks
    if (planner && Array.isArray(planner.tasks)) {
      const pendingRequired = planner.tasks.filter(t => {
        const isDone = String(t.status).toLowerCase() === "completed" || t.status === TASK_STATUS.COMPLETED;
        return !isDone && (
          t.type === "search" ||
          t.type === "filter" ||
          t.type === "select_candidate" ||
          t.type === "fill_form" ||
          t.type === "perform_action" ||
          t.type === "submit_action" ||
          t.type === "submit"
        );
      });
      if (pendingRequired.length > 0) {
        missingRequirements.push(`Pending required task: ${pendingRequired[0].description || pendingRequired[0].type}`);
      }
    }

    const completed = missingRequirements.length === 0;

    return {
      completed,
      isSatisfied: completed,
      reason: completed
        ? "User goal and all constraints have been genuinely satisfied."
        : `Goal not fully satisfied: ${missingRequirements.join("; ")}`,
      missingRequirements,
      qualifyingCandidates: candidates
    };
  }
}
