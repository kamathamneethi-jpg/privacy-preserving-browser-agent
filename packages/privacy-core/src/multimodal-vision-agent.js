/**
 * Multimodal Vision Agent Module.
 * Connects the dual-modality browser perception (Sanitized DOM + Sanitized Screenshot)
 * to vision-language reasoning models (such as Qwen2.5-VL / Qwen3-VL via OpenRouter or Groq).
 *
 * Privacy Invariants:
 * 1. Zero Raw Secrets: Only sends sanitized DOM metadata and locally redacted screenshots.
 * 2. Pure Multimodal Input: Sends BOTH text structure and native image data URL (not OCR text only).
 * 3. Structured Output: Enforces a strict JSON action decision schema with valid DOM element targets.
 */

import { sanitizeTelemetryData } from "./telemetry-sanitizer.js";

export const DEFAULT_MULTIMODAL_MODEL = "Qwen/Qwen3-VL-4B-Instruct";
export const HUGGINGFACE_DEFAULT_MODEL = "Qwen/Qwen3-VL-4B-Instruct";
export const OPENROUTER_DEFAULT_MODEL = "qwen/qwen-2.5-vl-72b-instruct:free";

export class MultimodalVisionAgent {
  constructor(config = {}) {
    this.provider = config.provider || "huggingface"; // "huggingface" | "openrouter" | "groq"
    this.model = config.model || (this.provider === "huggingface" ? HUGGINGFACE_DEFAULT_MODEL : (this.provider === "openrouter" ? OPENROUTER_DEFAULT_MODEL : DEFAULT_MULTIMODAL_MODEL));
    this.apiKey = config.apiKey || "";
    this.temperature = typeof config.temperature === "number" ? config.temperature : 0.1;
    this.maxTokens = config.maxTokens || 1200;
  }

  /**
   * Builds the system prompt enforcing structured multimodal browser observation and action decisions.
   */
  static buildSystemPrompt() {
    return [
      "You are an autonomous Vision-Language Browser Agent (Qwen VLM).",
      "You are the central planner and decision maker for browser automation.",
      "You receive BOTH:",
      "1. A rendered screenshot of the current browser tab (sanitized on-device).",
      "2. A sanitized structural list of interactive DOM elements with element IDs (e.g. el_1, el_2, ...).",
      "",
      "YOUR RESPONSIBILITIES:",
      "1. High-Level Goal Decomposition: Convert the user's natural language goal into dynamic sub-tasks.",
      "2. Dynamic Task Planning: Track which task is current, which tasks are completed, and what remains.",
      "3. UI Reasoning: Reason across visual layout (screenshots) AND interactive DOM structure to select the next optimal action.",
      "4. Dynamic Replanning: If unexpected modals, popups, category selectors, or page states occur, adjust the tasks dynamically.",
      "5. Goal Verification: Determine when the user's overall goal is fully satisfied.",
      "",
      "SUPPORTED BROWSER ACTIONS:",
      "- CLICK: Click an element by elementId (e.g. { \"type\": \"CLICK\", \"target\": \"el_1\" })",
      "- TYPE: Enter text into an input field (e.g. { \"type\": \"TYPE\", \"target\": \"el_2\", \"value\": \"query\" })",
      "- SELECT: Choose a dropdown option (e.g. { \"type\": \"SELECT\", \"target\": \"el_3\", \"value\": \"Option\" })",
      "- SCROLL: Scroll page (e.g. { \"type\": \"SCROLL\", \"direction\": \"down\", \"amount\": 500 })",
      "- PRESS_KEY: Press keyboard key (e.g. { \"type\": \"PRESS_KEY\", \"target\": \"el_2\", \"key\": \"Enter\" })",
      "- NAVIGATE: Navigate to URL (e.g. { \"type\": \"NAVIGATE\", \"url\": \"https://example.com\" })",
      "- WAIT: Pause for dynamic content to load",
      "- BACK: Return to previous page",
      "- HOVER: Hover over element (e.g. { \"type\": \"HOVER\", \"target\": \"el_4\" })",
      "- DONE: Conclude execution when the goal is fully satisfied",
      "",
      "STRICT OUTPUT REQUIREMENT:",
      "You MUST respond ONLY with a valid JSON object adhering precisely to this schema:",
      "{",
      '  "goal": {',
      '    "description": "Short description of overall goal",',
      '    "status": "in_progress | completed | blocked"',
      '  },',
      '  "tasks": [',
      '    { "id": "task_1", "description": "Description of sub-task 1", "status": "pending | in_progress | completed | blocked" },',
      '    { "id": "task_2", "description": "Description of sub-task 2", "status": "pending | in_progress | completed | blocked" }',
      '  ],',
      '  "currentTaskId": "task_1",',
      '  "taskUpdate": {',
      '    "completedTaskIds": [],',
      '    "newTaskIds": []',
      '  },',
      '  "action": {',
      '    "type": "CLICK",',
      '    "target": "el_1",',
      '    "value": null,',
      '    "direction": null,',
      '    "amount": null,',
      '    "key": null,',
      '    "url": null',
      '  },',
      '  "replan": false,',
      '  "reason": "Clear explanation of what was observed on the page and why this action was chosen"',
      "}",
      "",
      "CRITICAL RULES:",
      "1. Target elements ONLY by valid elementId (e.g. 'el_1'). Never output arbitrary javascript or CSS selectors.",
      "2. When typing into fields, use the 'value' property in the action object.",
      "3. Use the screenshot to visually confirm element positions, overlays, popups, and visual attributes (colors, banners).",
      "4. Never click on sponsored ads or promotional third-party banners (labeled 'Sponsored', 'Ad', 'Featured'). Target authentic controls.",
      "5. When the goal is completely finished, set action.type to 'DONE' and goal.status to 'completed'."
    ].join("\n");
  }

  /**
   * Builds the formatted messages array for OpenAI-compatible chat completions APIs,
   * including native base64 image data URL and sanitized interactive DOM elements.
   * Enforces zero-raw-PII assertion before returning.
   */
  static buildMultimodalMessages({
    goal = {},
    userGoal = null,
    agentState = null,
    currentTask = null,
    tasks = [],
    completedTasks = [],
    pendingTasks = [],
    executionState = {},
    interactiveElements = [],
    screenshotBase64 = null,
    actionHistory = [],
    sanitizedDomContext = "",
    currentUrl = "",
    pageTitle = "",
    rawPiiValues = []
  }) {
    const systemPrompt = MultimodalVisionAgent.buildSystemPrompt();

    const sanitizedElements = interactiveElements.slice(0, 80).map(el => {
      let sText = el.text || "";
      let sVal = el.value || "";
      let sPlaceholder = el.placeholder || "";
      let sAria = el.ariaLabel || "";
      for (const raw of rawPiiValues) {
        if (raw && raw.length >= 2) {
          if (sText && sText.includes(raw)) sText = sText.replaceAll(raw, "[REDACTED]");
          if (sVal && sVal.includes(raw)) sVal = sVal.replaceAll(raw, "[REDACTED]");
          if (sPlaceholder && sPlaceholder.includes(raw)) sPlaceholder = sPlaceholder.replaceAll(raw, "[REDACTED]");
          if (sAria && sAria.includes(raw)) sAria = sAria.replaceAll(raw, "[REDACTED]");
        }
      }
      return {
        elementId: el.elementId || el.id,
        tag: el.tag,
        type: el.type,
        text: sText || undefined,
        value: sVal || undefined,
        placeholder: sPlaceholder || undefined,
        ariaLabel: sAria || undefined,
        bbox: el.bbox ? { x: el.bbox.x, y: el.bbox.y, width: el.bbox.width, height: el.bbox.height } : undefined,
        isSponsored: el.isSponsored ? true : undefined,
        isFilter: el.isFilter ? true : undefined,
        filterCategory: el.filterCategory || undefined,
        isProductResult: el.isProductResult ? true : undefined
      };
    });

    const goalDesc = userGoal || goal.summary || goal.description || goal.originalGoal || goal.userRequest || "Execute user browser task";

    const textPayload = JSON.stringify({
      userGoal: goalDesc,
      goal: {
        summary: goalDesc,
        constraints: goal.constraints || [],
        targetEntity: goal.targetEntity || null
      },
      agentState: {
        iteration: agentState?.iteration ?? executionState?.stepCount ?? actionHistory.length,
        status: agentState?.status || "running",
        replanCount: agentState?.replanCount || 0
      },
      taskPlan: agentState?.tasks?.length ? agentState.tasks : (tasks?.length ? tasks : (currentTask ? [currentTask] : [])),
      currentTask: currentTask || agentState?.currentTaskId || { type: "general_action", description: "Advance goal" },
      completedTasks: agentState?.completedTasks || completedTasks || [],
      pendingTasks: agentState?.pendingTasks || pendingTasks || [],
      currentUrl: currentUrl || executionState?.url || "",
      pageTitle: pageTitle || executionState?.title || "",
      recentActionHistory: (actionHistory || []).slice(-6),
      executionState: {
        stepCount: executionState?.stepCount || actionHistory.length,
        inspectedCandidates: executionState?.inspectedCount || (executionState?.candidatesInspected || []).length,
        appliedFilters: executionState?.appliedFilters || []
      },
      actionHistory: (actionHistory || []).slice(-6),
      sanitizedDomContext: (sanitizedDomContext || "").slice(0, 1000),
      interactiveElements: sanitizedElements
    }, null, 2);

    // Security Assertion: Zero raw PII in text payload
    for (const raw of rawPiiValues) {
      if (raw && raw.length >= 2 && textPayload.includes(raw)) {
        throw new Error(`SECURITY ASSERTION FAILED: Raw sensitive value "${raw}" detected in remote payload.`);
      }
    }

    const userContent = [
      {
        type: "text",
        text: textPayload
      }
    ];

    if (screenshotBase64 && typeof screenshotBase64 === "string" && screenshotBase64.startsWith("data:image/")) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: screenshotBase64
        }
      });
    }

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];
  }

  /**
   * Parses structured response from vision model, normalizing action types and schemas.
   */
  static parseModelResponse(rawContent) {
    if (!rawContent || typeof rawContent !== "string") {
      return null;
    }
    try {
      const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      const actionObj = parsed.action || parsed.recommendedAction || parsed;
      const rawActionType = actionObj.type || actionObj.actionType || actionObj.action || "CLICK";
      const actionType = String(rawActionType).toUpperCase().trim();
      const target = actionObj.target || actionObj.elementId || actionObj.targetId || (actionType === "DONE" || actionType === "COMPLETE" ? "page_root" : null);
      const value = actionObj.value !== undefined ? actionObj.value : (actionObj.parameters?.text ?? actionObj.parameters?.value ?? null);
      const parameters = actionObj.parameters || (value !== null && value !== undefined ? { text: String(value), value: String(value) } : {});
      if (actionObj.key && !parameters.key) parameters.key = actionObj.key;
      if (actionObj.direction && !parameters.direction) parameters.direction = actionObj.direction;
      if (actionObj.amount && !parameters.amount) parameters.amount = actionObj.amount;
      if (actionObj.url && !parameters.url) parameters.url = actionObj.url;

      const thenPressEnter = Boolean(actionObj.thenPressEnter || actionObj.key === "Enter" || parameters.key === "Enter");
      const reasoningSummary = parsed.reason || actionObj.reasoningSummary || parsed.observation || "Model planned action";
      const isComplete = Boolean(
        parsed.goal?.status === "completed" ||
        parsed.goal_progress?.isSatisfied ||
        parsed.isComplete ||
        actionType === "COMPLETE" ||
        actionType === "DONE"
      );

      return {
        goal: parsed.goal || {
          description: typeof parsed.next_task === "string" ? parsed.next_task : (parsed.goal?.description || "Execute user goal"),
          status: isComplete ? "completed" : "in_progress"
        },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : (Array.isArray(parsed.taskPlan) ? parsed.taskPlan : []),
        currentTaskId: parsed.currentTaskId || parsed.current_task_id || (Array.isArray(parsed.tasks) && parsed.tasks[0]?.id) || null,
        taskUpdate: parsed.taskUpdate || parsed.task_update || { completedTaskIds: [], newTaskIds: [] },
        replan: Boolean(parsed.replan || parsed.replanRequired),
        reason: reasoningSummary,
        observation: typeof parsed.observation === "string" ? parsed.observation : (reasoningSummary || JSON.stringify(parsed.observation || {})),
        goal_progress: parsed.goal_progress || { isSatisfied: isComplete },
        next_task: parsed.next_task || parsed.currentTaskId || null,
        action: {
          type: actionType,
          actionType,
          target: target || "page_root",
          value,
          parameters,
          thenPressEnter,
          reasoningSummary,
          direction: actionObj.direction || parameters.direction || null,
          amount: actionObj.amount || parameters.amount || null,
          key: actionObj.key || parameters.key || null,
          url: actionObj.url || parameters.url || null
        },
        raw: parsed
      };
    } catch {
      return null;
    }
  }


  /**
   * Static entrypoint to perform multimodal vision reasoning.
   */
  static async reason({
    apiKey = "",
    model = DEFAULT_MULTIMODAL_MODEL,
    provider = "openrouter",
    goal = {},
    userGoal = null,
    agentState = null,
    currentTask = null,
    tasks = [],
    completedTasks = [],
    pendingTasks = [],
    executionState = {},
    interactiveElements = [],
    screenshotBase64 = null,
    actionHistory = [],
    sanitizedDomContext = "",
    currentUrl = "",
    pageTitle = "",
    rawPiiValues = [],
    fetchClient = globalThis.fetch,
    onTelemetry = null,
    localEndpoint = (typeof process !== "undefined" && process.env?.LOCAL_AGENT_URL) || "http://127.0.0.1:8765/api/agent/reason"
  }) {
    // 1. Local AI Agent Server (Port 8765, Zero Remote Key Required)
    if (provider === "local") {
      const localStartTime = Date.now();
      try {
        const localRes = await fetchClient(localEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal,
            userGoal,
            agentState,
            currentTask,
            tasks,
            completedTasks,
            pendingTasks,
            executionState,
            interactiveElements,
            screenshotBase64,
            sanitizedDomContext,
            currentUrl,
            pageTitle,
            actionHistory
          })
        });
        if (localRes.ok) {
          const decision = await localRes.json();
          const latencyMs = Date.now() - localStartTime;
          if (typeof onTelemetry === "function") {
            try {
              onTelemetry({
                status: "RESPONSE",
                provider: "local",
                model: "Local-Heuristic-Agent-8765",
                latencyMs,
                actionType: decision?.action?.actionType || decision?.action?.type || "CLICK",
                target: decision?.action?.target || null,
                observation: decision?.observation || null
              });
            } catch {}
          }
          return decision;
        }
      } catch (err) {
        // Fallback to null if local server unavailable
      }
      return null;
    }

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return null;
    }

    const messages = MultimodalVisionAgent.buildMultimodalMessages({
      goal,
      userGoal,
      agentState,
      currentTask,
      tasks,
      completedTasks,
      pendingTasks,
      executionState,
      interactiveElements,
      screenshotBase64,
      actionHistory,
      sanitizedDomContext,
      currentUrl,
      pageTitle,
      rawPiiValues
    });

    let endpointUrl;
    if (provider === "groq") {
      endpointUrl = "https://api.groq.com/openai/v1/chat/completions";
    } else if (provider === "huggingface" || provider === "hf") {
      endpointUrl = "https://router.huggingface.co/v1/chat/completions";
    } else {
      endpointUrl = "https://openrouter.ai/api/v1/chat/completions";
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://privacy-browser-agent.local";
      headers["X-Title"] = "Privacy-Preserving Autonomous Browser Agent";
    }

    const maskedAuth = apiKey.length > 8 ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "masked";
    const startTime = Date.now();

    const telemetryRequest = {
      endpoint: endpointUrl,
      provider,
      model,
      headers: { ...headers, Authorization: `Bearer ${maskedAuth}` },
      messageCount: messages.length,
      hasScreenshot: Boolean(screenshotBase64),
      screenshotBase64: screenshotBase64 || undefined,
      sanitizedDomContext: sanitizedDomContext || undefined,
      elementCount: interactiveElements.length
    };

    // Helper to report telemetry without blocking
    const reportTelemetry = (status, data, level = "info") => {
      const sanitizedEventData = sanitizeTelemetryData({
        ...telemetryRequest,
        ...data
      });
      if (typeof onTelemetry === "function") {
        try { onTelemetry({ status, ...sanitizedEventData }); } catch {}
      }
      try {
        if (typeof globalThis.fetch === "function") {
          globalThis.fetch("http://127.0.0.1:8765/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage: "API REASONING",
              event: `LLM_API_${status}`,
              level,
              data: sanitizedEventData
            })
          }).catch(() => {});
        }
      } catch {}
    };

    try {
      const response = await fetchClient(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: "json_object" }
        })
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorDetails = "";
        try {
          errorDetails = await response.text();
        } catch {}
        reportTelemetry("ERROR", {
          status: response.status,
          statusText: response.statusText,
          error: errorDetails || `HTTP Error ${response.status}`,
          latencyMs
        }, "error");

        // Graceful fallback to Local Agent Server
        try {
          const fallbackRes = await fetchClient("http://127.0.0.1:8765/api/agent/reason", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              goal,
              userGoal,
              agentState,
              currentTask,
              tasks,
              completedTasks,
              pendingTasks,
              executionState,
              interactiveElements,
              screenshotBase64,
              sanitizedDomContext,
              currentUrl,
              pageTitle,
              actionHistory
            })
          });
          if (fallbackRes.ok) {
            return await fallbackRes.json();
          }
        } catch {}

        return null;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = MultimodalVisionAgent.parseModelResponse(content);

      reportTelemetry("RESPONSE", {
        status: 200,
        latencyMs,
        actionType: parsed?.action?.actionType || "UNKNOWN",
        target: parsed?.action?.target || null,
        observation: parsed?.observation || null,
        rawPreview: content ? content.slice(0, 300) : null
      });

      return parsed;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      reportTelemetry("EXCEPTION", {
        error: err.message || String(err),
        latencyMs
      }, "error");

      // Graceful fallback to Local Agent Server
      try {
        const fallbackRes = await fetchClient("http://127.0.0.1:8765/api/agent/reason", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal,
            userGoal,
            agentState,
            currentTask,
            tasks,
            completedTasks,
            pendingTasks,
            executionState,
            interactiveElements,
            screenshotBase64,
            sanitizedDomContext,
            currentUrl,
            pageTitle,
            actionHistory
          })
        });
        if (fallbackRes.ok) {
          return await fallbackRes.json();
        }
      } catch {}

      return null;
    }
  }

  /**
   * Instance method delegating to static reason.
   */
  async decideNextAction(context = {}, options = {}) {
    return MultimodalVisionAgent.reason({
      apiKey: options.apiKey || this.apiKey,
      model: options.model || this.model,
      provider: options.provider || this.provider,
      goal: context.goalSpec,
      currentTask: context.currentTask,
      executionState: context.executionState,
      interactiveElements: context.interactiveElements,
      screenshotBase64: context.screenshotDataUrl,
      actionHistory: context.executionHistory,
      fetchClient: options.fetchClient || globalThis.fetch
    });
  }
}
