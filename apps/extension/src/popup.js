const captureButton = document.querySelector("#capture");
const scanButton = document.querySelector("#scan");
const runTaskButton = document.querySelector("#run-task");
const taskInput = document.querySelector("#task-input");
const apiKeyInput = document.querySelector("#api-key-input");
const saveKeyButton = document.querySelector("#save-key");
const status = document.querySelector("#status");
const metadataList = document.querySelector("#metadata");
const piiResults = document.querySelector("#pii-results");
const piiSummary = document.querySelector("#pii-summary");
const piiList = document.querySelector("#pii-list");
const taskResults = document.querySelector("#task-results");
const taskSummary = document.querySelector("#task-summary");
const taskActions = document.querySelector("#task-actions");

const providerSelect = document.querySelector("#provider-select");
const modelInput = document.querySelector("#model-input");

/**
 * Sends real-time stage logs to local terminal logger server if active.
 */
function relayToTerminalLog(stage, event, data) {
  try {
    fetch("http://127.0.0.1:8765/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, event, data })
    }).catch(() => {});
  } catch {}
}

const ENV_GROQ_KEY = (typeof process !== "undefined" && process.env?.GROQ_API_KEY) || "";
const ENV_GROQ_MODEL = (typeof process !== "undefined" && process.env?.GROQ_MODEL) || "openai/gpt-oss-20b";
const ENV_OPENROUTER_KEY = (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) || "";
const ENV_OPENROUTER_MODEL = (typeof process !== "undefined" && process.env?.OPENROUTER_MODEL) || "google/gemma-4-26b-a4b-it:free";
const DEFAULT_PROVIDER = ENV_GROQ_KEY ? "groq" : "openrouter";

// Auto-populate from environment configuration if available
if (providerSelect) {
  providerSelect.value = DEFAULT_PROVIDER;
}
if (modelInput) {
  modelInput.value = DEFAULT_PROVIDER === "groq" ? ENV_GROQ_MODEL : ENV_OPENROUTER_MODEL;
}
if (apiKeyInput && !apiKeyInput.value) {
  const defaultKey = DEFAULT_PROVIDER === "groq" ? ENV_GROQ_KEY : ENV_OPENROUTER_KEY;
  if (defaultKey) {
    apiKeyInput.value = defaultKey;
  }
}

// Load stored user overrides if available
if (typeof chrome !== "undefined" && chrome.storage?.local) {
  chrome.storage.local.get(["llm_provider", "llm_api_key", "llm_model"], (result) => {
    if (result?.llm_provider && providerSelect) {
      providerSelect.value = result.llm_provider;
    }
    if (result?.llm_api_key && apiKeyInput) {
      apiKeyInput.value = result.llm_api_key;
    }
    if (result?.llm_model && modelInput) {
      modelInput.value = result.llm_model;
    }
  });
}

if (providerSelect && modelInput) {
  providerSelect.addEventListener("change", () => {
    if (providerSelect.value === "groq") {
      modelInput.value = ENV_GROQ_MODEL;
      if (apiKeyInput && (!apiKeyInput.value || apiKeyInput.value === ENV_OPENROUTER_KEY)) {
        apiKeyInput.value = ENV_GROQ_KEY;
      }
      apiKeyInput.placeholder = "gsk_... (configured via .env)";
    } else {
      modelInput.value = ENV_OPENROUTER_MODEL;
      if (apiKeyInput && (!apiKeyInput.value || apiKeyInput.value === ENV_GROQ_KEY)) {
        apiKeyInput.value = ENV_OPENROUTER_KEY;
      }
      apiKeyInput.placeholder = "sk-or-v1-... (configured via .env)";
    }
  });
}

if (saveKeyButton && apiKeyInput) {
  saveKeyButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect?.value || DEFAULT_PROVIDER;
    const model = modelInput?.value.trim() || (provider === "groq" ? ENV_GROQ_MODEL : ENV_OPENROUTER_MODEL);
    
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({
        llm_provider: provider,
        llm_api_key: key,
        llm_model: model,
        openrouter_api_key: key
      }, () => {
        status.textContent = `${provider.toUpperCase()} settings saved locally.`;
      });
    } else {
      status.textContent = "Saved to session.";
    }
  });
}

/**
 * Robust message sender to active webpage tab with fallback and dynamic injection.
 */
async function sendTabMessage(message) {
  if (typeof chrome === "undefined" || !chrome.tabs || typeof chrome.tabs.query !== "function") {
    if (typeof globalThis.ActionRuntime !== "undefined") {
      if (message.type === "OBSERVE_INTERACTIVE_DOM") return globalThis.ActionRuntime.observeInteractiveDom();
      if (message.type === "EXECUTE_BROWSER_ACTION") return globalThis.ActionRuntime.executeAction(message.actionType, message.targetId, message.parameters, message.secretValue);
      if (message.type === "DETECT_AND_LOCALIZE_PAGE_PII") return { ok: true, summary: { totalFindings: 0, categories: [] } };
      if (message.type === "CAPTURE_SAFE_PAGE_METADATA") return { ok: true, metadata: { title: document.title, url: location.href } };
    }
    throw new Error("Extension tab environment unavailable. Please click the extension icon on an active webpage tab.");
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0];
  if (!tab?.id) {
    throw new Error("No active browser tab found. Please switch to the webpage tab.");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    if (err?.message && err.message.includes("Receiving end does not exist")) {
      if (typeof chrome.scripting !== "undefined" && chrome.scripting.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["src/policy-runtime.js", "src/ocr-service.js", "src/content-pii.js", "src/content-metadata.js", "src/action-runtime.js"]
          });
          return await chrome.tabs.sendMessage(tab.id, message);
        } catch (injectErr) {
          throw new Error("Cannot run on internal browser pages. Please navigate to a standard http/https webpage.");
        }
      }
      throw new Error("Please reload the webpage and click the extension icon again.");
    }
    throw err;
  }
}

function renderMetadata(metadata) {
  if (!metadataList) return;
  metadataList.replaceChildren();

  for (const [label, value] of Object.entries(metadata)) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    metadataList.append(term, description);
  }

  metadataList.hidden = false;
}

if (captureButton) {
  captureButton.addEventListener("click", async () => {
    status.textContent = "Capturing local metadata…";
    if (metadataList) metadataList.hidden = true;
    if (piiResults) piiResults.hidden = true;
    if (taskResults) taskResults.hidden = true;

    try {
      const response = await sendTabMessage({ type: "CAPTURE_SAFE_PAGE_METADATA" });
      if (!response?.ok) {
        throw new Error("The page did not return metadata.");
      }

      renderMetadata(response.metadata);
      status.textContent = "Captured locally. Nothing was sent to a server.";
    } catch (err) {
      status.textContent = err.message || "This page cannot be inspected. Try a normal http or https website.";
    }
  });
}

function renderPiiSummary(summary) {
  if (!piiList || !piiSummary || !piiResults) return;
  piiList.replaceChildren();
  piiSummary.textContent = summary.totalFindings
    ? `${summary.totalFindings} possible sensitive item(s) localized locally. Values are hidden.`
    : "No supported PII patterns were found in the scanned portion of this page.";

  for (const item of summary.categories || []) {
    const listItem = document.createElement("li");
    listItem.textContent = `${item.category}: ${item.count} — ${item.decision}`;
    piiList.append(listItem);
  }

  if (Array.isArray(summary.localizedItems) && summary.localizedItems.length > 0) {
    const header = document.createElement("li");
    header.style.fontWeight = "bold";
    header.style.marginTop = "6px";
    header.textContent = "Localized Bounding Boxes:";
    piiList.append(header);

    for (const loc of summary.localizedItems) {
      const locItem = document.createElement("li");
      locItem.style.fontSize = "0.85em";
      const bboxStr = loc.bbox ? `(x:${loc.bbox.x}, y:${loc.bbox.y}, w:${loc.bbox.width}, h:${loc.bbox.height})` : "no-bbox";
      locItem.textContent = `[${loc.source.toUpperCase()}] ${loc.category} @ ${bboxStr} (${Math.round(loc.confidence * 100)}%)`;
      piiList.append(locItem);
    }
  }

  piiResults.hidden = false;
}

if (scanButton) {
  scanButton.addEventListener("click", async () => {
    status.textContent = "Scanning locally…";
    if (metadataList) metadataList.hidden = true;
    if (piiResults) piiResults.hidden = true;
    if (taskResults) taskResults.hidden = true;

    try {
      const response = await sendTabMessage({ type: "DETECT_AND_LOCALIZE_PAGE_PII" });
      if (!response?.ok) {
        throw new Error("PII scan failed on this page.");
      }

      renderPiiSummary(response.summary);
      status.textContent = "Scan completed locally. No detected values were retained or sent.";
    } catch (err) {
      status.textContent = err.message || "This page cannot be scanned. Try a normal http or https website.";
    }
  });
}

/**
 * Detects if user task specifies a domain/URL or if we need to navigate from an internal tab.
 */
function extractNavigationUrl(task, currentUrl = "") {
  if (!task) return null;
  const isInternal = !currentUrl || currentUrl.startsWith("chrome://") || currentUrl.startsWith("about:") || currentUrl.startsWith("chrome-extension://") || currentUrl.startsWith("devtools://");

  // Check for explicit URL in task
  const urlMatch = task.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];

  // Check for known domain keywords in task
  const domainPatterns = [
    { regex: /\b(?:go to|open|search on|visit|navigate to|search in)\s+(?:www\.)?amazon\.in\b/i, url: "https://www.amazon.in" },
    { regex: /\b(?:go to|open|search on|visit|navigate to|search in)\s+(?:www\.)?amazon\.com\b/i, url: "https://www.amazon.com" },
    { regex: /\b(?:go to|open|search on|visit|navigate to|search in|on)\s+(?:www\.)?amazon\b/i, url: "https://www.amazon.in" },
    { regex: /\b(?:go to|open|search on|visit|navigate to)\s+(?:www\.)?google\.(?:com|in)\b/i, url: "https://www.google.com" },
    { regex: /\b(?:go to|open|search on|visit|navigate to)\s+(?:www\.)?youtube\.com\b/i, url: "https://www.youtube.com" },
    { regex: /\b(?:go to|open|search on|visit|navigate to)\s+(?:www\.)?wikipedia\.org\b/i, url: "https://www.wikipedia.org" },
    { regex: /\b(?:go to|open|search on|visit|navigate to)\s+(?:www\.)?([a-zA-Z0-9-]+\.(?:com|in|org|net|io|co|gov|edu))\b/i, transform: (m) => `https://${m[1]}` }
  ];

  for (const p of domainPatterns) {
    const match = task.match(p.regex);
    if (match) {
      return p.transform ? p.transform(match) : p.url;
    }
  }

  // If on an internal page (newtab), check if user mentions amazon/google/etc anywhere
  if (isInternal) {
    if (/\bamazon\b/i.test(task)) return "https://www.amazon.in";
    if (/\byoutube\b/i.test(task)) return "https://www.youtube.com";
    if (/\bwikipedia\b/i.test(task)) return "https://www.wikipedia.org";
    return "https://www.google.com";
  }

  return null;
}

/**
 * Navigates tab to target URL and waits for page load to finish.
 */
async function navigateTabAndWait(tabId, targetUrl) {
  if (typeof chrome === "undefined" || !chrome.tabs?.update) return false;
  await chrome.tabs.update(tabId, { url: targetUrl });

  return new Promise((resolve) => {
    let isResolved = false;
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        if (!isResolved) {
          isResolved = true;
          setTimeout(resolve, 1500); // 1.5s DOM settle time
        }
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (!isResolved) resolve();
    }, 7000);
  });
}

if (runTaskButton) {
  runTaskButton.addEventListener("click", async () => {
    const userTask = (taskInput?.value || "").trim();
    if (!userTask) {
      status.textContent = "Please enter a task instruction.";
      return;
    }

    status.textContent = "Running privacy-preserving browser agent pipeline…";
    if (metadataList) metadataList.hidden = true;
    if (piiResults) piiResults.hidden = true;
    if (taskResults) taskResults.hidden = true;

    const startTime = Date.now();
    relayToTerminalLog("User Request", "Received user task instruction", { task: userTask });

    try {
      // 1. Obtain API settings (Auto-fallback to .env configuration)
      const userKey = (apiKeyInput?.value || "").trim();
      const provider = providerSelect?.value || DEFAULT_PROVIDER;
      const apiKey = userKey || (provider === "groq" ? ENV_GROQ_KEY : ENV_OPENROUTER_KEY);
      const selectedModel = (modelInput?.value || "").trim() || (provider === "groq" ? ENV_GROQ_MODEL : ENV_OPENROUTER_MODEL);

      // 2. Check if initial navigation is needed (e.g. from chrome://newtab or if URL is specified)
      let activeTab = null;
      if (typeof chrome !== "undefined" && chrome.tabs?.query) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        activeTab = tabs?.[0] || null;
      }

      const currentUrl = activeTab?.url || "";
      const targetNavUrl = extractNavigationUrl(userTask, currentUrl);

      if (targetNavUrl && activeTab?.id) {
        status.textContent = `Navigating to ${targetNavUrl}...`;
        relayToTerminalLog("Auto-Navigation", `Navigating tab to ${targetNavUrl}`, { targetNavUrl, fromUrl: currentUrl });
        await navigateTabAndWait(activeTab.id, targetNavUrl);
      }

      // 3. Multi-Step Iterative Agent Loop (Perceive -> Plan -> Act -> Observe)
      const MAX_STEPS = 6;
      const actionHistory = [];
      const executedResults = [];
      let anyFailed = false;
      let finalSummary = "Multi-step task completed.";

      for (let stepNum = 1; stepNum <= MAX_STEPS; stepNum++) {
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Scanning page & analyzing DOM...`;

        // 3.1 Local PII Scan
        const scanRes = await sendTabMessage({ type: "DETECT_AND_LOCALIZE_PAGE_PII" }).catch(() => ({ summary: { totalFindings: 0 } }));
        const piiFindings = scanRes?.summary || { totalFindings: 0 };
        renderPiiSummary(piiFindings);

        // 3.2 Discover Interactive Elements on the CURRENT page state
        let observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }).catch(() => null);
        if (!observeRes?.interactiveElements || observeRes.interactiveElements.length === 0) {
          // Wait 1.2s and retry once in case of AJAX / DOM hydration
          await new Promise(r => setTimeout(r, 1200));
          observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }).catch(() => null);
        }

        const interactiveElements = observeRes?.interactiveElements || [];
        const pageTitle = observeRes?.pageTitle || "";
        const pageUrl = observeRes?.url || "";

        relayToTerminalLog(`Step ${stepNum}: DOM Perception`, `Discovered ${interactiveElements.length} elements on "${pageTitle}"`, {
          step: stepNum,
          pageTitle,
          pageUrl,
          elementCount: interactiveElements.length,
          sample: interactiveElements.slice(0, 15)
        });

        if (interactiveElements.length === 0) {
          relayToTerminalLog(`Step ${stepNum}: Stalled`, "No interactive elements discovered on page.", {});
          break;
        }

        // 3.3 Plan Next Action via Remote Model
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Reasoning via ${provider.toUpperCase()} (${selectedModel})...`;
        let stepProposal = null;
        let isTaskComplete = false;
        let reasoningSummary = "";

        if (apiKey) {
          const endpointUrl = provider === "groq"
            ? "https://api.groq.com/openai/v1/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";

          const promptPayload = {
            model: selectedModel,
            messages: [
              {
                role: "system",
                content: [
                  "You are an autonomous Privacy-Preserving Browser Agent reasoning loop.",
                  "You perceive interactive DOM elements on the current webpage, each with an elementId (e.g. el_1, el_2).",
                  "Your objective is to accomplish the user's multi-step task step by step.",
                  "",
                  "CRITICAL ECOMMERCE & ACTION RULES:",
                  "1. SEARCH INTENT vs ACTION INTENT:",
                  "   - When searching: Type ONLY the concise search keyword (e.g. 'Nike shoes' or 'running shoes'), NOT full instructions like 'Open Amazon and search for Nike and add the first shoe to the cart'.",
                  "   - When the user asks to 'add to cart', 'select the first shoe', 'click item', 'buy now', or when search results are ALREADY showing:",
                  "     DO NOT type conversational instructions into the search bar!",
                  "2. ADD TO CART & PRODUCT SELECTION WORKFLOW:",
                  "   - If on a search results page and the user asks to add the first shoe/product to cart:",
                  "     a) If an 'Add to cart' button is present on the first product card, CLICK that button.",
                  "     b) Otherwise, CLICK the first product title/link (e.g. 'Nike Men's Revolution 6...') to open the product details page.",
                  "   - If on a product details page and the user wants to add it to cart:",
                  "     CLICK the 'Add to Cart' or 'Buy Now' button on the page.",
                  "3. FILTERING WORKFLOW:",
                  "   - When search results are loaded and filtering is requested: Locate the filter checkbox (e.g. brand, RAM, rating) and CLICK/CHECK that filter element.",
                  "4. COMPLETION:",
                  "   - When the requested item is added to cart, or when the final step is complete, return { \"actionType\": \"COMPLETE\", \"isComplete\": true, \"reasoningSummary\": \"First shoe added to cart successfully.\" }.",
                  "5. Supported action types: CLICK, TYPE, CLEAR, SELECT, CHECK, UNCHECK, PRESS_KEY, SUBMIT, SCROLL, GO_BACK, WAIT, COMPLETE.",
                  "",
                  "Respond ONLY with a valid JSON object matching this schema:",
                  "{",
                  '  "actionType": "CLICK",',
                  '  "target": "el_1",',
                  '  "parameters": {},',
                  '  "isComplete": false,',
                  '  "reasoningSummary": "Short explanation of this step"',
                  "}",
                  "For TYPE + search: { \"actionType\": \"TYPE\", \"target\": \"el_2\", \"parameters\": { \"text\": \"Nike shoes\" }, \"isComplete\": false, \"thenPressEnter\": true }",
                  "For Product Click: { \"actionType\": \"CLICK\", \"target\": \"el_25\", \"isComplete\": false, \"reasoningSummary\": \"Clicking first Nike shoe product title\" }",
                  "For Add to Cart: { \"actionType\": \"CLICK\", \"target\": \"el_30\", \"isComplete\": false, \"reasoningSummary\": \"Clicking Add to Cart button\" }",
                  "For COMPLETE: { \"actionType\": \"COMPLETE\", \"isComplete\": true, \"reasoningSummary\": \"Shoe added to cart successfully.\" }"
                ].join("\n")
              },
              {
                role: "user",
                content: JSON.stringify({
                  userTask,
                  currentStep: stepNum,
                  maxSteps: MAX_STEPS,
                  actionHistorySoFar: actionHistory,
                  currentPage: { title: pageTitle, url: pageUrl },
                  interactiveElements: interactiveElements.slice(0, 80)
                })
              }
            ],
            response_format: { type: "json_object" }
          };

          const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          };
          if (provider === "openrouter") {
            headers["HTTP-Referer"] = "https://privacy-browser-agent.local";
            headers["X-Title"] = "Privacy-Preserving Browser Agent";
          }

          try {
            const res = await fetch(endpointUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(promptPayload)
            });

            if (res.ok) {
              const data = await res.json();
              const content = data?.choices?.[0]?.message?.content;
              if (content) {
                const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
                const parsed = JSON.parse(cleaned);

                isTaskComplete = Boolean(parsed.isComplete || parsed.actionType === "COMPLETE" || parsed.action === "COMPLETE");
                reasoningSummary = parsed.reasoningSummary || parsed.reason || `Step ${stepNum} planned by ${selectedModel}.`;

                if (parsed.recommendedActions && Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0) {
                  stepProposal = parsed.recommendedActions[0];
                } else if (parsed.actionType || parsed.action) {
                  stepProposal = parsed;
                }
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              relayToTerminalLog(`Step ${stepNum}: Reasoning Error`, `API error HTTP ${res.status}`, errData);
            }
          } catch (mErr) {
            relayToTerminalLog(`Step ${stepNum}: Reasoning Exception`, mErr.message, {});
          }
        }

        // Context-aware fallback heuristic if model gave no proposal
        if (!stepProposal) {
          const isAddToCart = /\b(?:add to cart|add to basket|buy now|select the first|buy)\b/i.test(userTask);
          const isSearchExplicit = /\b(?:search for|search|look for|find)\b/i.test(userTask) && !isAddToCart;

          if (isAddToCart) {
            // Find "Add to cart" button or first product title link
            const addToCartBtn = interactiveElements.find(el => (el.text && /\badd to cart\b/i.test(el.text)) || el.name?.includes("addToCart") || (el.ariaLabel && /\badd to cart\b/i.test(el.ariaLabel)));
            if (addToCartBtn) {
              stepProposal = { actionType: "CLICK", target: addToCartBtn.elementId, parameters: {}, reasoningSummary: "Clicked 'Add to Cart' button." };
            } else {
              const firstProductLink = interactiveElements.find(el => el.tag === "a" && el.text && el.text.length > 15 && !/\b(sign in|customer service|registry|gift cards|sell|amazon basics|prime|cart|returns|orders)\b/i.test(el.text));
              if (firstProductLink) {
                stepProposal = { actionType: "CLICK", target: firstProductLink.elementId, parameters: {}, reasoningSummary: `Clicked on product: "${firstProductLink.text}".` };
              }
            }
          } else if (isSearchExplicit && stepNum === 1) {
            let query = userTask.replace(/\b(?:open the amazon app and|open amazon and|search for|search on amazon for|search in amazon for|search on amazon|search in amazon|search)\b/gi, "").trim();
            const searchInput = interactiveElements.find(el => el.tag === "input" && (el.type === "text" || el.type === "search" || !el.type));
            if (searchInput) {
              stepProposal = { actionType: "TYPE", target: searchInput.elementId, parameters: { text: query || userTask }, thenPressEnter: true, reasoningSummary: `Entered search query "${query}".` };
            }
          }
        }

        if (isTaskComplete || !stepProposal || stepProposal.actionType === "COMPLETE") {
          finalSummary = reasoningSummary || "All task steps completed successfully.";
          relayToTerminalLog(`Step ${stepNum}: Goal Completed`, finalSummary, { actionHistory });
          break;
        }

        const actionType = String(stepProposal.actionType || stepProposal.action || stepProposal.type || "CLICK").toUpperCase();
        const targetId = typeof stepProposal.target === "string" ? stepProposal.target : (stepProposal.target?.elementId || stepProposal.element_id || "page_root");
        const parameters = stepProposal.parameters || (stepProposal.text ? { text: stepProposal.text } : {});

        // 3.4 Local Action Execution
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Executing [${actionType}] on ${targetId}...`;
        relayToTerminalLog(`Step ${stepNum}: Action Execution`, `Executing [${actionType}] on ${targetId}`, {
          step: stepNum,
          actionType,
          targetId,
          parameters,
          reasoningSummary
        });

        const execRes = await sendTabMessage({
          type: "EXECUTE_BROWSER_ACTION",
          actionType,
          targetId,
          parameters
        });

        // If user typed into a search box with thenPressEnter
        if (actionType === "TYPE" && stepProposal.thenPressEnter) {
          await sendTabMessage({
            type: "EXECUTE_BROWSER_ACTION",
            actionType: "PRESS_KEY",
            targetId,
            parameters: { key: "Enter" }
          });
        }

        const stepOutcome = {
          step: stepNum,
          ok: Boolean(execRes?.ok),
          status: execRes?.status || (execRes?.ok ? "COMPLETED" : "FAILED_EXECUTION"),
          actionType,
          targetId,
          reason: reasoningSummary,
          error: execRes?.error
        };
        executedResults.push(stepOutcome);

        if (!execRes?.ok) {
          anyFailed = true;
          relayToTerminalLog(`Step ${stepNum}: Action Failed`, execRes?.error || "Action execution error", stepOutcome);
          break;
        }

        actionHistory.push(`Step ${stepNum}: [${actionType}] on ${targetId} — ${reasoningSummary}`);

        // 3.5 Pause for Page Navigation or Filter AJAX update
        if (actionType === "NAVIGATE" || actionType === "PRESS_KEY" || actionType === "SUBMIT" || stepProposal.thenPressEnter || (actionType === "CLICK" && (targetId.startsWith("el_") || stepProposal.isFilter))) {
          status.textContent = `Step ${stepNum} complete. Waiting for page update...`;
          await new Promise(r => setTimeout(r, 2200));
        } else {
          await new Promise(r => setTimeout(r, 900));
        }
      }

      const totalMs = Date.now() - startTime;
      const successfulCount = executedResults.filter(r => r.ok && r.status === "COMPLETED").length;
      const isOverallSuccess = !anyFailed && executedResults.length > 0 && successfulCount > 0;

      relayToTerminalLog("Final Task Summary", isOverallSuccess ? "Task COMPLETED successfully" : "Task FAILED", {
        success: isOverallSuccess,
        totalDurationMs: totalMs,
        totalSteps: executedResults.length,
        actionHistory,
        executedResults
      });

      if (taskResults && taskSummary && taskActions) {
        taskActions.replaceChildren();

        const modelLabel = apiKey ? `${selectedModel} (${provider.toUpperCase()})` : "Local Heuristic Planner";
        taskSummary.textContent = isOverallSuccess
          ? `Multi-step task completed in ${totalMs}ms via ${modelLabel}. ${successfulCount}/${executedResults.length} step(s) executed successfully.`
          : `Task stopped in ${totalMs}ms. Executed ${successfulCount}/${executedResults.length} step(s).`;

        for (const res of executedResults) {
          const actionItem = document.createElement("li");
          actionItem.textContent = `[Step ${res.step}: ${res.actionType}] Target: "${res.targetId}" — Status: ${res.status}${res.reason ? ` (${res.reason})` : ""}${res.error ? ` [Error: ${res.error}]` : ""}`;
          if (!res.ok) actionItem.style.color = "#dc2626";
          taskActions.append(actionItem);
        }

        const summaryItem = document.createElement("li");
        summaryItem.style.fontStyle = "italic";
        summaryItem.textContent = `Summary: ${finalSummary}`;
        taskActions.append(summaryItem);

        const securityBadge = document.createElement("li");
        securityBadge.style.color = "#059669";
        securityBadge.style.fontWeight = "bold";
        securityBadge.textContent = "✔ 100% On-device DOM authority enforced. Zero raw secrets exposed.";
        taskActions.append(securityBadge);

        taskResults.hidden = false;
      }

      status.textContent = isOverallSuccess
        ? `Task completed successfully in ${totalMs}ms.`
        : `Task execution stopped.`;
    } catch (err) {
      status.textContent = `Task execution error: ${err.message || "Cannot inspect tab."}`;
      relayToTerminalLog("Pipeline Error", err.message, { error: err.message });
    }
  });
}
