/**
 * VLM Agent State Module.
 * Implements the persistent working memory owned by the browser extension.
 *
 * Requirements from prompt.txt:
 * - Extension is the source of truth for execution state.
 * - Stores raw user request, dynamic tasks list, currentTaskId, completedTasks,
 *   pendingTasks, actionHistory, lastAction, status, and iteration count.
 * - Supports dynamic replanning (replacing or updating tasks when Qwen dictates).
 * - Detects execution loops and stagnation.
 */

export function createAgentState({ userRequest = "", sessionId = null, maxIterations = 10 } = {}) {
  const sId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    sessionId: sId,
    goal: {
      userRequest: String(userRequest || "").trim(),
      description: String(userRequest || "").trim(),
      status: "in_progress" // "planning" | "in_progress" | "completed" | "blocked"
    },
    tasks: [],
    currentTaskId: null,
    completedTasks: [],
    pendingTasks: [],
    actionHistory: [],
    lastAction: null,
    status: "planning", // "planning" | "running" | "completed" | "blocked"
    iteration: 0,
    maxIterations: Number(maxIterations) || 10,
    consecutiveNoopActions: 0,
    replanCount: 0
  };
}

/**
 * Updates the agent state using the structured output from Qwen VLM.
 * Handles task creation, status updates, completion, and dynamic replanning.
 */
export function updateAgentStateFromVlm(state, vlmResponse = {}) {
  if (!state || typeof state !== "object") return state;
  if (!vlmResponse || typeof vlmResponse !== "object") return state;

  state.iteration += 1;

  // 1. Update goal status if specified by Qwen
  if (vlmResponse.goal) {
    if (vlmResponse.goal.status) {
      state.goal.status = vlmResponse.goal.status;
      if (vlmResponse.goal.status === "completed") {
        state.status = "completed";
      } else if (vlmResponse.goal.status === "blocked") {
        state.status = "blocked";
      } else {
        state.status = "running";
      }
    }
    if (vlmResponse.goal.description) {
      state.goal.description = vlmResponse.goal.description;
    }
  }

  // 2. Handle Replanning or Initial Task List Generation
  if (Array.isArray(vlmResponse.tasks) && vlmResponse.tasks.length > 0) {
    if (vlmResponse.replan || state.tasks.length === 0) {
      // Replan or initial plan: overwrite tasks with Qwen's proposed plan
      state.tasks = vlmResponse.tasks.map((t, idx) => ({
        id: t.id || `task_${idx + 1}`,
        description: t.description || `Task ${idx + 1}`,
        status: t.status || "pending"
      }));
      if (vlmResponse.replan) {
        state.replanCount += 1;
      }
    } else {
      // Merge updates for existing tasks
      for (const updatedTask of vlmResponse.tasks) {
        const existing = state.tasks.find(t => t.id === updatedTask.id);
        if (existing) {
          if (updatedTask.status) existing.status = updatedTask.status;
          if (updatedTask.description) existing.description = updatedTask.description;
        } else {
          // Append new task proposed by Qwen
          state.tasks.push({
            id: updatedTask.id || `task_${state.tasks.length + 1}`,
            description: updatedTask.description || "Subtask",
            status: updatedTask.status || "pending"
          });
        }
      }
    }
  }

  // 3. Handle explicit taskUpdate instructions from Qwen
  if (vlmResponse.taskUpdate) {
    if (Array.isArray(vlmResponse.taskUpdate.completedTaskIds)) {
      for (const cId of vlmResponse.taskUpdate.completedTaskIds) {
        const task = state.tasks.find(t => t.id === cId);
        if (task) task.status = "completed";
        if (!state.completedTasks.includes(cId)) {
          state.completedTasks.push(cId);
        }
      }
    }
    if (Array.isArray(vlmResponse.taskUpdate.newTaskIds)) {
      // Ensured in state.tasks
    }
  }

  // 4. Update currentTaskId
  if (vlmResponse.currentTaskId) {
    state.currentTaskId = vlmResponse.currentTaskId;
    const curr = state.tasks.find(t => t.id === state.currentTaskId);
    if (curr && curr.status !== "completed") {
      curr.status = "in_progress";
    }
  } else if (!state.currentTaskId && state.tasks.length > 0) {
    const firstPending = state.tasks.find(t => t.status !== "completed");
    if (firstPending) {
      state.currentTaskId = firstPending.id;
      firstPending.status = "in_progress";
    }
  }

  // 5. Recompute completedTasks and pendingTasks arrays
  state.completedTasks = state.tasks.filter(t => t.status === "completed").map(t => t.id);
  state.pendingTasks = state.tasks.filter(t => t.status === "pending").map(t => t.id);

  // 6. Action-driven completion (e.g. action.type === "DONE")
  if (vlmResponse.action?.type === "DONE" || vlmResponse.action?.actionType === "DONE") {
    state.goal.status = "completed";
    state.status = "completed";
    if (state.currentTaskId) {
      const curr = state.tasks.find(t => t.id === state.currentTaskId);
      if (curr) curr.status = "completed";
      if (!state.completedTasks.includes(state.currentTaskId)) {
        state.completedTasks.push(state.currentTaskId);
      }
    }
  }

  return state;
}

/**
 * Records an executed browser action into the state's bounded action history.
 */
export function recordAgentAction(state, rawEntry = {}) {
  if (!state) return;

  const action = rawEntry.action || rawEntry.actionType || rawEntry.type || "UNKNOWN";
  const target = rawEntry.target || rawEntry.targetId || null;
  const value = rawEntry.value !== undefined ? String(rawEntry.value) : undefined;
  const result = String(rawEntry.result || rawEntry.status || "success");
  const url = rawEntry.url || undefined;

  const entry = {
    iteration: state.iteration,
    action: String(action).toUpperCase(),
    target,
    value,
    result,
    url,
    timestamp: Date.now()
  };

  state.lastAction = entry;
  state.actionHistory.push(entry);

  // Keep bounded history (last 10 actions for prompt efficiency)
  if (state.actionHistory.length > 10) {
    state.actionHistory = state.actionHistory.slice(-10);
  }
}

/**
 * Detects whether the agent is in an infinite loop or performing stagnant actions.
 * Returns { isLoop: boolean, reason?: string, warningPrompt?: string }
 */
export function detectExecutionLoop(state, currentAction = {}) {
  if (!state || !Array.isArray(state.actionHistory) || state.actionHistory.length < 3) {
    return { isLoop: false };
  }

  const history = state.actionHistory;
  const recent = history.slice(-3);
  const curType = currentAction.type || currentAction.actionType || "";
  const curTarget = currentAction.target || "";

  // Check 1: Exact same action and target 3 times consecutively
  const allSame = recent.every(h => h.action === curType && h.target === curTarget);
  if (allSame && curType !== "WAIT") {
    return {
      isLoop: true,
      reason: `Action ${curType} on ${curTarget || "page"} repeated 3 times without progressing.`,
      warningPrompt: `The previous action (${curType} on ${curTarget || "page"}) produced no meaningful state change. Re-evaluate the current UI and choose a different action.`
    };
  }

  // Check 2: Exceeded maximum iterations
  if (state.iteration >= state.maxIterations) {
    return {
      isLoop: true,
      reason: `Reached maximum iterations limit (${state.maxIterations}).`,
      warningPrompt: `Execution limit reached.`
    };
  }

  return { isLoop: false };
}
