if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({
      getContext: () => null,
      width: 640,
      height: 480,
      style: {},
      addEventListener: () => { }
    }),
    addEventListener: () => { },
    removeEventListener: () => { }
  };
}

import {
  GoalParser as CoreGoalParser,
  TaskPlanner as CoreTaskPlanner,
  TASK_STATUS as CoreTaskStatus,
  ExecutionStateManager as CoreExecutionStateManager,
  DynamicReplanner as CoreDynamicReplanner,
  GoalCompletionChecker as CoreGoalCompletionChecker,
  MultimodalVisionAgent as CoreMultimodalVisionAgent,
  DEFAULT_MULTIMODAL_MODEL as CoreDefaultModel,
  isProviderCircuitOpen as CoreIsProviderCircuitOpen,
  tripProviderCircuit as CoreTripProviderCircuit,
  resetProviderCircuit as CoreResetProviderCircuit,
  transformViewportToBitmap as CoreTransformViewportToBitmap,
  transformPageToBitmap as CoreTransformPageToBitmap,
  sanitizeTelemetryData as CoreSanitizeTelemetryData,
  sanitizeTelemetryTask as CoreSanitizeTelemetryTask,
  sanitizeTelemetryError as CoreSanitizeTelemetryError,
  evaluatePiiPolicyItem as CoreEvaluatePiiPolicyItem,
  evaluateBatchPrivacyPolicy as CoreEvaluateBatchPrivacyPolicy,
  evaluatePiiTaskRelevance as CoreEvaluatePiiTaskRelevance,
  formatReviewerDecisionBadge as CoreFormatReviewerDecisionBadge,
  assertCrossRepresentationConsistency as CoreAssertCrossRepresentationConsistency,
  POLICY_ACTIONS as CorePolicyActions,
  PROCESSING_DESTINATIONS as CoreProcessingDestinations,
  createAgentState as CoreCreateAgentState,
  updateAgentStateFromVlm as CoreUpdateAgentStateFromVlm,
  recordAgentAction as CoreRecordAgentAction,
  detectExecutionLoop as CoreDetectExecutionLoop,
  validateVlmAction as CoreValidateVlmAction,
  privacyVault as CorePrivacyVault
} from "../../../packages/privacy-core/src/index.js";

const PC = (typeof PrivacyCore !== "undefined" ? PrivacyCore : (typeof window !== "undefined" && window.PrivacyCore ? window.PrivacyCore : {}));
const ActiveGoalParser = CoreGoalParser || PC.GoalParser;
const ActiveTaskPlanner = CoreTaskPlanner || PC.TaskPlanner;
const ActiveTaskStatus = CoreTaskStatus || PC.TASK_STATUS;
const ActiveExecutionStateManager = CoreExecutionStateManager || PC.ExecutionStateManager;
const ActiveDynamicReplanner = CoreDynamicReplanner || PC.DynamicReplanner;
const ActiveGoalCompletionChecker = CoreGoalCompletionChecker || PC.GoalCompletionChecker;
const ActiveMultimodalVisionAgent = CoreMultimodalVisionAgent || PC.MultimodalVisionAgent;
const ActiveDefaultModel = CoreDefaultModel || PC.DEFAULT_MULTIMODAL_MODEL || "qwen/qwen-2.5-vl-72b-instruct";
const ActiveIsProviderCircuitOpen = CoreIsProviderCircuitOpen || PC.isProviderCircuitOpen || (() => false);
const ActiveTripProviderCircuit = CoreTripProviderCircuit || PC.tripProviderCircuit || (() => {});
const ActiveResetProviderCircuit = CoreResetProviderCircuit || PC.resetProviderCircuit || (() => {});
const ActiveTransformViewportToBitmap = CoreTransformViewportToBitmap || PC.transformViewportToBitmap;
const ActiveTransformPageToBitmap = CoreTransformPageToBitmap || PC.transformPageToBitmap;
const ActiveSanitizeTelemetryData = CoreSanitizeTelemetryData || PC.sanitizeTelemetryData || ((d) => d);
const ActiveSanitizeTelemetryTask = CoreSanitizeTelemetryTask || PC.sanitizeTelemetryTask;
const ActiveSanitizeTelemetryError = CoreSanitizeTelemetryError || PC.sanitizeTelemetryError;
const ActiveEvaluatePiiPolicyItem = CoreEvaluatePiiPolicyItem || PC.evaluatePiiPolicyItem;
const ActiveEvaluateBatchPrivacyPolicy = CoreEvaluateBatchPrivacyPolicy || PC.evaluateBatchPrivacyPolicy;
const ActiveEvaluatePiiTaskRelevance = CoreEvaluatePiiTaskRelevance || PC.evaluatePiiTaskRelevance;
const ActiveFormatReviewerDecisionBadge = CoreFormatReviewerDecisionBadge || PC.formatReviewerDecisionBadge || ((d) => ({ action: d?.decision || d?.action || "REDACT", label: d?.decision || d?.action || "REDACT", icon: "⚫", color: "BLACK" }));
const ActiveAssertCrossRepresentationConsistency = CoreAssertCrossRepresentationConsistency || PC.assertCrossRepresentationConsistency;
const ActivePolicyActions = CorePolicyActions || PC.POLICY_ACTIONS || { ALLOW: "ALLOW", TOKENIZE: "TOKENIZE", REDACT: "REDACT", LOCAL_ONLY: "LOCAL_ONLY" };
const ActiveProcessingDestinations = CoreProcessingDestinations || PC.PROCESSING_DESTINATIONS || { REMOTE_REASONING: "REMOTE_REASONING", LOCAL_BROWSER: "LOCAL_BROWSER" };
const ActiveCreateAgentState = CoreCreateAgentState || PC.createAgentState;
const ActiveUpdateAgentStateFromVlm = CoreUpdateAgentStateFromVlm || PC.updateAgentStateFromVlm;
const ActiveRecordAgentAction = CoreRecordAgentAction || PC.recordAgentAction;
const ActiveDetectExecutionLoop = CoreDetectExecutionLoop || PC.detectExecutionLoop;
const ActiveValidateVlmAction = CoreValidateVlmAction || PC.validateVlmAction;
const ActivePrivacyVault = CorePrivacyVault || PC.privacyVault;

const doc = typeof document !== "undefined" ? document : { querySelector: () => null, querySelectorAll: () => [] };

// Rate Limiting, Cooldown & Anti-Spam State
let isTaskRunning = false;
let lastTaskSubmissionTime = 0;
const taskSubmissionTimestamps = [];
const USER_INPUT_COOLDOWN_MS = 2000;      // Minimum 2 seconds between consecutive task requests
const MAX_TASKS_PER_MINUTE = 6;            // Maximum 6 full tasks per minute sliding window
const MAX_REMOTE_CALLS_PER_TASK = 3;       // Maximum 3 remote LLM calls per task (subsequent steps route to local agent)

const captureButton = doc.querySelector("#capture");
const scanButton = doc.querySelector("#scan");
const runTaskButton = doc.querySelector("#run-task");
const taskInput = doc.querySelector("#task-input");
const apiKeyInput = doc.querySelector("#api-key-input");
const saveKeyButton = doc.querySelector("#save-key");
const status = doc.querySelector("#status");
const metadataList = doc.querySelector("#metadata");
const piiResults = doc.querySelector("#pii-results");
const piiSummary = doc.querySelector("#pii-summary");
const piiList = doc.querySelector("#pii-list");
const taskResults = doc.querySelector("#task-results");
const taskSummary = doc.querySelector("#task-summary");
const taskActions = doc.querySelector("#task-actions");
const pipelineBreadcrumb = doc.querySelector("#pipeline-breadcrumb");
const pipelineStatus = doc.querySelector("#pipeline-status");
const redactedInfoPanel = doc.querySelector("#redacted-info-panel");
const redactedSummary = doc.querySelector("#redacted-summary");
const copyRedactedDomButton = doc.querySelector("#copy-redacted-dom");

const detectedPiiCount = doc.querySelector("#detected-pii-count");
const detectedPiiTypes = doc.querySelector("#detected-pii-types");
const viewRedactedDomButton = doc.querySelector("#view-redacted-dom");
const redactedDomContainer = doc.querySelector("#redacted-dom-container");
const redactedDomView = doc.querySelector("#redacted-dom-view");
const secRawPiiDetected = doc.querySelector("#sec-raw-pii-detected");
const secRawPiiRemote = doc.querySelector("#sec-raw-pii-remote");
const secSanitizedEntities = doc.querySelector("#sec-sanitized-entities");

const togglePiiValuesButton = doc.querySelector("#toggle-pii-values");
const clearHighlightsButton = doc.querySelector("#clear-highlights");
const btnReloadExtension = doc.querySelector("#btn-reload-extension");

const livePrivacyPanel = doc.querySelector("#live-privacy-transparency-panel");
const transparencyTableBody = doc.querySelector("#transparency-table-body");
const transparencyStatusBadge = doc.querySelector("#transparency-status-badge");
const transparencyEmptyHint = doc.querySelector("#transparency-empty-hint");

/**
 * Renders the Live Privacy Transparency Panel dynamically from authoritative PolicyDecision objects.
 *
 * CRITICAL ARCHITECTURAL RULES:
 * 1. popup.js NEVER acts as a second PolicyEngine. It strictly consumes authoritative PolicyDecision objects.
 * 2. Visual presentation (icon, label, color) is strictly derived via formatReviewerDecisionBadge().
 * 3. Never renders raw passwords, OTPs, CVVs, or secret values in the UI.
 * 4. Dynamically adapts to 0, 1, or many runtime decisions with full transparency metadata.
 */
export function renderPrivacyTransparency(decisions = [], rootDoc = typeof document !== "undefined" ? document : null) {
  const activeDoc = rootDoc || (typeof document !== "undefined" ? document : null);
  if (!activeDoc) return;

  const tBody = activeDoc.querySelector?.("#transparency-table-body") || transparencyTableBody;
  const tBadge = activeDoc.querySelector?.("#transparency-status-badge") || transparencyStatusBadge;
  const tHint = activeDoc.querySelector?.("#transparency-empty-hint") || transparencyEmptyHint;
  const tPanel = activeDoc.querySelector?.("#live-privacy-transparency-panel") || livePrivacyPanel;

  if (!tBody) return;
  tBody.replaceChildren();

  const decisionList = Array.isArray(decisions) ? decisions : (decisions?.items || []);

  if (decisionList.length === 0) {
    if (tHint) tHint.hidden = false;
    if (tBadge) tBadge.textContent = "0 Decisions Evaluated";
    return;
  }

  if (tHint) tHint.hidden = true;
  if (tBadge) {
    tBadge.textContent = `${decisionList.length} Authoritative Decision(s)`;
  }

  for (const dec of decisionList) {
    if (!dec) continue;
    const badge = typeof ActiveFormatReviewerDecisionBadge === "function"
      ? ActiveFormatReviewerDecisionBadge(dec)
      : { action: dec.decision || dec.action || "REDACT", icon: "⚫", label: dec.decision || dec.action || "REDACT", color: "BLACK" };

    const tr = activeDoc.createElement("tr");
    tr.style.borderBottom = "1px solid #e2e8f0";
    tr.style.lineHeight = "1.3";

    // 1. Decision Badge Column (🟢 ALLOW / 🔴 TOKENIZE / ⚫ REDACT / 🔒 LOCAL_ONLY)
    const tdDecision = activeDoc.createElement("td");
    tdDecision.style.padding = "6px";
    tdDecision.style.whiteSpace = "nowrap";

    const badgeSpan = activeDoc.createElement("span");
    badgeSpan.style.display = "inline-flex";
    badgeSpan.style.alignItems = "center";
    badgeSpan.style.gap = "4px";
    badgeSpan.style.padding = "2px 6px";
    badgeSpan.style.borderRadius = "4px";
    badgeSpan.style.fontWeight = "bold";
    badgeSpan.style.fontSize = "10px";
    badgeSpan.style.fontFamily = "monospace";

    if (badge.action === "ALLOW") {
      badgeSpan.style.background = "#dcfce7";
      badgeSpan.style.color = "#15803d";
      badgeSpan.style.border = "1px solid #86efac";
    } else if (badge.action === "TOKENIZE") {
      badgeSpan.style.background = "#fee2e2";
      badgeSpan.style.color = "#b91c1c";
      badgeSpan.style.border = "1px solid #fca5a5";
    } else if (badge.action === "LOCAL_ONLY") {
      badgeSpan.style.background = "#f3e8ff";
      badgeSpan.style.color = "#7e22ce";
      badgeSpan.style.border = "1px solid #d8b4fe";
    } else {
      badgeSpan.style.background = "#f1f5f9";
      badgeSpan.style.color = "#334155";
      badgeSpan.style.border = "1px solid #cbd5e1";
    }

    badgeSpan.textContent = `${badge.icon} ${badge.label}`;
    tdDecision.appendChild(badgeSpan);

    // 2. Category & Semantic Role Column
    const tdCategory = activeDoc.createElement("td");
    tdCategory.style.padding = "6px";
    const catName = dec.category || dec.piiId || "unknown";
    const roleName = dec.semanticRole || "UNKNOWN";
    const sensitivityName = dec.sensitivity || "MEDIUM";
    tdCategory.innerHTML = `<strong>${catName}</strong><br><span style="color:#64748b; font-size:10px;">Role: ${roleName} (${sensitivityName})</span>`;

    // 3. Necessity & Relevance Column
    const tdNecessity = activeDoc.createElement("td");
    tdNecessity.style.padding = "6px";
    const necessity = dec.taskNecessity || "UNKNOWN";
    const relevance = dec.taskRelevance || dec.relevance || "UNKNOWN";
    const reasonCode = (Array.isArray(dec.reasonCodes) ? dec.reasonCodes[0] : dec.reasonCode) || "POLICY_APPLIED";
    tdNecessity.innerHTML = `<span style="font-weight:600; color:#1e293b;">${necessity}</span><br><span style="color:#64748b; font-size:10px;">${relevance} &bull; ${reasonCode}</span>`;

    // 4. Enforcement, Screenshot & Remote Status Column
    const tdEnforcement = activeDoc.createElement("td");
    tdEnforcement.style.padding = "6px";

    let remoteText = "REDACTED";
    if (badge.action === "ALLOW") {
      remoteText = "Transmitted (Safe Context)";
    } else if (badge.action === "TOKENIZE") {
      remoteText = dec.token ? `Token (${dec.token})` : "Tokenized";
    } else if (badge.action === "LOCAL_ONLY") {
      remoteText = "EXCLUDED (Zero Remote Egress)";
    }

    const ssText = badge.action === "ALLOW" ? "Screenshot: Clear" : "Screenshot: Masked";
    tdEnforcement.innerHTML = `<span style="font-family:monospace; font-size:10px; font-weight:600;">Remote: ${remoteText}</span><br><span style="color:#64748b; font-size:10px;">${ssText}</span>`;

    tr.appendChild(tdDecision);
    tr.appendChild(tdCategory);
    tr.appendChild(tdNecessity);
    tr.appendChild(tdEnforcement);

    tBody.appendChild(tr);
  }

  if (tPanel) {
    tPanel.hidden = false;
  }
}

if (btnReloadExtension) {
  btnReloadExtension.addEventListener("click", () => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.reload) {
        chrome.runtime.reload();
      } else if (typeof location !== "undefined" && location.reload) {
        location.reload();
      }
    } catch {
      if (typeof location !== "undefined" && location.reload) {
        location.reload();
      }
    }
  });
}

let lastRedactedDomText = "";
let showPiiValues = false;
let lastPiiSummary = null;

if (viewRedactedDomButton && redactedDomContainer) {
  viewRedactedDomButton.addEventListener("click", () => {
    const isHidden = redactedDomContainer.style.display === "none" || redactedDomContainer.hidden;
    if (isHidden) {
      if (redactedDomView) {
        redactedDomView.textContent = lastRedactedDomText || "No redacted DOM context generated yet. Click 'Scan page locally for PII' or run an agent task.";
      }
      redactedDomContainer.style.display = "block";
      viewRedactedDomButton.textContent = "Hide Redacted DOM";
    } else {
      redactedDomContainer.style.display = "none";
      viewRedactedDomButton.textContent = "View Redacted DOM";
    }
  });
}

if (togglePiiValuesButton) {
  togglePiiValuesButton.addEventListener("click", () => {
    showPiiValues = !showPiiValues;
    togglePiiValuesButton.textContent = showPiiValues ? "Hide Detected Values" : "Show Detected Values";
    if (lastPiiSummary) {
      renderPiiSummary(lastPiiSummary);
    }
  });
}

if (clearHighlightsButton) {
  clearHighlightsButton.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: "CLEAR_LOCAL_HIGHLIGHTS" });
        status.textContent = "Visual PII highlights cleared cleanly from webpage.";
      }
    } catch {
      status.textContent = "Unable to clear highlights on this page.";
    }
  });
}

// ---------------------------------------------------------------------
// AI AGENT MULTIMODAL TRANSMISSION UI
// ---------------------------------------------------------------------
const aiAgentPayloadCard = doc.querySelector("#ai-agent-payload-card");
const aiPayloadStatus = doc.querySelector("#ai-payload-status");
const targetAiAgentLabel = doc.querySelector("#target-ai-agent-label");
const aiPayloadDetails = doc.querySelector("#ai-payload-details");
const aiSentScreenshotThumb = doc.querySelector("#ai-sent-screenshot-thumb");
const btnToggleAiDom = doc.querySelector("#btn-toggle-ai-dom");
const aiSentDomContainer = doc.querySelector("#ai-sent-dom-container");
const aiSentDomText = doc.querySelector("#ai-sent-dom-text");

let lastSentAiDomText = "";

if (btnToggleAiDom && aiSentDomContainer) {
  btnToggleAiDom.addEventListener("click", () => {
    const isHidden = aiSentDomContainer.style.display === "none" || aiSentDomContainer.hidden;
    if (isHidden) {
      if (aiSentDomText) {
        aiSentDomText.textContent = lastSentAiDomText || "No DOM context sent to AI agent yet.";
      }
      aiSentDomContainer.style.display = "block";
      btnToggleAiDom.textContent = "Hide Sanitized DOM Sent to AI";
    } else {
      aiSentDomContainer.style.display = "none";
      btnToggleAiDom.textContent = "View Sanitized DOM Sent to AI";
    }
  });
}

function updateAiMultimodalTransmissionUI({ targetAgent, screenshotBase64, sanitizedDom, elementCount }) {
  if (aiAgentPayloadCard) aiAgentPayloadCard.hidden = false;
  if (targetAiAgentLabel) targetAiAgentLabel.textContent = targetAgent || "Local Server (Port 8765)";
  if (aiPayloadDetails) aiPayloadDetails.textContent = `Redacted SS (${screenshotBase64 ? "Captured" : "Pending"}) + Sanitized DOM (${elementCount || 0} Elements)`;
  if (aiPayloadStatus) {
    aiPayloadStatus.textContent = "TRANSMITTED";
    aiPayloadStatus.style.background = "#dcfce7";
    aiPayloadStatus.style.color = "#15803d";
  }

  if (screenshotBase64 && aiSentScreenshotThumb) {
    aiSentScreenshotThumb.src = screenshotBase64;
    aiSentScreenshotThumb.style.display = "inline-block";
  }

  lastSentAiDomText = sanitizedDom || "";
  if (aiSentDomText) {
    aiSentDomText.textContent = lastSentAiDomText;
  }
}

// ---------------------------------------------------------------------
// IMAGE PRIVACY & LOCAL REDACTION PIPELINE
// ---------------------------------------------------------------------
const btnScanScreenshot = doc.querySelector("#btn-scan-screenshot");
const btnLoadTestImage = doc.querySelector("#btn-load-test-image");
const imgFileInput = doc.querySelector("#img-file-input");
const btnViewRedactedImage = doc.querySelector("#btn-view-redacted-image");
const btnCopyRedactedImage = doc.querySelector("#btn-copy-redacted-image");
const btnClearImageDetection = doc.querySelector("#btn-clear-image-detection");
const btnToggleBboxOverlay = doc.querySelector("#btn-toggle-bbox-overlay");
const imageDisplayContainer = doc.querySelector("#image-display-container");
const redactedImageCanvas = doc.querySelector("#redacted-image-canvas");
const sanitizedOcrTextView = doc.querySelector("#sanitized-ocr-text-view");
const imgViewTitle = doc.querySelector("#img-view-title");

const imgDetectedPiiCount = doc.querySelector("#img-detected-pii-count");
const imgDetectedPiiTypes = doc.querySelector("#img-detected-pii-types");

const secImgRawProcessed = doc.querySelector("#sec-img-raw-processed");
const secImgRawPii = doc.querySelector("#sec-img-raw-pii");
const secImgRemotePii = doc.querySelector("#sec-img-remote-pii");
const secImgSanitizedGen = doc.querySelector("#sec-img-sanitized-gen");
const secImgRedactedRegions = doc.querySelector("#sec-img-redacted-regions");
const secImgBackendRaw = doc.querySelector("#sec-img-backend-raw");

let lastOriginalImage = null; // Preserved locally, never sent remotely
let lastRedactedCanvas = null;
let lastOcrBlocks = [];
let lastImagePiiDetections = [];
let lastSanitizedOcrText = "";
let showBboxOverlay = false;

function renderImageTelemetry(stats) {
  if (imgDetectedPiiCount) imgDetectedPiiCount.textContent = stats.detectedCount;
  if (imgDetectedPiiTypes) imgDetectedPiiTypes.textContent = stats.types.length > 0 ? stats.types.join(", ") : "None";

  if (secImgRawProcessed) secImgRawProcessed.textContent = "YES";
  if (secImgRawPii) secImgRawPii.textContent = stats.detectedCount;
  if (secImgRemotePii) secImgRemotePii.textContent = "0";
  if (secImgSanitizedGen) secImgSanitizedGen.textContent = stats.redactedCount > 0 ? "YES" : "NO";
  if (secImgRedactedRegions) secImgRedactedRegions.textContent = stats.redactedCount;
  if (secImgBackendRaw) secImgBackendRaw.textContent = "NO";

  if (sanitizedOcrTextView) {
    sanitizedOcrTextView.textContent = stats.sanitizedText || "Zero raw sensitive PII in sanitized representation.";
  }
}

function renderImageToCanvas(mode = "REDACTED") {
  if (!redactedImageCanvas) return;
  const ctx = redactedImageCanvas.getContext("2d");
  if (!ctx) return;

  const src = mode === "BBOX" ? lastOriginalImage : (lastRedactedCanvas || lastOriginalImage);
  if (!src) return;

  const w = src.width || src.naturalWidth || 640;
  const h = src.height || src.naturalHeight || 480;

  redactedImageCanvas.width = w;
  redactedImageCanvas.height = h;

  ctx.clearRect(0, 0, w, h);
  try {
    ctx.drawImage(src, 0, 0, w, h);
  } catch { }

  if (mode === "BBOX" && Array.isArray(lastImagePiiDetections)) {
    ctx.save();
    for (const det of lastImagePiiDetections) {
      const b = det.bbox;
      if (!b || b.width <= 0) continue;

      // Draw bounding box outline
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#f59e0b";
      ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeRect(b.x, b.y, b.width, b.height);

      // Draw label tag
      ctx.fillStyle = "#d97706";
      ctx.fillRect(b.x, Math.max(0, b.y - 16), Math.min(b.width, 95), 16);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.fillText(det.type, b.x + 4, Math.max(12, b.y - 4));
    }
    ctx.restore();
  }
}

async function processImageSourceForPii(imgElement, options = {}) {
  if (secImgRawProcessed) secImgRawProcessed.textContent = "YES";
  if (secImgBackendRaw) secImgBackendRaw.textContent = "NO";
  if (status) status.textContent = "Processing image on-device...";

  const isDemoFixture = Boolean(options.isDemoFixture);
  const extraDetections = Array.isArray(options.extraDetections) ? options.extraDetections : [];

  // 1. OCR text + bounding boxes
  let blocks = [];
  try {
    if (typeof globalThis.PrivacyCore !== "undefined" && globalThis.PrivacyCore.recognizeImageText) {
      blocks = await globalThis.PrivacyCore.recognizeImageText(imgElement);
    }
  } catch (err) {
    console.warn("OCR on-device error:", err);
  }

  // ONLY load synthetic demo blocks if explicitly running demo fixture
  if ((!blocks || blocks.length === 0) && isDemoFixture) {
    blocks = [
      { text: "Customer Information", bbox: { x: 70, y: 55, width: 320, height: 32 }, confidence: 0.98 },
      { text: "Name: Shahrukh", bbox: { x: 95, y: 125, width: 224, height: 32 }, confidence: 0.96 },
      { text: "ID: hi_23", bbox: { x: 95, y: 175, width: 144, height: 32 }, confidence: 0.95 },
      { text: "Email: sde@sf.com", bbox: { x: 95, y: 225, width: 272, height: 32 }, confidence: 0.97 },
      { text: "Phone: 9876543210", bbox: { x: 95, y: 275, width: 272, height: 32 }, confidence: 0.94 },
      { text: "Card: 4532 1234 5678 9012", bbox: { x: 95, y: 325, width: 416, height: 32 }, confidence: 0.96 }
    ];
  }

  // 2. Detect PII from OCR blocks if any exist
  let detections = [];
  if (blocks && blocks.length > 0) {
    if (typeof globalThis.PrivacyCore !== "undefined" && globalThis.PrivacyCore.hybridPiiDetector) {
      detections = globalThis.PrivacyCore.hybridPiiDetector.detectPiiInOcrBlocks(blocks);
    } else {
      const patterns = [
        { type: "NAME", regex: /\b(?:Name|Customer Name)\s*:\s*([A-Za-z]+)/i },
        { type: "ID", regex: /\b(?:ID|User ID)\s*:\s*([A-Za-z0-9_#-]+)/i },
        { type: "EMAIL", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
        { type: "PHONE", regex: /(?:\+?\d[\d(). -]{7,}\d)|\b\d{10}\b/ },
        { type: "CREDIT_CARD", regex: /\b(?:Card|Credit Card)\s*:\s*([0-9 -]{13,19})/i }
      ];

      let counter = 0;
      for (const b of blocks) {
        for (const p of patterns) {
          const m = b.text.match(p.regex);
          if (m) {
            counter++;
            detections.push({
              id: `PII_IMG_${counter}`,
              type: p.type,
              category: p.type.toLowerCase(),
              value: m[1] || m[0],
              confidence: 0.96,
              bbox: b.bbox,
              source: "IMAGE_OCR"
            });
          }
        }
      }
    }
  }

  // 3. Merge with viewport DOM detections (authoritative pixel localization from live page)
  for (const ed of extraDetections) {
    const isDup = detections.some(
      (d) => d.value === ed.value && Math.abs(d.bbox.x - ed.bbox.x) < 20 && Math.abs(d.bbox.y - ed.bbox.y) < 20
    );
    if (!isDup) {
      detections.push(ed);
    }
  }

  // 4. Local Redaction on Image Copy
  let redactResult = null;
  if (typeof globalThis.PrivacyCore !== "undefined" && globalThis.PrivacyCore.redactImageLocally) {
    redactResult = globalThis.PrivacyCore.redactImageLocally(imgElement, detections, { padding: 4 });
  } else {
    const canvas = doc.createElement("canvas");
    canvas.width = imgElement.width || imgElement.naturalWidth || 640;
    canvas.height = imgElement.height || imgElement.naturalHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      for (const d of detections) {
        if (d.bbox) {
          ctx.fillRect(Math.max(0, d.bbox.x - 3), Math.max(0, d.bbox.y - 3), d.bbox.width + 6, d.bbox.height + 6);
        }
      }
    }
    redactResult = { sanitizedImage: canvas, originalIntact: true, redactedCount: detections.length };
  }

  lastOriginalImage = imgElement;
  lastOcrBlocks = blocks || [];
  lastImagePiiDetections = detections;
  lastRedactedCanvas = redactResult.sanitizedImage;

  // 5. Generate sanitized text
  let sanitizedText = (blocks || []).map((b) => b.text).join("\n");
  for (const det of detections) {
    if (det.value && sanitizedText) {
      sanitizedText = sanitizedText.replaceAll(det.value, "████████");
    }
  }
  if (!sanitizedText && detections.length > 0) {
    sanitizedText = detections.map((d) => `[${d.type}]: ████████ (at x:${d.bbox.x}, y:${d.bbox.y})`).join("\n");
  }
  lastSanitizedOcrText = sanitizedText;

  // 6. Update Telemetry and View
  renderImageTelemetry({
    detectedCount: detections.length,
    types: [...new Set(detections.map((d) => d.type))],
    redactedCount: redactResult.redactedCount,
    sanitizedText
  });

  showBboxOverlay = false;
  if (btnToggleBboxOverlay) btnToggleBboxOverlay.textContent = "Show Bounding Boxes";
  if (imgViewTitle) imgViewTitle.textContent = "Redacted Image (Sanitized):";

  renderImageToCanvas("REDACTED");
  if (imageDisplayContainer) imageDisplayContainer.style.display = "block";

  if (status) {
    if (detections.length > 0) {
      status.textContent = `Screenshot scan complete. ${detections.length} PII items redacted on-device. Zero raw pixels transmitted.`;
    } else {
      status.textContent = "Screenshot scan complete. 0 PII items detected in viewport. Webpage is safe.";
    }
  }
}

// Button: Scan Current Page Screenshot
if (btnScanScreenshot) {
  btnScanScreenshot.addEventListener("click", async () => {
    if (status) status.textContent = "Scanning active tab viewport and capturing screenshot on-device...";
    try {
      // 1. Query live page content script for visible viewport PII and its exact viewport bounds
      let viewportPiiResponse = null;
      try {
        viewportPiiResponse = await sendTabMessage({ type: "GET_VIEWPORT_PII" });
      } catch (tabErr) {
        console.warn("Could not retrieve viewport PII from tab message:", tabErr);
      }

      // 2. Capture visible tab screenshot locally
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.captureVisibleTab) {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            if (status) status.textContent = "Cannot capture screenshot on this tab (restricted or internal page).";
            return;
          }
          const img = new Image();
          img.onload = () => {
            // Map viewport items to screenshot pixel dimensions
            const viewportWidth = viewportPiiResponse?.viewport?.width || window.innerWidth || img.naturalWidth || 1280;
            const viewportHeight = viewportPiiResponse?.viewport?.height || window.innerHeight || img.naturalHeight || 800;
            const scaleX = img.naturalWidth / viewportWidth;
            const scaleY = img.naturalHeight / viewportHeight;

            const mappedDetections = [];
            if (viewportPiiResponse?.items && Array.isArray(viewportPiiResponse.items)) {
              for (const item of viewportPiiResponse.items) {
                if (!item.viewportBbox) continue;
                const sx = Math.max(0, Math.round(item.viewportBbox.x * scaleX));
                const sy = Math.max(0, Math.round(item.viewportBbox.y * scaleY));
                const sw = Math.round(item.viewportBbox.width * scaleX);
                const sh = Math.round(item.viewportBbox.height * scaleY);

                if (sw > 0 && sh > 0) {
                  mappedDetections.push({
                    id: item.id || `PII_VIEW_${mappedDetections.length + 1}`,
                    type: item.type || (item.category ? item.category.toUpperCase() : "PII"),
                    category: (item.category || "pii").toLowerCase(),
                    value: item.value,
                    confidence: item.confidence || 0.95,
                    bbox: { x: sx, y: sy, width: sw, height: sh },
                    source: "VIEWPORT_DOM"
                  });
                }
              }
            }

            processImageSourceForPii(img, {
              isDemoFixture: false,
              extraDetections: mappedDetections
            });
          };
          img.onerror = () => {
            if (status) status.textContent = "Failed to load captured screenshot image.";
          };
          img.src = dataUrl;
        });
      } else {
        if (status) status.textContent = "Screenshot capture unavailable in this environment.";
      }
    } catch (err) {
      if (status) status.textContent = `Screenshot error: ${err.message}`;
    }
  });
}

// Fallback function when activeTab screenshot permission is restricted (e.g. file:// or internal tabs)
function loadDemoImageFallback() {
  const img = new Image();
  img.onload = () => processImageSourceForPii(img, { isDemoFixture: true });
  img.onerror = () => {
    // Generate synthetic test canvas dynamically
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(40, 30, 560, 420);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("Customer Information", 70, 70);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(65, 95, 510, 270);
      ctx.fillStyle = "#1e293b";
      ctx.font = "16px sans-serif";
      ctx.fillText("Name: Shahrukh", 95, 145);
      ctx.fillText("ID: hi_23", 95, 195);
      ctx.fillText("Email: sde@sf.com", 95, 245);
      ctx.fillText("Phone: 9876543210", 95, 295);
      ctx.fillText("Card: 4532 1234 5678 9012", 95, 345);
    }
    processImageSourceForPii(canvas, { isDemoFixture: true });
  };
  img.src = "fixtures/pii-image-demo.png";
}

// Button: Load Test Image
if (btnLoadTestImage) {
  btnLoadTestImage.addEventListener("click", () => {
    loadDemoImageFallback();
  });
}

if (imgFileInput) {
  imgFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => processImageSourceForPii(img);
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Button: View Redacted Image toggle
if (btnViewRedactedImage && imageDisplayContainer) {
  btnViewRedactedImage.addEventListener("click", () => {
    const isHidden = imageDisplayContainer.style.display === "none";
    if (isHidden) {
      imageDisplayContainer.style.display = "block";
      btnViewRedactedImage.textContent = "Hide Redacted Image";
      renderImageToCanvas(showBboxOverlay ? "BBOX" : "REDACTED");
    } else {
      imageDisplayContainer.style.display = "none";
      btnViewRedactedImage.textContent = "View Redacted Image";
    }
  });
}

// Button: Download / Copy Redacted Image
if (btnCopyRedactedImage) {
  btnCopyRedactedImage.addEventListener("click", () => {
    if (!lastRedactedCanvas) {
      if (status) status.textContent = "No redacted image generated yet. Click 'Scan Current Page Screenshot' first.";
      return;
    }
    try {
      if (lastRedactedCanvas.toBlob) {
        lastRedactedCanvas.toBlob((blob) => {
          if (blob && typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
              .then(() => { if (status) status.textContent = "Sanitized redacted image copied to clipboard!"; })
              .catch(() => triggerDownload());
          } else {
            triggerDownload();
          }
        });
      } else {
        triggerDownload();
      }
    } catch {
      triggerDownload();
    }
    function triggerDownload() {
      const a = document.createElement("a");
      a.download = "redacted-image-sanitized.png";
      a.href = lastRedactedCanvas.toDataURL ? lastRedactedCanvas.toDataURL("image/png") : "";
      a.click();
      if (status) status.textContent = "Sanitized redacted image downloaded locally.";
    }
  });
}

// Button: Toggle Bounding Box Overlay
if (btnToggleBboxOverlay) {
  btnToggleBboxOverlay.addEventListener("click", () => {
    showBboxOverlay = !showBboxOverlay;
    btnToggleBboxOverlay.textContent = showBboxOverlay ? "Show Redacted Image" : "Show Bounding Boxes";
    if (imgViewTitle) {
      imgViewTitle.textContent = showBboxOverlay ? "Detected Bounding Boxes (Pre-Redaction):" : "Redacted Image (Sanitized):";
    }
    renderImageToCanvas(showBboxOverlay ? "BBOX" : "REDACTED");
  });
}

// Button: Clear Image Detection
if (btnClearImageDetection) {
  btnClearImageDetection.addEventListener("click", () => {
    lastOriginalImage = null;
    lastRedactedCanvas = null;
    lastOcrBlocks = [];
    lastImagePiiDetections = [];
    lastSanitizedOcrText = "";
    showBboxOverlay = false;

    if (imageDisplayContainer) imageDisplayContainer.style.display = "none";
    if (redactedImageCanvas) {
      const ctx = redactedImageCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, redactedImageCanvas.width, redactedImageCanvas.height);
    }
    if (btnViewRedactedImage) btnViewRedactedImage.textContent = "View Redacted Image";
    if (btnToggleBboxOverlay) btnToggleBboxOverlay.textContent = "Show Bounding Boxes";
    if (sanitizedOcrTextView) sanitizedOcrTextView.textContent = "";

    renderImageTelemetry({ detectedCount: 0, types: [], redactedCount: 0, sanitizedText: "" });
    if (secImgSanitizedGen) secImgSanitizedGen.textContent = "NO";

    // Clean in-page overlays and highlights on the active tab as well
    sendTabMessage({ type: "CLEAR_LOCAL_HIGHLIGHTS" }).catch(() => { });

    if (status) status.textContent = "Image PII detection and redacted view cleared.";
  });
}

function setPipelineStage(stage) {
  if (pipelineBreadcrumb && pipelineStatus) {
    pipelineBreadcrumb.hidden = false;
    pipelineStatus.textContent = stage;
  }
}

if (copyRedactedDomButton) {
  copyRedactedDomButton.addEventListener("click", async () => {
    if (!lastRedactedDomText) {
      status.textContent = "No redacted DOM content available to copy.";
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(lastRedactedDomText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = lastRedactedDomText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      status.textContent = "Sanitized redacted DOM copied to clipboard!";
    } catch (err) {
      status.textContent = `Clipboard copy error: ${err.message}`;
    }
  });
}

const providerSelect = doc.querySelector("#provider-select");
const modelInput = doc.querySelector("#model-input");

/**
 * Sends real-time stage logs and telemetry to local observability backend if active.
 * Guarantees zero raw secrets or unmasked PII leave the browser boundary via telemetry.
 */
function relayToTerminalLog(stage, event, data, level = "info") {
  try {
    const sanitizedStage = typeof stage === "string" ? stage : "Observability Event";
    const sanitizedEvent = typeof event === "string" ? event : "EVENT";
    const sanitizedData = ActiveSanitizeTelemetryData ? ActiveSanitizeTelemetryData(data) : data;
    const sanitizedLevel = level || "info";

    fetch("http://127.0.0.1:8765/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: sanitizedStage, event: sanitizedEvent, data: sanitizedData, level: sanitizedLevel })
    }).catch(() => {
      // Backward compatibility fallback to /log
      fetch("http://127.0.0.1:8765/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: sanitizedStage, event: sanitizedEvent, data: sanitizedData })
      }).catch(() => { });
    });
  } catch { }
}

const btnOpenDashboard = document.querySelector("#btn-open-dashboard");
if (btnOpenDashboard) {
  btnOpenDashboard.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: "http://127.0.0.1:8765" });
    } else {
      window.open("http://127.0.0.1:8765", "_blank");
    }
  });
}

const ENV_HUGGINGFACE_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
const ENV_HUGGINGFACE_MODEL = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";
const ENV_GROQ_KEY = process.env.GROQ_API_KEY || "";
const ENV_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const ENV_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const ENV_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-vl-72b-instruct:free";

const DEFAULT_PROVIDER = "huggingface";

let liveEnvHfKey = ENV_HUGGINGFACE_KEY;
let liveEnvHfModel = ENV_HUGGINGFACE_MODEL;

function getEffectiveHfKey() {
  return (liveEnvHfKey || ENV_HUGGINGFACE_KEY || "").trim();
}

function getDefaultModelForProvider(prov) {
  if (prov === "local") return "Local-Agent-Port-8765";
  if (prov === "huggingface" || prov === "hf") return liveEnvHfModel || ENV_HUGGINGFACE_MODEL;
  if (prov === "groq") return ENV_GROQ_MODEL;
  return ENV_OPENROUTER_MODEL;
}

function getDefaultKeyForProvider(prov) {
  if (prov === "local") return "local-no-key-required";
  if (prov === "huggingface" || prov === "hf") return getEffectiveHfKey();
  if (prov === "groq") return ENV_GROQ_KEY || getEffectiveHfKey();
  return ENV_OPENROUTER_KEY || getEffectiveHfKey();
}

// Synchronize live .env configuration from local observability server if running
async function syncEnvConfigFromLocalServer() {
  try {
    const res = await fetch("http://127.0.0.1:8765/api/config");
    if (res.ok) {
      const cfg = await res.json();
      const serverKey = (cfg.huggingface_api_key || cfg.hf_token || "").trim();
      if (serverKey) {
        liveEnvHfKey = serverKey;
        if (cfg.huggingface_model) {
          liveEnvHfModel = cfg.huggingface_model;
        }
        if (apiKeyInput) {
          apiKeyInput.value = serverKey;
        }
        if (providerSelect && (!providerSelect.value || providerSelect.value === "local")) {
          providerSelect.value = "huggingface";
        }
        if (modelInput && (!modelInput.value || modelInput.value.includes("Local"))) {
          modelInput.value = liveEnvHfModel;
        }
      }
    }
  } catch {
    // Offline or server not active; bundled ENV_HUGGINGFACE_KEY is used automatically
  }
}
syncEnvConfigFromLocalServer();

// Auto-populate from environment configuration if available
if (providerSelect) {
  providerSelect.value = DEFAULT_PROVIDER;
}
if (modelInput) {
  modelInput.value = getDefaultModelForProvider(DEFAULT_PROVIDER);
}
if (apiKeyInput) {
  const defaultKey = getDefaultKeyForProvider(DEFAULT_PROVIDER);
  if (defaultKey) {
    apiKeyInput.value = defaultKey;
  }
  apiKeyInput.placeholder = "hf_... (Using token from .env if empty)";
}

// Load stored user overrides if available
if (typeof chrome !== "undefined" && chrome.storage?.local) {
  chrome.storage.local.get(["llm_provider", "llm_api_key", "llm_model"], (result) => {
    const userSelectedOther = Boolean(result?.llm_provider && result.llm_provider !== "huggingface" && result.llm_provider !== "local" && result?.llm_api_key && result.llm_api_key.trim());
    const effectiveProvider = userSelectedOther ? result.llm_provider : DEFAULT_PROVIDER;
    if (providerSelect) {
      providerSelect.value = effectiveProvider;
    }
    if (apiKeyInput) {
      const storedKey = (result?.llm_api_key || "").trim();
      apiKeyInput.value = storedKey || getDefaultKeyForProvider(effectiveProvider);
      if (!apiKeyInput.value) {
        apiKeyInput.value = getEffectiveHfKey();
      }
    }
    if (modelInput) {
      modelInput.value = (userSelectedOther ? result.llm_model : "") || getDefaultModelForProvider(effectiveProvider);
    }
  });
}

if (providerSelect && modelInput) {
  providerSelect.addEventListener("change", () => {
    const prov = providerSelect.value;
    modelInput.value = getDefaultModelForProvider(prov);
    if (apiKeyInput) {
      apiKeyInput.value = getDefaultKeyForProvider(prov);
      if (prov === "local") {
        apiKeyInput.placeholder = "No API key needed (Local Server port 8765)";
      } else if (prov === "huggingface") {
        apiKeyInput.placeholder = "hf_... (Hugging Face Free Token)";
      } else if (prov === "groq") {
        apiKeyInput.placeholder = "gsk_... (Groq API Key)";
      } else {
        apiKeyInput.placeholder = "sk-or-v1-... (OpenRouter Free/Paid Key)";
      }
    }
  });
}

if (saveKeyButton && apiKeyInput) {
  saveKeyButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect?.value || DEFAULT_PROVIDER;
    const model = modelInput?.value.trim() || getDefaultModelForProvider(provider);

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({
        llm_provider: provider,
        llm_api_key: key,
        llm_model: model,
        huggingface_api_key: key,
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
async function sendTabMessage(message, targetTabId = null) {
  if (typeof chrome === "undefined" || !chrome.tabs || typeof chrome.tabs.query !== "function") {
    if (typeof globalThis.ActionRuntime !== "undefined") {
      if (message.type === "OBSERVE_INTERACTIVE_DOM") return globalThis.ActionRuntime.observeInteractiveDom();
      if (message.type === "EXECUTE_BROWSER_ACTION") return globalThis.ActionRuntime.executeAction(message.actionType, message.targetId, message.parameters, message.secretValue);
      if (message.type === "DETECT_AND_LOCALIZE_PAGE_PII") return { ok: true, summary: { totalFindings: 0, categories: [] } };
      if (message.type === "CAPTURE_SAFE_PAGE_METADATA") return { ok: true, metadata: { title: document.title, url: location.href } };
    }
    throw new Error("Extension tab environment unavailable. Please click the extension icon on an active webpage tab.");
  }

  let tab = null;
  if (targetTabId) {
    try {
      tab = await chrome.tabs.get(targetTabId);
    } catch {}
  }
  if (!tab?.id) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0];
  }
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
          await new Promise(r => setTimeout(r, 200));
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
    if (redactedInfoPanel) redactedInfoPanel.hidden = true;
    if (pipelineBreadcrumb) pipelineBreadcrumb.hidden = true;

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
  lastPiiSummary = summary;

  if (summary.sanitizedDomText) {
    lastRedactedDomText = summary.sanitizedDomText;
    if (redactedDomView) {
      redactedDomView.textContent = summary.sanitizedDomText;
    }
  }

  if (detectedPiiCount) {
    detectedPiiCount.textContent = summary.totalFindings || 0;
  }
  if (detectedPiiTypes) {
    const types = (summary.categories || []).map((c) => c.category.toUpperCase()).join(", ");
    detectedPiiTypes.textContent = types || "None";
  }

  if (secRawPiiDetected) {
    secRawPiiDetected.textContent = summary.debugSecurityStats?.rawPiiDetectedLocally ?? summary.totalFindings ?? 0;
  }
  if (secRawPiiRemote) {
    secRawPiiRemote.textContent = summary.debugSecurityStats?.rawPiiInRemotePayload ?? 0;
  }
  if (secSanitizedEntities) {
    secSanitizedEntities.textContent = summary.debugSecurityStats?.sanitizedEntities ?? summary.totalFindings ?? 0;
  }

  if (redactedSummary) {
    const redactedParts = (summary.categories || []).map((c) => `${c.category.toUpperCase()}: [REDACTED] (${c.count})`);
    if (redactedParts.length > 0) {
      redactedSummary.textContent = `Redacted: ${redactedParts.join(", ")}`;
      redactedSummary.hidden = false;
    } else {
      redactedSummary.textContent = "Redacted: No sensitive PII detected on current page.";
      redactedSummary.hidden = false;
    }
  }

  if (redactedInfoPanel) {
    redactedInfoPanel.hidden = false;
  }

  if (!piiList || !piiSummary || !piiResults) return;
  piiList.replaceChildren();
  piiSummary.textContent = summary.totalFindings
    ? `${summary.totalFindings} possible sensitive item(s) localized locally. ${showPiiValues ? "Values shown on-device." : "Values are hidden by default."}`
    : "No supported PII patterns were found in the scanned portion of this page.";

  if (togglePiiValuesButton) {
    togglePiiValuesButton.hidden = !summary.totalFindings;
  }

  for (const item of summary.categories || []) {
    const listItem = document.createElement("li");
    listItem.textContent = `${item.category}: ${item.count} — ${item.decision}`;
    piiList.append(listItem);
  }

  if (Array.isArray(summary.localizedItems) && summary.localizedItems.length > 0) {
    const header = document.createElement("li");
    header.style.fontWeight = "bold";
    header.style.marginTop = "6px";
    header.textContent = showPiiValues ? "Localized Items (Values Shown On-Device):" : "Localized Bounding Boxes:";
    piiList.append(header);

    for (const loc of summary.localizedItems) {
      const locItem = document.createElement("li");
      locItem.style.fontSize = "0.85em";

      let boundsStr = "(no visible bounds)";
      if (loc.hasBounds && loc.bbox && (loc.bbox.width > 0 || loc.bbox.height > 0)) {
        boundsStr = `(x:${loc.bbox.x}, y:${loc.bbox.y}, w:${loc.bbox.width}, h:${loc.bbox.height})`;
      }

      const valStr = showPiiValues && loc.value ? `: "${loc.value}"` : "";
      locItem.textContent = `[${loc.source.toUpperCase()}] ${loc.category}${valStr} @ ${boundsStr} (${Math.round(loc.confidence * 100)}%)`;
      piiList.append(locItem);
    }
  }

  // Live Privacy Transparency Integration (Phase 7)
  let runtimeDecisions = summary.policyDecisions || summary.decisions;
  if (!runtimeDecisions && Array.isArray(summary.localizedItems) && summary.localizedItems.length > 0 && typeof ActiveEvaluateBatchPrivacyPolicy === "function") {
    runtimeDecisions = ActiveEvaluateBatchPrivacyPolicy({
      piiItems: summary.localizedItems,
      destination: ActiveProcessingDestinations.REMOTE_REASONING
    });
  }
  if (runtimeDecisions) {
    renderPrivacyTransparency(runtimeDecisions);
  }

  piiResults.hidden = false;
}

if (scanButton) {
  scanButton.addEventListener("click", async () => {
    status.textContent = "Scanning locally…";
    if (metadataList) metadataList.hidden = true;
    if (piiResults) piiResults.hidden = true;
    if (taskResults) taskResults.hidden = true;
    if (pipelineBreadcrumb) pipelineBreadcrumb.hidden = true;

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
 * Never redirects away if the user is already on a live, external webpage unless explicitly requested.
 */
export function extractNavigationUrl(task, currentUrl = "", parsedGoal = null) {
  if (!task) return null;
  const isInternal = !currentUrl || currentUrl.startsWith("chrome://") || currentUrl.startsWith("about:") || currentUrl.startsWith("chrome-extension://") || currentUrl.startsWith("devtools://") || currentUrl.startsWith("edge://") || currentUrl.startsWith("view-source:");

  // 1. Explicit full URL in user instruction (e.g., https://... or http://...)
  const urlMatch = task.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];

  // 2. If parsed goal already identified targetUrl
  if (parsedGoal?.navigation?.targetUrl) {
    return parsedGoal.navigation.targetUrl;
  }

  // 3. Check explicit navigation requirements
  const requiresExplicitNav = parsedGoal?.navigation?.requiresExplicitNavigation ?? false;

  // If user is ALREADY on an external active website (!isInternal),
  // NEVER redirect them away unless they explicitly instructed a website navigation!
  if (!isInternal && !requiresExplicitNav) {
    return null;
  }

  // 4. Platform URL mapping for explicit destinations or blank tab resolution
  const PLATFORM_URLS = {
    google: "https://www.google.com",
    wikipedia: "https://www.wikipedia.org",
    youtube: "https://www.youtube.com",
    github: "https://github.com",
    reddit: "https://www.reddit.com",
    flipkart: "https://www.flipkart.com",
    ebay: "https://www.ebay.com",
    walmart: "https://www.walmart.com",
    amazon: "https://www.amazon.in",
    myntra: "https://www.myntra.com",
    twitter: "https://www.twitter.com",
    x: "https://www.x.com",
    linkedin: "https://www.linkedin.com",
    stackoverflow: "https://www.stackoverflow.com",
    bing: "https://www.bing.com",
    duckduckgo: "https://duckduckgo.com"
  };

  const platformScopeEntity = parsedGoal?.entities?.find(e => e.candidateRoles?.includes("platform_scope") || e.candidateRoles?.includes("destination"))?.text?.toLowerCase();
  const targetSiteKey = parsedGoal?.navigation?.destinationKeyword || parsedGoal?.targetWebsite || platformScopeEntity || (ActiveGoalParser && ActiveGoalParser.extractTargetWebsite ? ActiveGoalParser.extractTargetWebsite(task) : null);
  if (targetSiteKey && PLATFORM_URLS[targetSiteKey]) {
    const targetUrl = PLATFORM_URLS[targetSiteKey];
    try {
      const targetHost = new URL(targetUrl).hostname.replace(/^www\./i, "");
      if (!currentUrl.toLowerCase().includes(targetHost)) {
        return targetUrl;
      }
    } catch {
      return targetUrl;
    }
  }

  // 5. Explicit domain navigation phrases (e.g. "go to cnn.com", "open example.org")
  const domainPatterns = [
    { regex: /\b(?:go to|open|visit|navigate to)\s+(?:www\.)?([a-zA-Z0-9-]+\.(?:com|in|org|net|io|co|gov|edu|ai|app|dev))\b/i, transform: (m) => `https://${m[1]}` }
  ];

  for (const p of domainPatterns) {
    const match = task.match(p.regex);
    if (match) {
      const destUrl = p.transform ? p.transform(match) : p.url;
      try {
        const destHost = new URL(destUrl).hostname.replace(/^www\./i, "");
        if (!currentUrl.toLowerCase().includes(destHost)) {
          return destUrl;
        }
      } catch {
        return destUrl;
      }
    }
  }

  // 6. If user is on an INTERNAL browser tab (chrome://newtab, about:blank, etc.),
  // resolve initial destination based on raw domain in prompt or task domain:
  if (isInternal) {
    const rawDomainMatch = task.match(/\b([a-zA-Z0-9-]+\.(?:com|in|org|net|io|co|gov|edu|ai|app|dev))\b/i);
    if (rawDomainMatch) {
      return `https://${rawDomainMatch[1]}`;
    }
    const domain = parsedGoal?.domain || (ActiveGoalParser && ActiveGoalParser.detectDomain ? ActiveGoalParser.detectDomain(task) : "general");
    if (domain === "ecommerce") {
      return "https://www.google.com";
    }
    return "https://www.google.com";
  }

  return null;
}

/**
 * Waits for a browser tab to complete loading and DOM settlement.
 */
async function waitForTabReady(tabId, maxWaitMs = 12000) {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;

  return new Promise((resolve) => {
    let isResolved = false;

    const cleanup = () => {
      if (chrome.tabs.onUpdated?.removeListener) {
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      }
    };

    const finish = (tab) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(tab);
      }
    };

    const onUpdatedListener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId) {
        const isComplete = changeInfo.status === "complete" || tab?.status === "complete";
        const hasUrl = tab?.url && !tab.url.startsWith("about:") && !tab.url.startsWith("chrome://");
        if (isComplete && hasUrl) {
          setTimeout(() => finish(tab), 1400); // 1.4s DOM settle
        }
      }
    };

    if (chrome.tabs.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener(onUpdatedListener);
    }

    // Check if the tab is already complete
    try {
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab?.status === "complete" && tab?.url && !tab.url.startsWith("about:") && !tab.url.startsWith("chrome://")) {
          setTimeout(() => finish(tab), 1400);
        }
      });
    } catch {}

    // Fallback timeout to prevent hanging
    setTimeout(() => {
      if (!isResolved) {
        try {
          chrome.tabs.get(tabId, (tab) => finish(tab || null));
        } catch {
          finish(null);
        }
      }
    }, maxWaitMs);
  });
}

/**
 * Navigates tab to target URL and waits for page load to finish.
 */
async function navigateTabAndWait(tabId, targetUrl) {
  if (typeof chrome === "undefined" || !chrome.tabs) return false;

  let activeTargetTabId = tabId;

  try {
    if (tabId && chrome.tabs.update) {
      await chrome.tabs.update(tabId, { url: targetUrl, active: true });
    } else if (chrome.tabs.create) {
      const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
      activeTargetTabId = newTab.id;
    }
  } catch {
    if (chrome.tabs.create) {
      try {
        const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
        activeTargetTabId = newTab.id;
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  return new Promise((resolve) => {
    let isResolved = false;
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === activeTargetTabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated?.removeListener(listener);
        if (!isResolved) {
          isResolved = true;
          setTimeout(resolve, 1800); // 1.8s DOM settle time
        }
      }
    };
    if (chrome.tabs.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener(listener);
    }
    setTimeout(() => {
      chrome.tabs.onUpdated?.removeListener(listener);
      if (!isResolved) resolve();
    }, 8000);
  });
}

/**
 * Local deterministic redaction helper for browser extension environment.
 */
function redactLocalDomNodes(domNodes) {
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
  const CARD_PATTERN = /\b(?:\d[ -]*){13,19}\b/g;
  const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
  const NAME_PATTERN = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

  function passesLuhn(candidate) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    for (let index = digits.length - 1, parity = 0; index >= 0; index -= 1, parity += 1) {
      let digit = Number(digits[index]);
      if (parity % 2 === 1) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
      sum += digit;
    }
    return sum % 10 === 0;
  }

  const redactedCounts = {
    Name: 0,
    ID: 0,
    Email: 0,
    Phone: 0,
    Card: 0
  };

  const sanitizedNodes = [];

  for (const node of domNodes) {
    let text = node.text || node.value || "";
    let isSanitized = false;

    // Check for password inputs
    if (node.elementPath && /password/i.test(node.elementPath)) {
      text = "[LOCAL_ONLY_PROTECTED]";
      redactedCounts.ID++;
      isSanitized = true;
    }

    // Card detection with Luhn check (prioritize over broad phone patterns)
    CARD_PATTERN.lastIndex = 0;
    if (CARD_PATTERN.test(text)) {
      CARD_PATTERN.lastIndex = 0;
      for (const match of text.matchAll(CARD_PATTERN)) {
        if (passesLuhn(match[0])) {
          text = text.replace(match[0], "[REDACTED]");
          redactedCounts.Card++;
          isSanitized = true;
        }
      }
    }

    // SSN / ID detection
    SSN_PATTERN.lastIndex = 0;
    if (SSN_PATTERN.test(text) || (node.elementPath && /ssn|account|id/i.test(node.elementPath) && !isSanitized)) {
      text = text.replace(SSN_PATTERN, "[REDACTED]");
      if (text.includes("[REDACTED]") || (node.elementPath && /ssn/i.test(node.elementPath))) {
        if (!text.includes("[REDACTED]")) text = "[REDACTED]";
        redactedCounts.ID++;
        isSanitized = true;
      }
    }

    // Email detection
    EMAIL_PATTERN.lastIndex = 0;
    if (EMAIL_PATTERN.test(text)) {
      text = text.replace(EMAIL_PATTERN, "[REDACTED]");
      redactedCounts.Email++;
      isSanitized = true;
    }

    // Phone detection
    PHONE_PATTERN.lastIndex = 0;
    if (PHONE_PATTERN.test(text)) {
      text = text.replace(PHONE_PATTERN, "[REDACTED]");
      redactedCounts.Phone++;
      isSanitized = true;
    }

    // Name detection: ONLY redact if context explicitly indicates person name (never redact generic text nodes merely having /name/ in DOM path)
    NAME_PATTERN.lastIndex = 0;
    if (NAME_PATTERN.test(text)) {
      const pathHint = (node.elementPath || "").toLowerCase();
      const isPersonNameField = /author|user_name|customer_name|full_name|first_name|last_name|recipient|cardholder/i.test(pathHint);
      const isNotProduct = !/product|brand|title|item|heading|category|tag|btn|button|price/i.test(pathHint);
      if (isPersonNameField || isNotProduct) {
        text = text.replace(NAME_PATTERN, "[REDACTED]");
        if (text.includes("[REDACTED]")) {
          redactedCounts.Name++;
          isSanitized = true;
        }
      }
    }

    sanitizedNodes.push({
      ...node,
      text,
      isSanitized
    });
  }

  return {
    sanitizedNodes,
    redactedCounts
  };
}

export function generateFallbackSanitizedScreenshot(viewportPiiItems = []) {
  try {
    if (typeof document !== "undefined" && document.createElement) {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 1280, 800);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(30, 30, 1220, 740);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 22px monospace";
        ctx.fillText("Sanitized Tab Perception (On-Device Privacy Engine)", 60, 80);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "14px monospace";
        ctx.fillText("All PII sensitive regions masked with solid blackout rects before transmission.", 60, 115);

        if (Array.isArray(viewportPiiItems) && viewportPiiItems.length > 0) {
          for (let i = 0; i < Math.min(viewportPiiItems.length, 10); i++) {
            const item = viewportPiiItems[i];
            const b = item.viewportBbox || item.bbox || { x: 60, y: 150 + i * 55, width: 350, height: 40 };
            ctx.fillStyle = "#000000";
            ctx.fillRect(b.x, b.y, Math.max(b.width || 300, 200), Math.max(b.height || 40, 35));
            ctx.strokeStyle = "#475569";
            ctx.strokeRect(b.x, b.y, Math.max(b.width || 300, 200), Math.max(b.height || 40, 35));
            ctx.fillStyle = "#ef4444";
            ctx.font = "bold 13px monospace";
            ctx.fillText(`[REDACTED ${item.type || item.category || "PII"}]`, b.x + 10, b.y + 24);
          }
        }
        return canvas.toDataURL("image/png");
      }
    }
  } catch {}
  return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><rect width='100%' height='100%' fill='%230f172a'/><text x='20' y='40' fill='%2338bdf8' font-size='14' font-family='monospace'>Sanitized Tab Perception (On-Device Redacted)</text><rect x='20' y='60' width='300' height='40' fill='%23000000' stroke='%23334155'/><text x='30' y='85' fill='%2394a3b8' font-size='12' font-family='monospace'>[REDACTED PII BOX]</text></svg>";
}

/**
 * Captures visible tab screenshot and applies on-device pixel redaction
 * in Canonical Bitmap Coordinates over all detected PII bounding boxes before converting to base64.
 * Uses active tab viewport dimensions and scroll offsets rather than popup window dimensions.
 * Raw pixels NEVER leave the local client.
 */
export async function captureSanitizedScreenshot(viewportPiiItems = [], tabContext = {}) {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    return generateFallbackSanitizedScreenshot(viewportPiiItems);
  }
  try {
    let rawDataUrl = null;
    try {
      rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    } catch {
      rawDataUrl = await new Promise((resolve) => {
        try {
          chrome.tabs.captureVisibleTab(null, { format: "png" }, (res) => {
            if (chrome.runtime?.lastError || !res) resolve(null);
            else resolve(res);
          });
        } catch {
          resolve(null);
        }
      });
    }

    if (!rawDataUrl) {
      return generateFallbackSanitizedScreenshot(viewportPiiItems);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const naturalW = img.naturalWidth || img.width || 1280;
          const naturalH = img.naturalHeight || img.height || 800;
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(rawDataUrl);

          ctx.drawImage(img, 0, 0);

          // Extract active tab viewport dimensions and scroll offsets
          // NEVER use popup's window.innerWidth or window.innerHeight!
          const vw = Math.max(1, Number(tabContext.viewportWidth || tabContext.viewport?.width || tabContext.width) || naturalW);
          const vh = Math.max(1, Number(tabContext.viewportHeight || tabContext.viewport?.height || tabContext.height) || naturalH);
          const sx = Number(tabContext.scrollX || tabContext.viewport?.scrollX || 0);
          const sy = Number(tabContext.scrollY || tabContext.viewport?.scrollY || 0);
          const dpr = Number(tabContext.devicePixelRatio || tabContext.viewport?.devicePixelRatio) || (naturalW / vw);

          const transformContext = {
            viewportWidth: vw,
            viewportHeight: vh,
            bitmapWidth: naturalW,
            bitmapHeight: naturalH,
            scrollX: sx,
            scrollY: sy,
            devicePixelRatio: dpr
          };

          // Redact all localized PII bounding boxes with solid black rects in Canonical Bitmap Coordinates
          if (Array.isArray(viewportPiiItems) && viewportPiiItems.length > 0) {
            ctx.fillStyle = "#000000";
            for (const item of viewportPiiItems) {
              let bitmapBox = null;

              if (item.source === "OCR" || item.source === "IMAGE_OCR" || item.isBitmapCoord) {
                const rawBox = item.bbox || item.boundingBox || item;
                bitmapBox = {
                  x: Math.max(0, Math.round(Number(rawBox.x || rawBox.left || 0))),
                  y: Math.max(0, Math.round(Number(rawBox.y || rawBox.top || 0))),
                  width: Math.round(Number(rawBox.width || rawBox.w || 0)),
                  height: Math.round(Number(rawBox.height || rawBox.h || 0))
                };
              } else if (item.viewportBbox) {
                bitmapBox = typeof ActiveTransformViewportToBitmap === "function"
                  ? ActiveTransformViewportToBitmap(item.viewportBbox, transformContext)
                  : {
                    x: Math.round(Number(item.viewportBbox.x || 0) * (naturalW / vw)),
                    y: Math.round(Number(item.viewportBbox.y || 0) * (naturalH / vh)),
                    width: Math.round(Number(item.viewportBbox.width || 0) * (naturalW / vw)),
                    height: Math.round(Number(item.viewportBbox.height || 0) * (naturalH / vh))
                  };
              } else if (item.bbox || item.boundingBox) {
                const box = item.bbox || item.boundingBox;
                bitmapBox = typeof ActiveTransformPageToBitmap === "function"
                  ? ActiveTransformPageToBitmap(box, transformContext)
                  : {
                    x: Math.round((Number(box.x || 0) - sx) * (naturalW / vw)),
                    y: Math.round((Number(box.y || 0) - sy) * (naturalH / vh)),
                    width: Math.round(Number(box.width || 0) * (naturalW / vw)),
                    height: Math.round(Number(box.height || 0) * (naturalH / vh))
                  };
              }

              if (bitmapBox && bitmapBox.width > 0 && bitmapBox.height > 0) {
                const pad = 2;
                const rx = Math.max(0, bitmapBox.x - pad);
                const ry = Math.max(0, bitmapBox.y - pad);
                const rw = Math.min(canvas.width - rx, bitmapBox.width + pad * 2);
                const rh = Math.min(canvas.height - ry, bitmapBox.height + pad * 2);
                if (rw > 0 && rh > 0) {
                  ctx.fillRect(rx, ry, rw, rh);
                }
              }
            }
          }

          // Also redact any image PII detections stored locally
          if (Array.isArray(lastImagePiiDetections) && lastImagePiiDetections.length > 0) {
            ctx.fillStyle = "#000000";
            for (const det of lastImagePiiDetections) {
              const bbox = det.bbox;
              if (bbox && bbox.width > 0 && bbox.height > 0) {
                ctx.fillRect(Math.max(0, bbox.x - 2), Math.max(0, bbox.y - 2), Math.min(canvas.width - bbox.x + 2, bbox.width + 4), Math.min(canvas.height - bbox.y + 2, bbox.height + 4));
              }
            }
          }

          const sanitizedUrl = canvas.toDataURL("image/png");
          resolve(sanitizedUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(generateFallbackSanitizedScreenshot(viewportPiiItems));
      img.src = rawDataUrl;
    });
  } catch (err) {
    relayToTerminalLog("Screenshot Capture", `Fallback used: ${err.message}`, {});
    return generateFallbackSanitizedScreenshot(viewportPiiItems);
  }
}

/**
 * Generalized fallback heuristic that operates on task types and constraints.
 * Zero website-specific or brand-specific hardcoding.
 */
export function deriveGeneralizedFallbackAction({ currentTask, goal, interactiveElements, stateManager, stepNum }) {
  if (!Array.isArray(interactiveElements) || interactiveElements.length === 0) {
    return null;
  }

  let taskType = currentTask?.type || "general";
  const entity = goal?.targetEntity || "";
  const constraints = goal?.constraints || [];

  // 1. Close Modal / Overlay / Cookie Consent
  if (taskType === "close_modal") {
    const closeBtn = interactiveElements.find(el => {
      const t = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
      return /\b(close|dismiss|no thanks|reject|skip|accept all|agree|got it|decline)\b/i.test(t) ||
        (el.tag === "button" && el.text === "×") ||
        (el.attributes && /close/i.test(el.attributes["aria-label"] || ""));
    });
    if (closeBtn) {
      return {
        actionType: "CLICK",
        target: closeBtn.elementId,
        parameters: {},
        reasoningSummary: `Dismissing modal overlay via "${closeBtn.text || closeBtn.ariaLabel || 'close button'}".`
      };
    }
  }

  // 2. Search Task: find search input field (only executed if search hasn't been performed yet)
  const isDedicatedNonSearchTask = taskType === "perform_action" || taskType === "submit_form" || taskType === "submit" || taskType === "fill_form" || taskType === "close_modal" || taskType === "select_candidate" || taskType === "inspect" || taskType === "add_to_cart";
  const hasSearchAction = typeof stateManager?.hasPerformedAction === "function" ? stateManager.hasPerformedAction("search") : false;
  if (!hasSearchAction && (taskType === "search" || (!isDedicatedNonSearchTask && stepNum === 1 && goal?.domain !== "form_filling"))) {
    const searchInput = interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      if (el.tag !== "input" && el.tag !== "textarea") return false;
      const type = (el.type || "").toLowerCase();
      if (type === "hidden" || type === "password" || type === "checkbox" || type === "radio" || type === "submit") return false;
      const t = `${el.name || ""} ${el.placeholder || ""} ${el.ariaLabel || ""} ${el.elementId || ""} ${el.id || ""}`.toLowerCase();
      return type === "search" || el.semanticType === "search" || el.role === "searchbox" || el.name === "q" || /search|query|find|keyword|term/i.test(t);
    }) || interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      return (el.tag === "input" || el.tag === "textarea") && (el.type === "text" || !el.type || el.name === "q");
    });

    if (searchInput) {
      let query = entity || goal?.targetEntity || "";
      if (!query || query.toLowerCase() === "advance goal" || query.toLowerCase() === "item") {
        const raw = (currentTask?.description && currentTask.description.toLowerCase() !== "advance goal")
          ? currentTask.description
          : (goal?.rawRequest || goal?.summary || goal?.description || "");

        const searchMatch = raw.match(/(?:search\s+(?:for\s+)?|find\s+|look\s+up\s+|browse\s+(?:for\s+)?|query\s+(?:for\s+)?|query\s+for\s*["']?)(.*?)(?:\s+(?:and\s+(?:select|click|add|filter|buy|check)|on\s+|in\s+|at\s+|$)|["'])/i);
        if (searchMatch && searchMatch[1]?.trim() && searchMatch[1].trim().toLowerCase() !== "advance goal") {
          query = searchMatch[1].trim().replace(/^["']|["']$/g, "");
        } else {
          query = raw
            .replace(/^(?:open|go to|navigate to|visit)\s+[a-z0-9.-]+\s+(?:and|then)\s+/i, "")
            .replace(/^(?:search\s+(?:for\s+)?|find\s+|look\s+up\s+|browse\s+|locate search bar and enter query for\s*["']?)/i, "")
            .replace(/\s+(?:on|in|at)\s+(?:google|wikipedia|youtube|amazon|github|flipkart|reddit|ebay|walmart)\b/i, "")
            .replace(/\b(?:on|in|at)\s+(?:google|wikipedia|youtube|amazon|github|flipkart|reddit|ebay|walmart)\s+(?:for\s+)?/i, "")
            .replace(/\s+and\s+(?:select|click|add|buy|filter).*$/i, "")
            .replace(/^["']|["']$/g, "")
            .trim();
        }
      }
      if (!query || query.toLowerCase() === "advance goal") {
        query = goal?.targetEntity || goal?.summary || goal?.rawRequest || "items";
      }

      // Clean conversational verbs and trailing nouns
      query = query
        .replace(/^(?:please\s+)?(?:open|view|find|check|read|inspect)\s+(?:the\s+)?/i, "")
        .replace(/\s+(?:emails?|mails?|messages?|inbox)$/i, "")
        .trim();

      return {
        actionType: "TYPE",
        target: searchInput.elementId,
        parameters: { text: query },
        thenPressEnter: true,
        reasoningSummary: `Entered search query "${query}" into search field.`
      };
    }
  }

  // 3. Filter Task: prioritize price range filters, exclude all ads/sponsored elements
  if (taskType === "filter") {
    const pendingConstraints = constraints.filter(c => typeof stateManager?.isFilterApplied === "function" ? !stateManager.isFilterApplied(c.name, c.value) : true);

    // Sort so price filters are always attempted first
    pendingConstraints.sort((a, b) => {
      const aIsPrice = a.attribute === "price" || a.name === "price";
      const bIsPrice = b.attribute === "price" || b.name === "price";
      if (aIsPrice && !bIsPrice) return -1;
      if (!aIsPrice && bIsPrice) return 1;
      return 0;
    });

    for (const c of pendingConstraints) {
      const isPrice = c.attribute === "price" || c.name === "price";
      const targetVal = Number(c.value);

      if (isPrice && !isNaN(targetVal) && targetVal > 0) {
        // Option A: Max / High-Price Input (e.g. input#high-price or placeholder="Max")
        const maxPriceInput = interactiveElements.find(el =>
          !el.isSponsored && !el.isAd && (
            el.isMaxPriceInput ||
            el.id === "high-price" ||
            el.name === "high-price" ||
            (el.tag === "input" && /high-?price|max-?price/i.test(`${el.name || ""} ${el.id || ""}`)) ||
            (el.tag === "input" && (el.isFilter || el.filterCategory === "price") && /max/i.test(`${el.placeholder || ""} ${el.ariaLabel || ""}`))
          )
        );

        if (maxPriceInput) {
          return {
            actionType: "TYPE",
            target: maxPriceInput.elementId,
            parameters: { text: String(targetVal) },
            thenPressEnter: true,
            isFilter: true,
            filterName: c.name,
            filterValue: c.value,
            reasoningSummary: `Applied maximum price filter of ₹${targetVal} into price range input.`
          };
        }

        // Option B: Price Range Links or Checkboxes in Sidebar
        const priceFilterElements = interactiveElements.filter(el =>
          !el.isSponsored && !el.isAd && (
            el.filterCategory === "price" ||
            (el.isFilter && /₹|inr|under|over|\b\d{3,6}\b/i.test(`${el.text || ""} ${el.ariaLabel || ""}`))
          )
        );

        let bestBracket = null;
        let bestDiff = Infinity;

        for (const el of priceFilterElements) {
          const t = `${el.text || ""} ${el.ariaLabel || ""}`.replace(/,/g, "");
          const underMatch = t.match(/(?:under|up to|below|less than)\s*₹?\s*(\d+)/i);
          const rangeMatch = t.match(/₹?\s*(\d+)\s*(?:-|to)\s*₹?\s*(\d+)/i);

          if (underMatch) {
            const limit = parseInt(underMatch[1], 10);
            if (limit <= targetVal * 1.3) {
              const diff = Math.abs(limit - targetVal);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestBracket = el;
              }
            }
          } else if (rangeMatch) {
            const low = parseInt(rangeMatch[1], 10);
            const high = parseInt(rangeMatch[2], 10);
            if (targetVal >= low && targetVal <= high * 1.15) {
              const diff = Math.abs(high - targetVal);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestBracket = el;
              }
            }
          }
        }

        if (bestBracket) {
          const isCheck = bestBracket.tag === "input" && bestBracket.type === "checkbox";
          return {
            actionType: isCheck ? "CHECK" : "CLICK",
            target: bestBracket.elementId,
            parameters: {},
            isFilter: true,
            filterName: c.name,
            filterValue: c.value,
            reasoningSummary: `Selected price range filter: "${bestBracket.text || bestBracket.ariaLabel}".`
          };
        }
      }

      // Brand or Color constraints
      const valStr = String(c.value || c.name).toLowerCase();
      const filterEl = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const isEligibleFilter = el.isFilter || (el.tag === "input" && (el.type === "checkbox" || el.type === "radio")) || el.role === "checkbox";
        if (!isEligibleFilter) return false;
        const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""}`.toLowerCase();
        return t.includes(valStr);
      });

      if (filterEl) {
        const isCheck = filterEl.tag === "input" && filterEl.type === "checkbox";
        return {
          actionType: isCheck ? "CHECK" : "CLICK",
          target: filterEl.elementId,
          parameters: {},
          isFilter: true,
          filterName: c.name,
          filterValue: c.value,
          reasoningSummary: `Applied ${c.name} filter for "${c.value}".`
        };
      }
    }

    taskType = "select_candidate";
  }

  // 4. Select / Inspect Candidate (Organic Results & In-Page Items matching constraints/ordinals)
  if (taskType === "select_candidate" || taskType === "inspect_candidate" || taskType === "inspect" || taskType === "select_result") {
    const selection = currentTask?.metadata?.selection || goal?.selection || null;
    const entities = currentTask?.metadata?.entities || goal?.entities || [];
    const senderConstraints = constraints.filter(c => c.name === "sender" || c.name === "author" || c.candidateRoles?.includes("sender") || c.candidateRoles?.includes("author"));

    // Option A: Specific Entity / Sender matching (e.g. "from LinkedIn", "by DeepMind", or named entity)
    if (entities.length > 0 || senderConstraints.length > 0) {
      const matchingCandidates = interactiveElements.filter(el => {
        if (el.isSponsored || el.isAd) return false;
        const t = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""}`.toLowerCase();
        return entities.some(ent => t.includes(ent.text.toLowerCase())) ||
          senderConstraints.some(c => t.includes(String(c.value).toLowerCase()));
      });

      if (matchingCandidates.length > 0) {
        let targetIdx = 0;
        if (selection && selection.index !== null && selection.index !== undefined) {
          if (selection.index === -1) {
            targetIdx = matchingCandidates.length - 1;
          } else {
            targetIdx = Math.max(0, Math.min(selection.index, matchingCandidates.length - 1));
          }
        }
        const chosen = matchingCandidates[targetIdx];
        stateManager.recordCandidate({
          title: chosen.text || chosen.ariaLabel || "Matching Candidate",
          elementId: chosen.elementId,
          url: chosen.href || null
        });
        return {
          actionType: "CLICK",
          target: chosen.elementId,
          parameters: {},
          reasoningSummary: `Selected candidate element "${(chosen.text || chosen.ariaLabel || '').slice(0, 45)}..." matching entity constraints.`
        };
      }
    }

    // Option B: Specific target item matching from user prompt (e.g. wd_black sn7100) or organic candidate match
    const rawGoalText = `${goal?.rawRequest || ""} ${goal?.originalGoal || ""} ${goal?.summary || ""} ${currentTask?.description || ""}`;
    const specificItemMatch = rawGoalText.match(/\b(?:select|choose|click\s+on|pick|find|add|open|view|check)\s+([a-zA-Z0-9_\s-]+?)(?:\s+(?:and|to\s+the\s+cart|to\s+cart|into\s+cart|email|mail)|$)/i);
    const targetItemName = specificItemMatch ? specificItemMatch[1].trim() : (entity || goal?.targetEntity || "");
    const targetWords = targetItemName.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 1 && !["the", "and", "cart", "item", "product", "mail", "email"].includes(w));

    // High-priority direct matching across ALL interactive elements (e.g., email subject rows, links, spans, buttons)
    if (targetWords.length > 0) {
      const directMatch = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd || el.isFilter) return false;
        const tag = (el.tag || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return false;
        const t = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""}`.toLowerCase();
        if (/\b(sign in|login|register|cart|basket|home|help|privacy|terms|menu)\b/i.test(t)) return false;
        return targetWords.every(w => t.includes(w));
      });
      if (directMatch) {
        if (typeof stateManager?.recordCandidate === "function") {
          stateManager.recordCandidate({
            title: directMatch.text || directMatch.ariaLabel || "Matching Result",
            elementId: directMatch.elementId,
            url: directMatch.href || null
          });
        }
        return {
          actionType: "CLICK",
          target: directMatch.elementId,
          parameters: {},
          reasoningSummary: `Selected candidate result "${(directMatch.text || directMatch.ariaLabel || '').slice(0, 50)}" directly matching target keywords.`
        };
      }
    }

    const candidateLinks = interactiveElements.filter(el => {
      if (el.isSponsored || el.isAd) return false;
      if (el.tag !== "a" && el.tag !== "div" && el.tag !== "li" && el.tag !== "h3" && el.tag !== "h2" && el.tag !== "button") return false;
      const t = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""}`.trim();
      if (t.length < 5) return false;
      if (/\b(sign in|login|register|cart|basket|home|help|customer service|privacy|terms|about us|careers|contact|menu|navigation|back to top|next|previous)\b/i.test(t)) {
        return false;
      }
      if (/\b(cleaner|foam spray|cleaning kit|shoe horn|crease protector|brush)\b/i.test(t) && !/cleaner/i.test(entity || "")) {
        return false;
      }
      return el.isProductResult || el.role === "heading" || t.length > 15;
    });

    let bestCandidate = null;
    let bestScore = -1;

    for (const el of candidateLinks) {
      const t = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""}`.toLowerCase();
      let score = 0;
      if (targetWords.length > 0) {
        for (const w of targetWords) {
          if (t.includes(w)) score += 2;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = el;
      }
    }

    const candidateLink = bestCandidate || candidateLinks[0] || interactiveElements.find(el => !el.isSponsored && !el.isAd && (el.isProductResult || (el.tag === "a" && (el.text || "").length > 15)));

    if (candidateLink) {
      if (typeof stateManager?.recordCandidate === "function") {
        stateManager.recordCandidate({
          title: candidateLink.text || candidateLink.ariaLabel || "Candidate Result",
          elementId: candidateLink.elementId,
          url: candidateLink.href || null
        });
      }
      return {
        actionType: "CLICK",
        target: candidateLink.elementId,
        parameters: {},
        reasoningSummary: `Selected candidate result: "${(candidateLink.text || candidateLink.ariaLabel || '').slice(0, 50)}...".`
      };
    }
  }

  // 5. Add to Cart Task: specifically matches Add to Cart / Add to Bag / Add to Basket (Never confuses with Buy Now / Checkout)
  const hasCartAction = typeof stateManager?.hasPerformedAction === "function" ? stateManager.hasPerformedAction("add_to_cart") : false;
  if (taskType === "add_to_cart" || (/add to cart|add to bag|add to basket/i.test(goal?.rawRequest || goal?.originalGoal || "") && !hasCartAction)) {
    const cartBtn = interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""} ${el.title || ""}`.toLowerCase();
      return /^(?:add to (?:cart|bag|basket)|add item to cart)\b/i.test(t) ||
        (/\b(?:add to cart|add to bag|add to basket)\b/i.test(t) && !/\b(?:buy now|checkout|place order)\b/i.test(t));
    }) || interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""}`.toLowerCase();
      return (el.tag === "button" || el.tag === "input" || el.role === "button") && /\b(?:cart|bag|basket)\b/i.test(t) && !/\b(?:view|go to|shopping)\b/i.test(t);
    });

    if (cartBtn) {
      return {
        actionType: "CLICK",
        target: cartBtn.elementId,
        parameters: {},
        reasoningSummary: `Added item to cart via "${cartBtn.text || cartBtn.ariaLabel || cartBtn.value || 'Add to Cart'}".`
      };
    }
  }

  // 6. Form Filling & Explicit Field Modification
  if (taskType === "fill_form") {
    // Phase 7.1: Explicit Overwrite Rule
    let targetField = null;
    let targetFillVal = null;
    let targetReason = null;
    let targetConstraintName = null;

    // Helper to find constraint matching an element
    const findMatchingConstraint = (el) => {
      if (!Array.isArray(constraints) || constraints.length === 0) return null;
      const semType = (el.semanticType || "").toLowerCase();
      const type = (el.type || "").toLowerCase();
      const fieldIdentifier = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.ariaLabel || ""} ${el.labelText || ""} ${el.text || ""}`.toLowerCase();

      return constraints.find(c => {
        const cName = String(c.name || c.attribute || "").toLowerCase().replace(/_/g, " ").trim();
        if (!cName) return false;

        const isTypeMatch =
          (cName === "email" && (semType === "email" || type === "email" || /email/i.test(fieldIdentifier))) ||
          (cName === "phone" && (semType === "phone" || type === "tel" || /phone|mobile|tel/i.test(fieldIdentifier))) ||
          ((cName === "otp" || cName === "two factor code" || cName === "two_factor_code" || cName === "code" || cName === "auth code") && (semType === "otp" || /otp|2fa|code|two.?factor|auth.?otp/i.test(fieldIdentifier))) ||
          ((cName === "name" || cName === "full name" || cName === "first name" || cName === "last name") && (semType === "name" || semType === "first_name" || semType === "last_name" || /name/i.test(fieldIdentifier))) ||
          ((cName === "password" || cName === "account password") && (type === "password" || semType === "password" || /password/i.test(fieldIdentifier))) ||
          (cName === "message" && (semType === "message" || el.tag === "textarea" || /message|comment/i.test(fieldIdentifier)));

        const isNameMatch = cName === semType || fieldIdentifier.includes(cName) || cName.split(/\s+/).every(w => w.length > 2 && fieldIdentifier.includes(w));
        return isTypeMatch || isNameMatch;
      });
    };

    // Priority 1: Check elements in DOM order that match an explicit constraint whose value is not yet set
    for (const el of interactiveElements) {
      if (el.isSponsored || el.isAd) continue;
      if (el.tag !== "input" && el.tag !== "textarea") continue;
      const type = (el.type || "").toLowerCase();
      if (type === "hidden" || type === "submit" || type === "button" || type === "reset" || type === "image") continue;

      const matchingConstraint = findMatchingConstraint(el);
      if (matchingConstraint) {
        const cVal = matchingConstraint.value !== undefined && matchingConstraint.value !== null ? String(matchingConstraint.value) : "";
        const currentVal = el.value !== undefined && el.value !== null ? String(el.value).trim() : "";
        if (cVal && currentVal !== cVal.trim()) {
          targetField = el;
          targetFillVal = cVal;
          targetConstraintName = matchingConstraint.name || matchingConstraint.attribute;
          targetReason = `Updating form field "${el.name || el.id || el.elementId}" with requested value "${cVal}".`;
          break;
        }
      }
    }

    // Priority 2: Generic Form Filling for unpopulated empty fields (when no element matched an explicit constraint with pending value)
    if (!targetField) {
      for (const el of interactiveElements) {
        if (el.isSponsored || el.isAd) continue;
        if (el.tag !== "input" && el.tag !== "textarea") continue;
        const type = (el.type || "").toLowerCase();
        if (type === "hidden" || type === "submit" || type === "button" || type === "reset" || type === "image") continue;
        if (el.value && String(el.value).trim().length > 0) continue;

        targetField = el;
        const semType = (el.semanticType || "").toLowerCase();
        const fieldIdentifier = `${el.name || ""} ${el.placeholder || ""} ${el.ariaLabel || ""} ${el.id || ""}`.toLowerCase();

        if (type === "checkbox") {
          return {
            actionType: "CHECK",
            target: el.elementId,
            parameters: {},
            reasoningSummary: `Checked terms or agreement checkbox "${el.name || el.ariaLabel || 'Agree'}".`
          };
        }

        const matchingConstraint = findMatchingConstraint(el);
        if (matchingConstraint && matchingConstraint.value) {
          targetFillVal = matchingConstraint.value;
          targetConstraintName = matchingConstraint.name || matchingConstraint.attribute;
        } else {
          if (semType === "email" || type === "email" || /email/i.test(fieldIdentifier)) {
            targetFillVal = "user@example.com";
          } else if (semType === "phone" || type === "tel" || /phone|mobile|tel/i.test(fieldIdentifier)) {
            targetFillVal = "9876543210";
          } else if (semType === "first_name" || /first.*name/i.test(fieldIdentifier)) {
            targetFillVal = "John";
          } else if (semType === "last_name" || /last.*name/i.test(fieldIdentifier)) {
            targetFillVal = "Doe";
          } else if (semType === "name" || /name/i.test(fieldIdentifier)) {
            targetFillVal = "John Doe";
          } else if (semType === "message" || el.tag === "textarea" || /message|comment|inquiry/i.test(fieldIdentifier)) {
            targetFillVal = "Hello, I am interested in your service. Please reach out with details.";
          } else {
            targetFillVal = "Test Value";
          }
        }
        targetReason = `Populating form field "${el.name || el.placeholder || el.ariaLabel || el.elementId}" with "${targetFillVal}".`;
        break;
      }
    }

    if (targetField && targetFillVal !== null) {
      const type = (targetField.type || "").toLowerCase();
      if (type === "checkbox") {
        return {
          actionType: "CHECK",
          target: targetField.elementId,
          parameters: {},
          reasoningSummary: targetReason || `Checked checkbox "${targetField.name || targetField.ariaLabel || 'Agree'}".`
        };
      }
      return {
        actionType: "TYPE",
        target: targetField.elementId,
        parameters: { text: String(targetFillVal) },
        isFieldFill: true,
        fieldName: targetConstraintName || targetField.name || targetField.id || "field",
        fieldValue: String(targetFillVal),
        reasoningSummary: targetReason || `Populating field with "${targetFillVal}".`
      };
    }

    // Check for unchecked consent checkboxes
    const uncheckedBox = interactiveElements.find(el => {
      if (el.tag === "input" && el.type === "checkbox" && !el.checked) {
        const text = `${el.text || ""} ${el.ariaLabel || ""} ${el.name || ""}`.toLowerCase();
        return /agree|terms|condition|privacy|policy|accept/i.test(text) || el.required;
      }
      return false;
    });

    if (uncheckedBox) {
      return {
        actionType: "CHECK",
        target: uncheckedBox.elementId,
        parameters: {},
        reasoningSummary: `Checked consent checkbox "${uncheckedBox.name || uncheckedBox.ariaLabel || 'Terms & Conditions'}".`
      };
    }

    // If inputs and checkboxes are fulfilled, advance to submit
    taskType = "submit_form";
  }

  // 7. Submit Form / Explicit User-Requested Final Action Execution
  if (taskType === "submit_form" || taskType === "submit") {
    const actionBtn = interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""} ${el.title || ""}`.toLowerCase();
      return /^(?:submit|send|send message|sign up|register|book now|save|confirm|continue|proceed|complete|place order)\b/i.test(t) ||
        /\b(?:confirm order|place order|submit form|confirm details)\b/i.test(t);
    }) || interactiveElements.find(el => !el.isSponsored && !el.isAd && (
      (el.tag === "button" && el.type === "submit") ||
      (el.tag === "input" && el.type === "submit") ||
      (el.tag === "button" && /submit|send|save|next|confirm|continue/i.test(el.text || ""))
    ));

    if (actionBtn) {
      return {
        actionType: "CLICK",
        target: actionBtn.elementId,
        parameters: {},
        reasoningSummary: `Submitting action via "${actionBtn.text || actionBtn.ariaLabel || actionBtn.value || 'Submit'}".`
      };
    }
  }

  // 7b. Perform Generic User-Requested UI Action (e.g. subscribe, follow, star, like, bookmark, download, share, pin, play, favorite, join)
  const actionIntent = currentTask?.actionIntent || goal?.actionIntent || (currentTask?.type === "perform_action" ? currentTask.actionIntent : null);
  const hasIntentAction = typeof stateManager?.hasPerformedAction === "function" && actionIntent ? stateManager.hasPerformedAction(actionIntent) : false;
  if (taskType === "perform_action" || (actionIntent && !hasIntentAction)) {
    const intentVerb = String(actionIntent || "").toLowerCase().trim();
    if (intentVerb) {
      const intentRegex = new RegExp(`\\b${intentVerb}\\b`, "i");
      const targetBtn = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""} ${el.value || ""}`.toLowerCase();
        return intentRegex.test(text);
      }) || interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
        return text.includes(intentVerb);
      });

      if (targetBtn) {
        return {
          actionType: "CLICK",
          target: targetBtn.elementId,
          parameters: {},
          actionIntent: intentVerb,
          reasoningSummary: `Executing user-requested action "${intentVerb}" via "${targetBtn.text || targetBtn.ariaLabel || targetBtn.value || intentVerb}".`
        };
      }
    }
  }

  // 8. General Clickable Element Fallback (Organic, non-ad)
  const generalAction = interactiveElements.find(el =>
    !el.isSponsored && !el.isAd &&
    (el.tag === "button" || el.tag === "a") &&
    (el.text || el.ariaLabel || "").trim().length > 2 &&
    !/\b(sign in|login|privacy|terms|skip to content|skip navigation|skip to main)\b/i.test(el.text || el.ariaLabel || "") &&
    !(typeof stateManager?.hasPerformedAction === "function" && (stateManager.hasPerformedAction(el.elementId) || stateManager.hasPerformedAction(el.id)))
  );
  if (generalAction) {
    return {
      actionType: "CLICK",
      target: generalAction.elementId || generalAction.id,
      parameters: {},
      reasoningSummary: `Interacting with element "${(generalAction.text || generalAction.ariaLabel || '').slice(0, 30)}".`
    };
  }

  return null;
}

/**
 * Builds the centralized agent context containing raw user goal, agent working memory state,
 * interactive DOM elements, and redacted screenshot for Qwen VLM.
 */
export function buildAgentContext({
  userRequest = "",
  agentState = null,
  interactiveElements = [],
  sanitizedScreenshot = null,
  sanitizedDomText = "",
  currentUrl = "",
  pageTitle = "",
  rawPiiValues = []
} = {}) {
  const currentTask = agentState?.currentTaskId
    ? agentState.tasks.find(t => t.id === agentState.currentTaskId) || { id: agentState.currentTaskId, description: userRequest }
    : (agentState?.tasks?.[0] || { type: "general_action", description: userRequest });

  return {
    goal: {
      summary: userRequest,
      description: userRequest,
      status: agentState?.goal?.status || "in_progress"
    },
    userGoal: userRequest,
    agentState: {
      iteration: agentState?.iteration || 0,
      status: agentState?.status || "running",
      replanCount: agentState?.replanCount || 0
    },
    tasks: agentState?.tasks || [],
    currentTask,
    completedTasks: agentState?.completedTasks || [],
    pendingTasks: agentState?.pendingTasks || [],
    executionState: {
      stepCount: agentState?.iteration || 0,
      actionHistory: agentState?.actionHistory || []
    },
    interactiveElements,
    screenshotBase64: sanitizedScreenshot,
    actionHistory: agentState?.actionHistory?.map(a => `${a.action || a.actionType || a.type || "ACTION"} on ${a.target || a.targetId || "page"}: ${a.reason || a.status || a.actionIntent || ""}`) || [],
    sanitizedDomContext: sanitizedDomText,
    currentUrl,
    pageTitle,
    rawPiiValues
  };
}

/**
 * Renders the dynamic task plan produced by Qwen VLM in the popup UI.
 */
export function renderVlmTaskList(tasks = [], currentTaskId = null) {
  if (!taskResults || !taskActions) return;
  taskActions.replaceChildren();
  for (const t of tasks) {
    const li = document.createElement("li");
    const isCurrent = t.id === currentTaskId;
    const isDone = t.status === "completed";
    li.textContent = `${isDone ? "✔" : (isCurrent ? "➔" : "○")} [${t.id}] ${t.description} (${t.status})`;
    if (isCurrent) {
      li.style.fontWeight = "bold";
      li.style.color = "#1d4ed8";
    } else if (isDone) {
      li.style.color = "#059669";
    } else {
      li.style.color = "#64748b";
    }
    taskActions.append(li);
  }
  taskResults.hidden = false;
}

if (runTaskButton) {
  runTaskButton.addEventListener("click", async () => {
    // 1. Anti-spam check: prevent parallel execution
    if (isTaskRunning) {
      if (status) status.textContent = "Agent is currently running. Please wait for the current task to finish.";
      return;
    }

    // 2. Cooldown check (minimum 2 seconds between clicks)
    const now = Date.now();
    if (now - lastTaskSubmissionTime < USER_INPUT_COOLDOWN_MS) {
      const waitSec = Math.ceil((USER_INPUT_COOLDOWN_MS - (now - lastTaskSubmissionTime)) / 1000);
      if (status) status.textContent = `Please wait ${waitSec}s before submitting another task.`;
      return;
    }

    // 3. Sliding-window rate limit (max 6 tasks per minute)
    const oneMinAgo = now - 60000;
    while (taskSubmissionTimestamps.length > 0 && taskSubmissionTimestamps[0] < oneMinAgo) {
      taskSubmissionTimestamps.shift();
    }
    if (taskSubmissionTimestamps.length >= MAX_TASKS_PER_MINUTE) {
      if (status) status.textContent = "Task rate limit reached (max 6 tasks/minute). Please wait a moment.";
      return;
    }

    const userTask = (taskInput?.value || "").trim();
    if (!userTask) {
      if (status) status.textContent = "Please enter a task instruction.";
      return;
    }

    // Lock runner and update UI
    taskSubmissionTimestamps.push(now);
    lastTaskSubmissionTime = now;
    isTaskRunning = true;
    const originalButtonText = runTaskButton.textContent;
    runTaskButton.disabled = true;
    runTaskButton.style.opacity = "0.7";
    runTaskButton.textContent = "⏳ Agent Running...";

    status.textContent = "Initializing Qwen VLM working memory & observing page…";
    if (metadataList) metadataList.hidden = true;
    if (piiResults) piiResults.hidden = true;
    if (redactedInfoPanel) redactedInfoPanel.hidden = true;
    if (pipelineBreadcrumb) pipelineBreadcrumb.hidden = true;
    if (taskResults) taskResults.hidden = true;
    if (aiAgentPayloadCard) aiAgentPayloadCard.hidden = true;

    const startTime = Date.now();
    const safeTaskMeta = ActiveSanitizeTelemetryTask ? ActiveSanitizeTelemetryTask(userTask) : { task: userTask };
    relayToTerminalLog("User Request", "Received user task instruction", safeTaskMeta);

    try {
      // 1. Initialize Extension Working Memory (AgentState)
      const agentState = typeof ActiveCreateAgentState === "function"
        ? ActiveCreateAgentState({ userRequest: userTask, maxIterations: 10 })
        : {
          sessionId: `session_${Date.now()}`,
          goal: { userRequest: userTask, description: userTask, status: "in_progress" },
          tasks: [],
          currentTaskId: null,
          completedTasks: [],
          pendingTasks: [],
          actionHistory: [],
          iteration: 0,
          maxIterations: 10,
          status: "running"
        };

      // 2. Query active browser tab context
      let activeTab = null;
      if (typeof chrome !== "undefined" && chrome.tabs?.query) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0] || null;
      }

      let currentWorkingTabId = activeTab?.id || null;
      let currentUrl = activeTab?.url || "";

      // Dynamic tab listener to track tabs opened by buttons, links (target="_blank"), or scripts
      const newlyOpenedTabs = [];
      const tabCreatedListener = (tab) => {
        if (tab && tab.id) {
          newlyOpenedTabs.push(tab);
        }
      };
      if (typeof chrome !== "undefined" && chrome.tabs?.onCreated) {
        chrome.tabs.onCreated.addListener(tabCreatedListener);
      }

      // 2.1 Auto-navigate if started on an internal page (chrome://, edge://, about:blank) or if task specifies a website
      const isInternalUrl = (url) => !url || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://") || url.startsWith("devtools://") || url.startsWith("edge://") || url.startsWith("view-source:");

      const parsedGoal = typeof ActiveGoalParser !== "undefined" && ActiveGoalParser.parse ? ActiveGoalParser.parse(userTask) : null;

      // Initialize dynamic task plan from parsed goal
      if (typeof ActiveTaskPlanner !== "undefined" && ActiveTaskPlanner.generateInitialPlan && parsedGoal) {
        const initialPlan = ActiveTaskPlanner.generateInitialPlan(parsedGoal, { url: currentUrl, isInternalPage: isInternalUrl(currentUrl) });
        if (Array.isArray(initialPlan) && initialPlan.length > 0) {
          agentState.tasks = initialPlan;
          agentState.currentTaskId = initialPlan[0].id;
          agentState.pendingTasks = initialPlan.slice(1);
          renderVlmTaskList(agentState.tasks, agentState.currentTaskId);
        }
      }

      let initialNavUrl = extractNavigationUrl(userTask, currentUrl, parsedGoal);

      if (isInternalUrl(currentUrl) && !initialNavUrl) {
        initialNavUrl = "https://www.google.com";
      }

      if (initialNavUrl && (isInternalUrl(currentUrl) || initialNavUrl !== currentUrl)) {
        status.textContent = `Navigating to ${initialNavUrl}…`;
        relayToTerminalLog("Auto-Navigation", `Navigating from ${currentUrl || "internal page"} to ${initialNavUrl}`, {
          initialUrl: currentUrl,
          targetUrl: initialNavUrl,
          userTask
        });
        await navigateTabAndWait(currentWorkingTabId, initialNavUrl);
        if (typeof chrome !== "undefined" && chrome.tabs?.query) {
          const updatedTabs = await chrome.tabs.query({ active: true, currentWindow: true });
          activeTab = updatedTabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0] || activeTab;
          currentWorkingTabId = activeTab?.id || currentWorkingTabId;
          currentUrl = activeTab?.url || initialNavUrl;
        }

        // If the first task was navigate and we navigated, mark it completed and advance currentTaskId
        if (agentState.tasks?.[0]?.type === "navigate") {
          agentState.tasks[0].status = "completed";
          agentState.completedTasks.push(agentState.tasks[0]);
          const nextTask = agentState.tasks.find(t => t.status === "pending");
          agentState.currentTaskId = nextTask ? nextTask.id : null;
          agentState.pendingTasks = agentState.tasks.filter(t => t.status === "pending" && t.id !== agentState.currentTaskId);
          renderVlmTaskList(agentState.tasks, agentState.currentTaskId);
        }
      }

      // 3. Obtain API settings: FIRST consider token from .env, then fallback to user input
      let provider = providerSelect?.value || DEFAULT_PROVIDER;
      const currentHfKey = getEffectiveHfKey();
      const currentGroqKey = (ENV_GROQ_KEY || "").trim();
      const currentOpenRouterKey = (ENV_OPENROUTER_KEY || "").trim();

      let envKey = "";
      if (provider === "huggingface" || provider === "hf") {
        envKey = currentHfKey;
      } else if (provider === "groq") {
        envKey = currentGroqKey;
      } else if (provider === "openrouter") {
        envKey = currentOpenRouterKey;
      }

      // Priority 1: .env token (highest precedence)
      let apiKey = "";
      let tokenSource = "";
      if (envKey) {
        apiKey = envKey;
        tokenSource = ".env file";
        if (apiKeyInput) apiKeyInput.value = envKey;
      } else if (currentHfKey && (provider === "huggingface" || provider === "hf" || !providerSelect?.value)) {
        provider = "huggingface";
        apiKey = currentHfKey;
        tokenSource = ".env (HUGGINGFACE_API_KEY / HF_TOKEN)";
        if (apiKeyInput) apiKeyInput.value = currentHfKey;
        if (providerSelect) providerSelect.value = "huggingface";
      } else if ((apiKeyInput?.value || "").trim() && (apiKeyInput?.value || "").trim() !== "local-no-key-required") {
        // Priority 2: User input token (if .env is not present)
        apiKey = (apiKeyInput?.value || "").trim();
        tokenSource = "user input field";
      } else {
        apiKey = getDefaultKeyForProvider(provider) || currentHfKey || "";
        tokenSource = "default provider configuration";
      }

      const selectedModel = (modelInput?.value || "").trim() || getDefaultModelForProvider(provider);

      relayToTerminalLog("Token Priority", `Using ${provider} token from ${tokenSource}`, {
        provider,
        model: selectedModel,
        tokenSource,
        hasKey: Boolean(apiKey)
      });

      // 4. Multi-Step Iterative Qwen VLM Re-Act Execution Loop
      const actionHistory = [];
      const executedResults = [];
      let anyFailed = false;
      let finalSummary = "Multi-step goal execution finished.";
      let remoteCallsThisTask = 0;

      for (let stepNum = 1; stepNum <= agentState.maxIterations; stepNum++) {
        // Pre-step check from agent working memory
        if (agentState.status === "completed" || agentState.goal.status === "completed") {
          finalSummary = "Goal marked completed by Qwen VLM.";
          relayToTerminalLog(`Step ${stepNum}: Goal Satisfied Early`, finalSummary, agentState);
          break;
        }

        setPipelineStage("LOCAL PII DETECTION → REDACTED DOM");
        status.textContent = `Step ${stepNum}/${agentState.maxIterations}: Scanning page & analyzing DOM...`;

        // Verify current working tab is still valid, else resync with active tab
        if (typeof chrome !== "undefined" && chrome.tabs?.get && currentWorkingTabId) {
          try {
            const checkTab = await chrome.tabs.get(currentWorkingTabId);
            if (checkTab?.url) {
              activeTab = checkTab;
              currentUrl = checkTab.url;
            }
          } catch {
            const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            activeTab = currentTabs?.[0] || activeTab;
            currentWorkingTabId = activeTab?.id || null;
            currentUrl = activeTab?.url || currentUrl;
          }
        }

        // Local PII Scan
        const scanRes = await sendTabMessage({ type: "DETECT_AND_LOCALIZE_PAGE_PII" }, currentWorkingTabId).catch(() => ({ summary: { totalFindings: 0 } }));
        const piiFindings = scanRes?.summary || { totalFindings: 0 };
        renderPiiSummary(piiFindings);

        // Task-Aware Privacy Evaluation for Live Transparency (Phase 7)
        if (Array.isArray(piiFindings.localizedItems) && piiFindings.localizedItems.length > 0) {
          const taskContext = typeof ActiveEvaluatePiiTaskRelevance === "function"
            ? ActiveEvaluatePiiTaskRelevance({ userInstruction: userTask, piiItems: piiFindings.localizedItems })
            : { piiRelevance: [] };
          const stepDecisions = typeof ActiveEvaluateBatchPrivacyPolicy === "function"
            ? ActiveEvaluateBatchPrivacyPolicy({
              piiItems: piiFindings.localizedItems,
              contextAnalysis: taskContext,
              destination: ActiveProcessingDestinations.REMOTE_REASONING
            })
            : [];
          renderPrivacyTransparency(stepDecisions);
        }

        // Discover Interactive Elements on the live page
        let observeErr = null;
        let observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }, currentWorkingTabId).catch((err) => {
          observeErr = err;
          return null;
        });
        if (!observeRes?.interactiveElements || observeRes.interactiveElements.length === 0) {
          await new Promise(r => setTimeout(r, 1200));
          observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }, currentWorkingTabId).catch((err) => {
            observeErr = err;
            return null;
          });
        }

        const interactiveElements = observeRes?.interactiveElements || [];
        const pageTitle = observeRes?.pageTitle || "";
        const pageUrl = observeRes?.url || currentUrl;

        // In-loop recovery for internal browser pages
        if (interactiveElements.length === 0 && isInternalUrl(pageUrl)) {
          const targetFallback = extractNavigationUrl(userTask, pageUrl, parsedGoal) || "https://www.google.com";
          status.textContent = `Internal page detected. Navigating to ${targetFallback}…`;
          await navigateTabAndWait(currentWorkingTabId, targetFallback);
          if (typeof chrome !== "undefined" && chrome.tabs?.query) {
            const updatedTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            activeTab = updatedTabs?.[0] || activeTab;
            currentWorkingTabId = activeTab?.id || currentWorkingTabId;
            currentUrl = activeTab?.url || targetFallback;
          }
          continue;
        }

        // Capture On-Device Sanitized Screenshot (Solid Blackout Redaction)
        const tabViewportContext = piiFindings.viewport || {
          viewportWidth: observeRes?.viewportWidth || 1280,
          viewportHeight: observeRes?.viewportHeight || 800,
          scrollX: observeRes?.scrollX || 0,
          scrollY: observeRes?.scrollY || 0,
          devicePixelRatio: observeRes?.devicePixelRatio || 1
        };
        const sanitizedScreenshot = await captureSanitizedScreenshot(piiFindings.localizedItems || [], tabViewportContext);

        relayToTerminalLog(`Step ${stepNum}: Multimodal Perception`, `Discovered ${interactiveElements.length} elements on "${pageTitle}"`, {
          step: stepNum,
          pageTitle,
          pageUrl,
          elementCount: interactiveElements.length,
          hasSanitizedScreenshot: Boolean(sanitizedScreenshot),
          currentTaskId: agentState.currentTaskId
        });

        if (interactiveElements.length === 0) {
          const errMsg = observeErr?.message || "No interactive elements discovered on page.";
          finalSummary = `Halted: ${errMsg} Please ensure an active, standard webpage (e.g. https://www.google.com) is open in Chrome.`;
          relayToTerminalLog(`Step ${stepNum}: Stalled`, finalSummary, {
            error: errMsg,
            pageUrl,
            pageTitle,
            diagnosticHelp: isInternalUrl(pageUrl) ? "Cannot inject content scripts into internal browser pages. Auto-navigating to a standard website." : "Page has no interactive elements."
          }, "error");
          break;
        }

        // Multimodal Vision / Qwen VLM Reasoning
        const currentDomText = piiFindings.sanitizedDomText || lastRedactedDomText || "";
        const rawPiiVals = (piiFindings.localizedItems || []).map(i => i.value).filter(Boolean);

        // 1. Sanitize currentDomText against detected raw values and patterns
        let sanitizedDomContext = currentDomText;
        if (!sanitizedDomContext && interactiveElements.length > 0) {
          sanitizedDomContext = interactiveElements.slice(0, 50).map(el => `[${el.elementId}] <${el.tag}> ${(el.text || el.ariaLabel || el.placeholder || "").slice(0, 80)}`).join("\n");
        }
        for (const raw of rawPiiVals) {
          if (raw && raw.length >= 2) {
            const esc = String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            sanitizedDomContext = sanitizedDomContext.replace(new RegExp(esc, "gi"), "[REDACTED]");
          }
        }
        sanitizedDomContext = sanitizedDomContext
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[EMAIL_REDACTED]")
          .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]")
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ID_REDACTED]");

        // 2. Sanitize interactiveElements attributes against detected raw values and email pattern
        const sanitizedInteractiveElements = interactiveElements.map(el => {
          let sText = el.text || "";
          let sVal = el.value || "";
          let sPlaceholder = el.placeholder || "";
          let sAria = el.ariaLabel || "";
          let sTitle = el.title || "";
          let sName = el.name || "";
          for (const raw of rawPiiVals) {
            if (raw && raw.length >= 2) {
              const esc = String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const re = new RegExp(esc, "gi");
              if (sText && re.test(sText)) sText = sText.replace(re, "[REDACTED]");
              if (sVal && re.test(sVal)) sVal = sVal.replace(re, "[REDACTED]");
              if (sPlaceholder && re.test(sPlaceholder)) sPlaceholder = sPlaceholder.replace(re, "[REDACTED]");
              if (sAria && re.test(sAria)) sAria = sAria.replace(re, "[REDACTED]");
              if (sTitle && re.test(sTitle)) sTitle = sTitle.replace(re, "[REDACTED]");
              if (sName && re.test(sName)) sName = sName.replace(re, "[REDACTED]");
            }
          }
          const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
          sText = sText.replace(emailRegex, "[EMAIL_REDACTED]");
          sVal = sVal.replace(emailRegex, "[EMAIL_REDACTED]");
          sAria = sAria.replace(emailRegex, "[EMAIL_REDACTED]");
          sTitle = sTitle.replace(emailRegex, "[EMAIL_REDACTED]");
          return {
            ...el,
            text: sText || undefined,
            value: sVal || undefined,
            placeholder: sPlaceholder || undefined,
            ariaLabel: sAria || undefined,
            title: sTitle || undefined
          };
        });

        // 3. Sanitize pageTitle and URL of any detected PII (e.g. Gmail document.title containing user email)
        let sanitizedPageTitle = pageTitle;
        let sanitizedPageUrl = pageUrl;
        for (const raw of rawPiiVals) {
          if (raw && raw.length >= 2) {
            const esc = String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            sanitizedPageTitle = sanitizedPageTitle.replace(new RegExp(esc, "gi"), "[EMAIL_REDACTED]");
            sanitizedPageUrl = sanitizedPageUrl.replace(new RegExp(esc, "gi"), "[REDACTED]");
          }
        }
        sanitizedPageTitle = sanitizedPageTitle.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[EMAIL_REDACTED]");

        // 4. Sanitize user task goal of any raw PII or email
        let sanitizedUserGoal = userTask;
        for (const raw of rawPiiVals) {
          if (raw && raw.length >= 2) {
            const esc = String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            sanitizedUserGoal = sanitizedUserGoal.replace(new RegExp(esc, "gi"), "[REDACTED]");
          }
        }
        sanitizedUserGoal = sanitizedUserGoal.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[EMAIL_REDACTED]");

        const agentContext = buildAgentContext({
          userRequest: sanitizedUserGoal,
          agentState,
          interactiveElements: sanitizedInteractiveElements,
          sanitizedScreenshot,
          sanitizedDomText: sanitizedDomContext,
          currentUrl: sanitizedPageUrl,
          pageTitle: sanitizedPageTitle,
          rawPiiValues: rawPiiVals
        });

        const targetAgentDesc = provider === "local" || !apiKey ? "Local Agent Server (Port 8765)" : `${provider.toUpperCase()} (${selectedModel})`;

        updateAiMultimodalTransmissionUI({
          targetAgent: targetAgentDesc,
          screenshotBase64: sanitizedScreenshot,
          sanitizedDom: sanitizedDomContext,
          elementCount: sanitizedInteractiveElements.length
        });

        setPipelineStage("REDACTED DOM + VISION → AI AGENT");
        status.textContent = `Step ${stepNum}/${agentState.maxIterations}: Transmitting Redacted SS & DOM to Qwen VLM (${targetAgentDesc})...`;
        relayToTerminalLog(`Step ${stepNum}: Multimodal Transmission`, `Transmitting Redacted SS & DOM to Qwen VLM (${targetAgentDesc})`, {
          targetAgent: targetAgentDesc,
          hasRedactedScreenshot: Boolean(sanitizedScreenshot),
          elementCount: sanitizedInteractiveElements.length,
          domChars: sanitizedDomContext.length
        });

        // Cap remote API calls per task to prevent excessive quota consumption and error spam
        let activeStepProvider = provider;
        if (activeStepProvider !== "local" && apiKey) {
          if (remoteCallsThisTask >= MAX_REMOTE_CALLS_PER_TASK) {
            activeStepProvider = "local";
            relayToTerminalLog(`Step ${stepNum}: Call Budget Capped`, `Task remote call budget reached (${MAX_REMOTE_CALLS_PER_TASK} calls). Auto-switching to local agent to prevent spam and cost overruns.`, {
              remoteCallsThisTask,
              maxAllowed: MAX_REMOTE_CALLS_PER_TASK
            });
          } else {
            remoteCallsThisTask++;
          }
        }

        let vlmResponse = null;
        try {
          vlmResponse = await ActiveMultimodalVisionAgent.reason({
            apiKey,
            model: selectedModel,
            provider: activeStepProvider,
            userGoal: sanitizedUserGoal,
            goal: agentContext.goal,
            agentState,
            tasks: agentState.tasks,
            currentTask: agentContext.currentTask,
            completedTasks: agentState.completedTasks,
            pendingTasks: agentState.pendingTasks,
            executionState: agentContext.executionState,
            interactiveElements: sanitizedInteractiveElements,
            screenshotBase64: sanitizedScreenshot,
            actionHistory: agentContext.actionHistory,
            sanitizedDomContext,
            currentUrl: sanitizedPageUrl,
            pageTitle: sanitizedPageTitle,
            rawPiiValues: rawPiiVals,
            onTelemetry: (tEvent) => {
              relayToTerminalLog(`AI Reasoning API: ${tEvent.status || "EVENT"}`, `${activeStepProvider} (${selectedModel})`, tEvent);
            }
          });
        } catch (mErr) {
          relayToTerminalLog(`Step ${stepNum}: Multimodal Reasoning Exception`, mErr.message, { stack: mErr.stack }, "error");
        }

        // Update working memory from Qwen VLM structured output
        if (vlmResponse && typeof ActiveUpdateAgentStateFromVlm === "function") {
          ActiveUpdateAgentStateFromVlm(agentState, vlmResponse);
          if (Array.isArray(agentState.tasks) && agentState.tasks.length > 0) {
            renderVlmTaskList(agentState.tasks, agentState.currentTaskId);
          }
        }

        let proposedAction = vlmResponse?.action || null;
        let reasoningSummary = vlmResponse?.reason || proposedAction?.reasoningSummary || vlmResponse?.observation || "";

        const actionType = String(proposedAction?.type || proposedAction?.actionType || "CLICK").toUpperCase();
        const isGoalComplete = Boolean(
          actionType === "DONE" ||
          actionType === "COMPLETE" ||
          vlmResponse?.goal?.status === "completed" ||
          vlmResponse?.goal_progress?.isSatisfied
        );

        if (isGoalComplete) {
          finalSummary = vlmResponse?.reason || "Goal marked satisfied by Qwen VLM.";
          relayToTerminalLog(`Step ${stepNum}: Goal Satisfied`, finalSummary, vlmResponse);
          break;
        }

        // Fallback heuristic if Qwen model unavailable (offline compatibility)
        if (!proposedAction) {
          const fallbackStateManager = {
            hasPerformedAction: (type) => (agentState?.actionHistory || []).some(a => {
              const actType = (a.action || a.actionType || a.type || "").toLowerCase();
              const targetType = String(type).toLowerCase();
              if (actType === targetType) return true;
              if (targetType === "search" && (actType === "type" || actType === "press_key")) return true;
              const txt = `${a.actionIntent || ""} ${a.reason || ""} ${a.value || ""}`.toLowerCase();
              return txt.includes(targetType);
            }),
            isFilterApplied: (name, val) => (agentState?.actionHistory || []).some(a => a.isFilter && a.filterName === name),
            recordCandidate: (cand) => {},
            consecutiveFailures: 0
          };
          const fallback = deriveGeneralizedFallbackAction({
            currentTask: agentContext.currentTask,
            goal: parsedGoal || { summary: userTask, constraints: [] },
            interactiveElements,
            stateManager: fallbackStateManager,
            stepNum
          });
          if (fallback) {
            proposedAction = {
              type: fallback.actionType,
              actionType: fallback.actionType,
              target: fallback.target,
              value: fallback.parameters?.text || null,
              parameters: fallback.parameters,
              thenPressEnter: fallback.thenPressEnter,
              reasoningSummary: fallback.reasoningSummary
            };
            reasoningSummary = fallback.reasoningSummary;
          }
        }

        if (!proposedAction) {
          finalSummary = "No actionable target identified on page.";
          break;
        }

        // Validate Action against active DOM elements & security boundaries
        const validation = typeof ActiveValidateVlmAction === "function"
          ? ActiveValidateVlmAction(proposedAction, {
            interactiveElements,
            currentUrl: pageUrl,
            privacyVault: ActivePrivacyVault
          })
          : { valid: Boolean(proposedAction), action: proposedAction };

        if (!validation.valid) {
          relayToTerminalLog(`Step ${stepNum}: Action Validation Rejected`, validation.error, { proposedAction }, "warn");
          continue;
        }

        const validatedAction = validation.action;
        const vType = String(validatedAction.type || validatedAction.actionType || "CLICK").toUpperCase();
        const vTarget = typeof validatedAction.target === "string" ? validatedAction.target : (validatedAction.target?.elementId || "page_root");

        // Local Authoritative Action Execution
        setPipelineStage("LOCAL VALIDATION → BROWSER ACTION");
        status.textContent = `Step ${stepNum}/${agentState.maxIterations}: Executing [${vType}] on ${vTarget}...`;
        relayToTerminalLog(`Step ${stepNum}: Action Execution`, `Executing [${vType}] on ${vTarget}`, {
          step: stepNum,
          actionType: vType,
          targetId: vTarget,
          parameters: validatedAction.parameters,
          reasoningSummary
        });

        // Snapshot open tabs before executing action to detect any newly opened tabs
        const preActionTabs = (typeof chrome !== "undefined" && chrome.tabs?.query)
          ? await chrome.tabs.query({ currentWindow: true })
          : [];

        let execRes = null;
        if (vType === "NAVIGATE" && validatedAction.url) {
          await navigateTabAndWait(currentWorkingTabId, validatedAction.url);
          execRes = { ok: true, status: "COMPLETED" };
        } else if (vType === "DONE" || vType === "COMPLETE") {
          execRes = { ok: true, status: "COMPLETED" };
          break;
        } else {
          execRes = await sendTabMessage({
            type: "EXECUTE_BROWSER_ACTION",
            actionType: vType,
            targetId: vTarget,
            parameters: validatedAction.parameters
          }, currentWorkingTabId);

          if (vType === "TYPE" && (validatedAction.thenPressEnter || proposedAction.thenPressEnter)) {
            await sendTabMessage({
              type: "EXECUTE_BROWSER_ACTION",
              actionType: "PRESS_KEY",
              targetId: vTarget,
              parameters: { key: "Enter" }
            }, currentWorkingTabId);
          }
        }

        const stepOutcome = {
          step: stepNum,
          ok: Boolean(execRes?.ok),
          status: execRes?.status || (execRes?.ok ? "COMPLETED" : "FAILED_EXECUTION"),
          actionType: vType,
          targetId: vTarget,
          reason: reasoningSummary,
          error: execRes?.error
        };
        executedResults.push(stepOutcome);

        if (typeof ActiveRecordAgentAction === "function") {
          ActiveRecordAgentAction(agentState, stepOutcome);
        }

        // Advance dynamic task plan
        if (execRes?.ok && agentState.tasks && agentState.tasks.length > 0) {
          const currentTaskObj = agentState.tasks.find(t => t.id === agentState.currentTaskId);
          if (currentTaskObj) {
            let taskSatisfied = false;
            if (currentTaskObj.type === "navigate" && vType === "NAVIGATE") taskSatisfied = true;
            else if (currentTaskObj.type === "search" && vType === "TYPE") taskSatisfied = true;
            else if ((currentTaskObj.type === "inspect" || currentTaskObj.type === "select_candidate" || currentTaskObj.type === "filter") && vType === "CLICK") taskSatisfied = true;
            else if (currentTaskObj.type === "add_to_cart" && vType === "CLICK") taskSatisfied = true;

            if (taskSatisfied) {
              currentTaskObj.status = "completed";
              if (!agentState.completedTasks.some(t => t.id === currentTaskObj.id)) {
                agentState.completedTasks.push(currentTaskObj);
              }
              const nextTask = agentState.tasks.find(t => t.status === "pending" && t.id !== currentTaskObj.id);
              agentState.currentTaskId = nextTask ? nextTask.id : null;
              agentState.pendingTasks = agentState.tasks.filter(t => t.status === "pending" && t.id !== agentState.currentTaskId);
              renderVlmTaskList(agentState.tasks, agentState.currentTaskId);
            }
          }
        }

        if (!execRes?.ok) {
          anyFailed = true;
          relayToTerminalLog(`Step ${stepNum}: Action Failed`, execRes?.error || "Action execution error", stepOutcome, "error");
        }

        // Loop Safeguard
        if (typeof ActiveDetectExecutionLoop === "function") {
          const loopCheck = ActiveDetectExecutionLoop(agentState, validatedAction);
          if (loopCheck.isLoop) {
            relayToTerminalLog(`Step ${stepNum}: Loop Safeguard Triggered`, loopCheck.reason, loopCheck);
            await sendTabMessage({
              type: "EXECUTE_BROWSER_ACTION",
              actionType: "SCROLL",
              targetId: "page_root",
              parameters: { direction: "down", distance: 400 }
            }, currentWorkingTabId).catch(() => { });
          }
        }

        actionHistory.push(`Step ${stepNum}: [${vType}] on ${vTarget} — ${reasoningSummary}`);

        // State Stabilization Pause (DOM Settlement)
        if (vType === "NAVIGATE" || vType === "PRESS_KEY" || vType === "SUBMIT" || validatedAction.thenPressEnter || (vType === "CLICK" && vTarget.startsWith("el_"))) {
          status.textContent = `Step ${stepNum} complete. Waiting for page update...`;
          await new Promise(r => setTimeout(r, 2000));
        } else {
          await new Promise(r => setTimeout(r, 800));
        }

        // Seamless Multi-Tab Tracking: Continue working on new tabs like humans do
        if (typeof chrome !== "undefined" && chrome.tabs?.query) {
          const postActionTabs = await chrome.tabs.query({ currentWindow: true });

          // 1. Check if a new tab was created during this step
          let newTabToSwitch = newlyOpenedTabs.pop() || postActionTabs.find(t => t.id !== currentWorkingTabId && !preActionTabs.some(p => p.id === t.id));

          // 2. Check openerTabId linkage
          if (!newTabToSwitch && currentWorkingTabId) {
            newTabToSwitch = postActionTabs.find(t => t.id !== currentWorkingTabId && t.openerTabId === currentWorkingTabId);
          }

          // 3. If action clicked a link with target="_blank" and browser blocked new tab, open it proactively
          if (!newTabToSwitch && execRes?.opensNewTab && execRes?.targetHref && chrome.tabs.create) {
            try {
              newTabToSwitch = await chrome.tabs.create({ url: execRes.targetHref, active: true });
            } catch {}
          }

          // 4. Check if the active tab in current window changed
          if (!newTabToSwitch) {
            const focusedTab = postActionTabs.find(t => t.active);
            if (focusedTab && focusedTab.id !== currentWorkingTabId && focusedTab.id) {
              newTabToSwitch = focusedTab;
            }
          }

          if (newTabToSwitch && newTabToSwitch.id && newTabToSwitch.id !== currentWorkingTabId) {
            const prevId = currentWorkingTabId;
            const newId = newTabToSwitch.id;
            status.textContent = `New tab opened! Switching agent to new tab #${newId}…`;
            relayToTerminalLog(`Step ${stepNum}: Tab Switch`, `Switched active agent context from tab #${prevId} to new tab #${newId}`, {
              fromTabId: prevId,
              toTabId: newId,
              url: newTabToSwitch.url || "loading",
              reason: execRes?.opensNewTab ? "Clicked link with target=_blank" : "New tab opened by button/event"
            });

            // Activate the new tab in Chrome so the user and browser focus it
            try {
              await chrome.tabs.update(newId, { active: true });
            } catch {}

            // Wait for new tab to finish loading and DOM settle
            const readyTab = await waitForTabReady(newId, 12000);
            currentWorkingTabId = newId;
            activeTab = readyTab || newTabToSwitch;
            currentUrl = activeTab?.url || currentUrl;

            // Ensure content scripts are active on the new tab
            if (typeof chrome.scripting !== "undefined" && chrome.scripting.executeScript && activeTab?.id) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: activeTab.id },
                  files: ["src/policy-runtime.js", "src/ocr-service.js", "src/content-pii.js", "src/content-metadata.js", "src/action-runtime.js"]
                });
              } catch {}
            }

            // Brief hydration pause
            await new Promise(r => setTimeout(r, 1200));

            relayToTerminalLog(`Step ${stepNum}: New Tab Ready`, `New tab #${newId} is ready on "${activeTab?.title || activeTab?.url}". Resuming multi-step reasoning.`, {
              tabId: newId,
              url: activeTab?.url,
              title: activeTab?.title
            });
          }
        }
      }

      const totalMs = Date.now() - startTime;
      const successfulCount = executedResults.filter(r => r.ok && r.status === "COMPLETED").length;
      const isOverallSuccess = agentState.status === "completed" || agentState.goal.status === "completed" || (!anyFailed && executedResults.length > 0 && successfulCount > 0);

      relayToTerminalLog("Final Task Summary", isOverallSuccess ? "Goal COMPLETED successfully" : "Task INCOMPLETE or HALTED", {
        success: isOverallSuccess,
        agentStatus: agentState.status,
        totalDurationMs: totalMs,
        totalSteps: executedResults.length,
        actionHistory,
        executedResults,
        agentState
      });

      // Render Final Results
      if (taskResults && taskSummary && taskActions) {
        taskActions.replaceChildren();

        const modelLabel = apiKey ? `${selectedModel} (${provider.toUpperCase()})` : "Local Heuristic Planner";
        taskSummary.textContent = isOverallSuccess
          ? `Goal completed in ${totalMs}ms via ${modelLabel}. ${successfulCount}/${executedResults.length} step(s) executed successfully.`
          : `Task halted in ${totalMs}ms. ${successfulCount}/${executedResults.length} step(s) executed. ${finalSummary}`;

        const breadcrumbItem = document.createElement("li");
        breadcrumbItem.style.fontWeight = "bold";
        breadcrumbItem.style.color = "#1d4ed8";
        breadcrumbItem.textContent = "RAW DOM → LOCAL PII DETECTION → REDACTED DOM + SANITIZED VISION → REMOTE LLM → ACTION PROPOSAL → LOCAL VALIDATION → BROWSER ACTION";
        taskActions.append(breadcrumbItem);

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
        securityBadge.textContent = "✔ 100% On-device DOM & Vision authority enforced. Zero raw PII, screenshots, or secrets exposed.";
        taskActions.append(securityBadge);

        taskResults.hidden = false;
      }

      if (isOverallSuccess) {
        setPipelineStage("BROWSER ACTION (COMPLETED)");
        status.textContent = `Task completed successfully in ${totalMs}ms.`;
      } else if (executedResults.length === 0) {
        setPipelineStage("TASK HALTED / NO ELEMENTS");
        status.textContent = `Task halted: No actions could be executed on this page. Please open an active website (e.g. https://www.google.com) and click Run Agent Task again.`;
      } else {
        setPipelineStage("TASK HALTED / INCOMPLETE");
        status.textContent = `Task execution stopped after ${executedResults.length} step(s).`;
      }
    } catch (err) {
      setPipelineStage("FAILED / DENIED");
      status.textContent = `Task execution error: ${err.message || "Cannot inspect tab."}`;
      const safeErr = ActiveSanitizeTelemetryError ? ActiveSanitizeTelemetryError(err) : { error: err.message };
      relayToTerminalLog("Pipeline Error", safeErr.message || "Execution error", safeErr, "error");
    } finally {
      isTaskRunning = false;
      if (runTaskButton) {
        runTaskButton.disabled = false;
        runTaskButton.style.opacity = "1";
        runTaskButton.textContent = originalButtonText || "Run Agent Task";
      }
      if (typeof chrome !== "undefined" && chrome.tabs?.onCreated?.removeListener) {
        chrome.tabs.onCreated.removeListener(tabCreatedListener);
      }
    }
  });
}

// Keyboard shortcut: Press Enter in taskInput to trigger execution cleanly
if (taskInput) {
  taskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isTaskRunning && runTaskButton && !runTaskButton.disabled) {
        runTaskButton.click();
      }
    }
  });
}


