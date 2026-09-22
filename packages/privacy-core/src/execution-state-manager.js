/**
 * Execution State Manager Module.
 * Maintains explicit execution state and safeguards against infinite loops and stalled execution.
 *
 * Tracks:
 * - Structured goal & constraints
 * - Dynamic task plan & progress
 * - Browser state (URL, title, sanitized DOM, screenshot metadata)
 * - Candidate items extracted / inspected
 * - Action history & failed action history
 * - Loop & stall detection (repeated identical actions, repeated URLs, repeated failures)
 */

export class ExecutionStateManager {
  constructor(initialGoal = {}) {
    this.goal = initialGoal.goal || initialGoal;
    this.constraints = initialGoal.constraints || [];
    this.domain = initialGoal.domain || "general";
    this.targetEntity = initialGoal.targetEntity || null;
    this.maxReplans = initialGoal.maxReplans || 5;
    this.maxConsecutiveFailures = initialGoal.maxConsecutiveFailures || 3;
    this.maxRepeatedActions = initialGoal.maxRepeatedActions || 3;

    this.replanCount = 0;
    this.consecutiveFailures = 0;
    this.relaxedConstraints = [];
    this.currentObservation = { url: "", title: "", domElements: [], hasScreenshot: false, piiCount: 0 };
    this.candidatesInspected = [];
    this.appliedFilters = [];
    this.actionHistory = [];
    this.failedActions = [];
    this.observations = [];

    // State object for compatibility
    this.state = {
      goal: this.goal,
      constraints: this.constraints,
      domain: this.domain,
      targetEntity: this.targetEntity,
      plan: [],
      currentTask: null,
      completedTasks: [],
      observations: this.observations,
      browserState: { url: "", title: "" },
      candidateData: this.candidatesInspected,
      actionHistory: this.actionHistory,
      failedActions: this.failedActions,
      replanCount: 0
    };
  }

  get candidateData() {
    return this.candidatesInspected;
  }

  set candidateData(val) {
    this.candidatesInspected = val;
    this.state.candidateData = val;
  }

  /**
   * Initializes state with goal and task plan.
   */
  initialize(goalSpec, initialPlan = []) {
    this.goal = goalSpec.goal || goalSpec.summary || "Perform browser task";
    this.constraints = goalSpec.constraints || [];
    this.domain = goalSpec.domain || "general";
    this.targetEntity = goalSpec.targetEntity || null;
    this.state.goal = this.goal;
    this.state.constraints = this.constraints;
    this.state.domain = this.domain;
    this.state.targetEntity = this.targetEntity;
    this.state.plan = initialPlan;
    this.state.currentTask = initialPlan[0] || null;
  }

  /**
   * Updates state with new page observation after a browser action.
   */
  updateObservation(observation = {}) {
    const prevUrl = this.currentObservation.url;
    const newUrl = observation.url || prevUrl;

    this.currentObservation = {
      url: newUrl,
      title: observation.title || this.currentObservation.title || "",
      domElements: observation.domElements || observation.interactiveElements || [],
      hasScreenshot: Boolean(observation.hasScreenshot || observation.screenshot),
      piiCount: observation.piiCount || 0
    };

    this.state.browserState = {
      url: newUrl,
      title: this.currentObservation.title,
      viewportWidth: observation.viewportWidth || 1280,
      viewportHeight: observation.viewportHeight || 800,
      interactiveElementsCount: this.currentObservation.domElements.length
    };

    this.observations.push({
      step: this.actionHistory.length + 1,
      timestamp: Date.now(),
      url: newUrl,
      title: this.currentObservation.title,
      summary: observation.summary || "Page observed."
    });
  }

  /**
   * Records a browser action outcome into the history and runs loop safeguards.
   */
  recordActionOutcome(actionRecord = {}) {
    const target = actionRecord.target || actionRecord.targetId || "page_root";
    const actionType = actionRecord.actionType || actionRecord.type || "CLICK";
    const ok = Boolean(actionRecord.ok);

    const record = {
      step: this.actionHistory.length + 1,
      timestamp: Date.now(),
      actionType,
      targetId: target,
      target,
      parameters: actionRecord.parameters || {},
      status: actionRecord.status || (ok ? "COMPLETED" : "FAILED_EXECUTION"),
      ok,
      reason: actionRecord.reason || "",
      error: actionRecord.error || null,
      taskType: actionRecord.taskType || null,
      actionIntent: actionRecord.actionIntent || null
    };

    this.actionHistory.push(record);

    if (!ok) {
      this.consecutiveFailures++;
      this.failedActions.push(record);
    } else {
      this.consecutiveFailures = 0;
    }

    const loopStatus = this.checkLoopSafeguards();
    return {
      ok,
      consecutiveFailures: this.consecutiveFailures,
      isLoopDetected: loopStatus.detected,
      loopReason: loopStatus.reason || null,
      detected: loopStatus.detected,
      type: loopStatus.type || null
    };
  }

  /**
   * Adds or updates inspected candidate items (e.g. products, search results, articles).
   */
  recordCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return;
    const existingIdx = this.candidatesInspected.findIndex(c =>
      (candidate.id && c.id === candidate.id) || (candidate.title && c.title === candidate.title)
    );
    if (existingIdx >= 0) {
      this.candidatesInspected[existingIdx] = { ...this.candidatesInspected[existingIdx], ...candidate };
    } else {
      this.candidatesInspected.push(candidate);
    }
  }

  /**
   * Records an applied filter constraint.
   */
  recordFilter(name, value) {
    if (!this.isFilterApplied(name, value)) {
      this.appliedFilters.push({
        name: String(name).toLowerCase(),
        value: String(value).toLowerCase()
      });
    }
  }

  /**
   * Checks if a filter has already been applied.
   */
  isFilterApplied(name, value) {
    const n = String(name || "").toLowerCase();
    const v = String(value || "").toLowerCase();
    return this.appliedFilters.some(f => f.name === n && (f.value === v || !value));
  }

  /**
   * Records a populated/updated form field constraint.
   */
  recordFieldFilled(name, value) {
    if (!this.filledFields) this.filledFields = [];
    this.filledFields.push({
      name: String(name || "").toLowerCase(),
      value: String(value || "").toLowerCase()
    });
  }

  /**
   * Checks if a field has already been filled.
   */
  isFieldFilled(name, value) {
    if (!this.filledFields) return false;
    const n = String(name || "").toLowerCase();
    const v = String(value || "").toLowerCase();
    return this.filledFields.some(f => f.name === n && (f.value === v || !value));
  }

  /**
   * Checks if an action type was performed.
   */
  hasPerformedAction(actionType) {
    const act = String(actionType).toLowerCase();
    return this.actionHistory.some(a =>
      (a.actionType || "").toLowerCase() === act ||
      (a.type || "").toLowerCase() === act ||
      (a.taskType || "").toLowerCase() === act ||
      (a.actionIntent || "").toLowerCase() === act ||
      (a.reason || "").toLowerCase().includes(act)
    );
  }

  /**
   * Checks for loops:
   * 1. Repeated identical actions on the exact same element
   * 2. Consecutive action failures
   * 3. Excessive replans
   */
  checkLoopSafeguards() {
    const history = this.actionHistory;
    const n = history.length;

    // 1. Consecutive failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      return {
        detected: true,
        type: "CONSECUTIVE_FAILURES",
        reason: `${this.consecutiveFailures} consecutive actions failed execution.`
      };
    }

    // 2. Repeated identical actions on the same element
    if (n >= this.maxRepeatedActions) {
      const recent = history.slice(-this.maxRepeatedActions);
      const first = recent[0];
      const allIdentical = recent.every(a =>
        a.actionType === first.actionType &&
        a.targetId === first.targetId &&
        a.targetId !== "page_root"
      );
      if (allIdentical) {
        return {
          detected: true,
          type: "REPEATED_ACTION_LOOP",
          reason: `Repeated identical action [${first.actionType}] on target ${first.targetId} ${this.maxRepeatedActions} times without progress.`
        };
      }
    }

    // 3. Excessive replans
    if (this.replanCount >= this.maxReplans) {
      return {
        detected: true,
        type: "MAX_REPLANS_EXCEEDED",
        reason: `Exceeded maximum replan threshold (${this.maxReplans}). Stopping to avoid infinite loop.`
      };
    }

    return { detected: false };
  }

  registerReplan() {
    this.replanCount++;
    this.state.replanCount = this.replanCount;
  }

  getStateSummary() {
    return {
      stepCount: this.actionHistory.length,
      inspectedCount: this.candidatesInspected.length,
      candidatesInspected: this.candidatesInspected,
      appliedFilters: this.appliedFilters,
      consecutiveFailures: this.consecutiveFailures,
      replanCount: this.replanCount,
      lastObservation: this.currentObservation,
      recentActions: this.actionHistory.slice(-5).map(a => `${a.actionType} on ${a.targetId} (${a.status})`)
    };
  }

  getPromptContext() {
    return this.getStateSummary();
  }

  getState() {
    return this.state;
  }
}
