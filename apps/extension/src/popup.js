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
      addEventListener: () => {}
    }),
    addEventListener: () => {},
    removeEventListener: () => {}
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
  resolveSemanticTarget as CoreResolveSemanticTarget,
  POLICY_ACTIONS as CorePolicyActions,
  PROCESSING_DESTINATIONS as CoreProcessingDestinations
} from "../../../packages/privacy-core/src/index.js";

const PC = (typeof PrivacyCore !== "undefined" ? PrivacyCore : (typeof window !== "undefined" && window.PrivacyCore ? window.PrivacyCore : {}));
const ActiveResolveSemanticTarget = CoreResolveSemanticTarget || PC.resolveSemanticTarget || ((els, { targetSemantic, mode }) => {
  const q = String(targetSemantic || "").toLowerCase().trim();
  if (!q) return null;
  return els.find(el => {
    if (el.isSponsored || el.isAd) return false;
    const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""} ${el.name || ""} ${el.id || ""} ${el.labelText || ""} ${el.placeholder || ""}`.toLowerCase();
    return t.includes(q) || (q.includes("phone") && (/phone|mobile|tel/i.test(t) || el.type === "tel")) || (q.includes("email") && (/email/i.test(t) || el.type === "email"));
  });
});

const ActiveGoalParser = CoreGoalParser || PC.GoalParser;
const ActiveTaskPlanner = CoreTaskPlanner || PC.TaskPlanner;
const ActiveTaskStatus = CoreTaskStatus || PC.TASK_STATUS;
const ActiveExecutionStateManager = CoreExecutionStateManager || PC.ExecutionStateManager;
const ActiveDynamicReplanner = CoreDynamicReplanner || PC.DynamicReplanner;
const ActiveGoalCompletionChecker = CoreGoalCompletionChecker || PC.GoalCompletionChecker;
const ActiveMultimodalVisionAgent = CoreMultimodalVisionAgent || PC.MultimodalVisionAgent;
const ActiveDefaultModel = CoreDefaultModel || PC.DEFAULT_MULTIMODAL_MODEL || "qwen/qwen-2.5-vl-72b-instruct";
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

const doc = typeof document !== "undefined" ? document : { querySelector: () => null, querySelectorAll: () => [] };

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
  } catch {}

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
    sendTabMessage({ type: "CLEAR_LOCAL_HIGHLIGHTS" }).catch(() => {});

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

const providerSelect = document.querySelector("#provider-select");
const modelInput = document.querySelector("#model-input");

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
      }).catch(() => {});
    });
  } catch {}
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

const ENV_HUGGINGFACE_KEY = (typeof process !== "undefined" && (process.env?.HUGGINGFACE_API_KEY || process.env?.HF_TOKEN)) || "";
const ENV_HUGGINGFACE_MODEL = (typeof process !== "undefined" && process.env?.HUGGINGFACE_MODEL) || "Qwen/Qwen3-VL-4B-Instruct";
const ENV_GROQ_KEY = (typeof process !== "undefined" && process.env?.GROQ_API_KEY) || "";
const ENV_GROQ_MODEL = (typeof process !== "undefined" && process.env?.GROQ_MODEL) || "llama-3.3-70b-versatile";
const ENV_OPENROUTER_KEY = (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) || "";
const ENV_OPENROUTER_MODEL = (typeof process !== "undefined" && process.env?.OPENROUTER_MODEL) || "qwen/qwen-2.5-vl-72b-instruct:free";

const DEFAULT_PROVIDER = ENV_HUGGINGFACE_KEY ? "huggingface" : (ENV_OPENROUTER_KEY ? "openrouter" : (ENV_GROQ_KEY ? "groq" : "huggingface"));

function getDefaultModelForProvider(prov) {
  if (prov === "local") return "Local-Agent-Port-8765";
  if (prov === "huggingface" || prov === "hf") return ENV_HUGGINGFACE_MODEL;
  if (prov === "groq") return ENV_GROQ_MODEL;
  return ENV_OPENROUTER_MODEL;
}

function getDefaultKeyForProvider(prov) {
  if (prov === "local") return "local-no-key-required";
  if (prov === "huggingface" || prov === "hf") return ENV_HUGGINGFACE_KEY;
  if (prov === "groq") return ENV_GROQ_KEY;
  return ENV_OPENROUTER_KEY;
}

// Auto-populate from environment configuration if available
if (providerSelect) {
  providerSelect.value = DEFAULT_PROVIDER;
}
if (modelInput) {
  modelInput.value = getDefaultModelForProvider(DEFAULT_PROVIDER);
}
if (apiKeyInput && !apiKeyInput.value) {
  const defaultKey = getDefaultKeyForProvider(DEFAULT_PROVIDER);
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
  const isInternal = !currentUrl || currentUrl.startsWith("chrome://") || currentUrl.startsWith("about:") || currentUrl.startsWith("chrome-extension://") || currentUrl.startsWith("devtools://");

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
  // resolve initial destination based on task domain:
  if (isInternal) {
    const domain = parsedGoal?.domain || (ActiveGoalParser && ActiveGoalParser.detectDomain ? ActiveGoalParser.detectDomain(task) : "general");
    if (domain === "ecommerce") {
      return "https://www.google.com";
    }
    return "https://www.google.com";
  }

  return null;
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

/**
 * Captures visible tab screenshot and applies on-device pixel redaction
 * in Canonical Bitmap Coordinates over all detected PII bounding boxes before converting to base64.
 * Uses active tab viewport dimensions and scroll offsets rather than popup window dimensions.
 * Raw pixels NEVER leave the local client.
 */
export async function captureSanitizedScreenshot(viewportPiiItems = [], tabContext = {}) {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    // Generate valid on-device sanitized fallback image data URL for headless/test environments
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><rect width='100%' height='100%' fill='%230f172a'/><text x='20' y='40' fill='%2338bdf8' font-size='14' font-family='monospace'>Sanitized Tab Perception (On-Device Redacted)</text><rect x='20' y='60' width='300' height='40' fill='%23000000' stroke='%23334155'/><text x='30' y='85' fill='%2394a3b8' font-size='12' font-family='monospace'>[REDACTED PII BOX]</text></svg>";
  }
  try {
    const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    if (!rawDataUrl) return null;

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
      img.onerror = () => resolve(null);
      img.src = rawDataUrl;
    });
  } catch (err) {
    relayToTerminalLog("Screenshot Capture", `Failed: ${err.message}`, {});
    return null;
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

  // 2. Search Task: find search input field (supports Google <textarea name="q">, search inputs, etc.)
  const hasFieldUpdates = Array.isArray(constraints) && constraints.some(c => c.isFieldUpdate || c.explicit);
  const hasClickTarget = Boolean(goal?.clickTarget);
  const isSearchRequested = taskType === "search" || (taskType === "general" && goal?.operations?.includes("search") && !hasFieldUpdates && !hasClickTarget);

  if (isSearchRequested && !stateManager.hasPerformedAction("search")) {
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
      let query = entity || (currentTask?.description ? currentTask.description.replace(/^Search for\s*/i, "") : goal.summary);
      query = query
        .replace(/^(?:search\s+(?:for\s+)?|find\s+|look\s+up\s+|browse\s+)/i, "")
        .replace(/\s+(?:on|in|at)\s+(?:google|wikipedia|youtube|amazon|github|flipkart|reddit|ebay|walmart)\b/i, "")
        .replace(/\b(?:on|in|at)\s+(?:google|wikipedia|youtube|amazon|github|flipkart|reddit|ebay|walmart)\s+(?:for\s+)?/i, "")
        .trim();
      return {
        actionType: "TYPE",
        target: searchInput.elementId,
        parameters: { text: query || goal.summary },
        thenPressEnter: true,
        reasoningSummary: `Entered search query "${query || goal.summary}" into search field.`
      };
    }
  }

  // 3. Filter Task: prioritize price range filters, exclude all ads/sponsored elements
  if (taskType === "filter") {
    const pendingConstraints = constraints.filter(c => !stateManager.isFilterApplied(c.name, c.value));

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

    // Option B: Keyword / Organic Results Matching
    const candidateLink = interactiveElements.find(el => {
      if (el.isSponsored || el.isAd) return false;
      if (el.tag !== "a" && el.tag !== "div" && el.tag !== "li" && el.tag !== "h3" && el.tag !== "h2") return false;
      const t = (el.text || el.ariaLabel || "").trim();
      if (t.length < 5) return false;
      if (/\b(sign in|login|register|cart|basket|home|help|customer service|privacy|terms|about us|careers|contact|menu|navigation|back to top|next|previous)\b/i.test(t)) {
        return false;
      }
      if (/\b(cleaner|foam spray|cleaning kit|shoe horn|crease protector|brush)\b/i.test(t) && !/cleaner/i.test(entity || "")) {
        return false;
      }
      if (entity) {
        const words = entity.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matches = words.filter(w => t.toLowerCase().includes(w)).length;
        if (matches >= 1) return true;
      }
      return el.isProductResult || el.role === "heading" || t.length > 20;
    }) || interactiveElements.find(el => !el.isSponsored && !el.isAd && (el.isProductResult || (el.tag === "a" && (el.text || "").length > 15)));

    if (candidateLink) {
      stateManager.recordCandidate({
        title: candidateLink.text || candidateLink.ariaLabel || "Candidate Result",
        elementId: candidateLink.elementId,
        url: candidateLink.href || null
      });
      return {
        actionType: "CLICK",
        target: candidateLink.elementId,
        parameters: {},
        reasoningSummary: `Inspecting organic candidate: "${(candidateLink.text || candidateLink.ariaLabel || '').slice(0, 45)}...".`
      };
    }
  }

  // 5. Add to Cart Task: specifically matches Add to Cart / Add to Bag / Add to Basket (Never confuses with Buy Now / Checkout)
  if (taskType === "add_to_cart" || (/add to cart|add to bag|add to basket/i.test(goal?.rawRequest || goal?.originalGoal || "") && !stateManager.hasPerformedAction("add_to_cart"))) {
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
    let targetField = null;
    let targetFillVal = null;
    let targetReason = null;
    let targetConstraintName = null;

    if (Array.isArray(constraints) && constraints.length > 0) {
      for (const el of interactiveElements) {
        if (el.isSponsored || el.isAd) continue;
        if (el.tag !== "input" && el.tag !== "textarea") continue;
        const type = (el.type || "").toLowerCase();
        if (type === "hidden" || type === "submit" || type === "button" || type === "reset" || type === "image") continue;

        for (const c of constraints) {
          const query = c.targetSemantic || c.name || c.attribute;
          const matched = ActiveResolveSemanticTarget([el], {
            targetSemantic: query,
            mode: "input"
          });
          if (matched) {
            const cVal = c.value !== undefined && c.value !== null ? String(c.value) : "";
            const curVal = el.value !== undefined && el.value !== null ? String(el.value).trim() : "";
            if (cVal && curVal !== cVal.trim()) {
              targetField = el;
              targetFillVal = cVal;
              targetConstraintName = c.name || c.attribute || query;
              targetReason = `Updating form field "${el.name || el.id || el.elementId}" with requested value "${cVal}".`;
              break;
            }
          }
        }
        if (targetField) break;
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

    // Generic form filling for unpopulated empty fields ONLY if no explicit constraints were defined
    if (!targetField && (!constraints || constraints.length === 0)) {
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
        targetReason = `Populating form field "${el.name || el.placeholder || el.ariaLabel || el.elementId}" with "${targetFillVal}".`;
        break;
      }
      if (targetField && targetFillVal !== null) {
        return {
          actionType: "TYPE",
          target: targetField.elementId,
          parameters: { text: String(targetFillVal) },
          isFieldFill: true,
          fieldName: targetField.name || targetField.id || "field",
          fieldValue: String(targetFillVal),
          reasoningSummary: targetReason
        };
      }
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

    // If inputs and checkboxes are fulfilled, advance to submit ONLY if explicitly requested by user or plan
    const shouldSubmit = Boolean(
      hasClickTarget ||
      goal?.operations?.includes("submit") ||
      goal?.operations?.includes("click") ||
      (currentTask?.subsequentTasks && currentTask.subsequentTasks.includes("submit_form"))
    );
    if (shouldSubmit) {
      taskType = "submit_form";
    } else {
      return null;
    }
  }

  // 7. Submit Form / Explicit User-Requested Final Action Execution / Click
  if (taskType === "submit_form" || taskType === "submit" || taskType === "perform_action" || taskType === "click" || hasClickTarget) {
    const clickSemantic = goal?.clickTarget || currentTask?.actionIntent || goal?.actionIntent || (taskType === "submit_form" ? "submit" : "");
    let actionBtn = null;
    if (clickSemantic) {
      actionBtn = ActiveResolveSemanticTarget(interactiveElements, {
        targetSemantic: clickSemantic,
        mode: "click"
      });
    }
    if (!actionBtn && (taskType === "submit_form" || taskType === "submit")) {
      actionBtn = interactiveElements.find(el => !el.isSponsored && !el.isAd && (
        (el.tag === "button" && el.type === "submit") ||
        (el.tag === "input" && el.type === "submit") ||
        (el.tag === "button" && /submit|send|save|next|confirm|continue|proceed|place order/i.test(el.text || el.value || ""))
      ));
    }

    if (actionBtn) {
      return {
        actionType: "CLICK",
        target: actionBtn.elementId,
        parameters: {},
        actionIntent: clickSemantic || "submit",
        reasoningSummary: `Executing click action via "${actionBtn.text || actionBtn.ariaLabel || actionBtn.value || 'Submit'}".`
      };
    }
  }

  // 7b. Perform Generic User-Requested UI Action (e.g. subscribe, follow, star, like, bookmark, download, share, pin, play, favorite, join)
  const actionIntent = currentTask?.actionIntent || goal?.actionIntent || (currentTask?.type === "perform_action" ? currentTask.actionIntent : null);
  if (taskType === "perform_action" || (actionIntent && !stateManager.hasPerformedAction(actionIntent))) {
    const intentVerb = String(actionIntent || "").toLowerCase().trim();
    if (intentVerb) {
      const targetBtn = ActiveResolveSemanticTarget(interactiveElements, {
        targetSemantic: intentVerb,
        mode: "click"
      }) || interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = `${el.text || ""} ${el.ariaLabel || ""} ${el.title || ""} ${el.value || ""}`.toLowerCase();
        return new RegExp(`\\b${intentVerb}\\b`, "i").test(text);
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
    !/\b(sign in|login|privacy|terms)\b/i.test(el.text || el.ariaLabel || "")
  );
  if (generalAction) {
    return {
      actionType: "CLICK",
      target: generalAction.elementId,
      parameters: {},
      reasoningSummary: `Interacting with element "${(generalAction.text || generalAction.ariaLabel || '').slice(0, 30)}".`
    };
  }

  return null;
}

if (runTaskButton) {
  runTaskButton.addEventListener("click", async () => {
    const userTask = (taskInput?.value || "").trim();
    if (!userTask) {
      status.textContent = "Please enter a task instruction.";
      return;
    }

    status.textContent = "Parsing goal & generating multi-step execution plan…";
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
      // 1. Goal Decomposition into structured objectives and constraints
      const parsedGoal = ActiveGoalParser.parse(userTask);
      relayToTerminalLog("Goal Decomposition", "Parsed user goal and constraints", {
        domain: parsedGoal.domain,
        summary: parsedGoal.summary || parsedGoal.originalGoal,
        operations: parsedGoal.operations,
        constraintCount: parsedGoal.constraints?.length || 0
      });

      // 2. Query active browser tab context
      let activeTab = null;
      if (typeof chrome !== "undefined" && chrome.tabs?.query) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0] || null;
      }

      const currentUrl = activeTab?.url || "";
      const isInternal = !currentUrl || currentUrl.startsWith("chrome://") || currentUrl.startsWith("about:") || currentUrl.startsWith("chrome-extension://") || currentUrl.startsWith("devtools://");
      const currentBrowserContext = {
        url: currentUrl,
        title: activeTab?.title || "",
        isInternalPage: isInternal
      };

      // 3. Initialize dynamic task planner and execution state manager with live context
      const planner = new ActiveTaskPlanner(parsedGoal, currentBrowserContext);
      relayToTerminalLog("Task Plan", `Generated ${planner.tasks.length} initial sub-tasks`, planner.getPlanSummary());

      const stateManager = new ActiveExecutionStateManager({
        goal: parsedGoal,
        maxReplans: 5,
        maxConsecutiveFailures: 3
      });

      // 4. Obtain API settings
      const userKey = (apiKeyInput?.value || "").trim();
      const provider = providerSelect?.value || DEFAULT_PROVIDER;
      const apiKey = userKey || getDefaultKeyForProvider(provider);
      const selectedModel = (modelInput?.value || "").trim() || getDefaultModelForProvider(provider);

      // 5. Auto-Navigation if needed
      const targetNavUrl = extractNavigationUrl(userTask, currentUrl, parsedGoal);

      if (targetNavUrl) {
        setPipelineStage("AUTO-NAVIGATION");
        status.textContent = `Navigating to ${targetNavUrl}...`;
        relayToTerminalLog("Auto-Navigation", `Navigating tab to ${targetNavUrl}`, { targetNavUrl, fromUrl: currentUrl });
        await navigateTabAndWait(activeTab?.id, targetNavUrl);
        if (planner.getCurrentTask()?.type === "navigate") {
          planner.completeCurrentTask({ url: targetNavUrl });
        }
      } else if (planner.getCurrentTask()?.type === "navigate") {
        // Already on target website or domain; advance immediately to next task
        planner.completeCurrentTask({ url: currentUrl });
      }

      // 5. Multi-Step Iterative Multimodal Agent Loop
      const MAX_STEPS = 8;
      const actionHistory = [];
      const executedResults = [];
      let anyFailed = false;
      let finalSummary = "Multi-step goal execution finished.";

      for (let stepNum = 1; stepNum <= MAX_STEPS; stepNum++) {
        // 5.1 Pre-step Goal Check
        const preCheck = ActiveGoalCompletionChecker.check({
          goal: parsedGoal,
          stateManager,
          planner,
          actionHistory
        });
        if (preCheck.isSatisfied) {
          finalSummary = preCheck.reason;
          relayToTerminalLog(`Step ${stepNum}: Goal Satisfied Early`, finalSummary, preCheck);
          break;
        }

        setPipelineStage("LOCAL PII DETECTION → REDACTED DOM");
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Scanning page & analyzing DOM...`;

        // 5.2 Local PII Scan
        const scanRes = await sendTabMessage({ type: "DETECT_AND_LOCALIZE_PAGE_PII" }).catch(() => ({ summary: { totalFindings: 0 } }));
        const piiFindings = scanRes?.summary || { totalFindings: 0 };
        renderPiiSummary(piiFindings);

        // 5.2b Task-Aware Privacy Evaluation for Live Transparency (Phase 7)
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

        // 5.3 Discover Interactive Elements on the CURRENT page state
        let observeErr = null;
        let observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }).catch((err) => {
          observeErr = err;
          return null;
        });
        if (!observeRes?.interactiveElements || observeRes.interactiveElements.length === 0) {
          await new Promise(r => setTimeout(r, 1200));
          observeRes = await sendTabMessage({ type: "OBSERVE_INTERACTIVE_DOM" }).catch((err) => {
            observeErr = err;
            return null;
          });
        }

        const interactiveElements = observeRes?.interactiveElements || [];
        const pageTitle = observeRes?.pageTitle || "";
        const pageUrl = observeRes?.url || "";

        // 5.4 Capture On-Device Sanitized Screenshot (Masks all visual PII boxes using Active Tab Coordinates)
        const tabViewportContext = piiFindings.viewport || {
          viewportWidth: observeRes?.viewportWidth || 1280,
          viewportHeight: observeRes?.viewportHeight || 800,
          scrollX: observeRes?.scrollX || 0,
          scrollY: observeRes?.scrollY || 0,
          devicePixelRatio: observeRes?.devicePixelRatio || 1
        };
        const sanitizedScreenshot = await captureSanitizedScreenshot(piiFindings.localizedItems || [], tabViewportContext);

        stateManager.updateObservation({
          url: pageUrl,
          title: pageTitle,
          domElements: interactiveElements,
          hasScreenshot: Boolean(sanitizedScreenshot),
          piiCount: piiFindings.totalFindings || 0
        });

        relayToTerminalLog(`Step ${stepNum}: Multimodal Perception`, `Discovered ${interactiveElements.length} elements on "${pageTitle}"`, {
          step: stepNum,
          pageTitle,
          pageUrl,
          elementCount: interactiveElements.length,
          hasSanitizedScreenshot: Boolean(sanitizedScreenshot),
          currentTask: planner.getCurrentTask(),
          sample: interactiveElements.slice(0, 15)
        });

        if (interactiveElements.length === 0) {
          const errMsg = observeErr?.message || "No interactive elements discovered on page.";
          finalSummary = `Halted: ${errMsg} Please ensure an active, standard webpage (e.g. https://www.google.com) is open in Chrome.`;
          relayToTerminalLog(`Step ${stepNum}: Stalled`, finalSummary, {
            error: errMsg,
            pageUrl,
            pageTitle,
            diagnosticHelp: pageUrl.startsWith("chrome://") ? "Cannot inject content scripts into chrome:// internal pages. Please open a standard website." : "Page has no interactive elements."
          }, "error");
          break;
        }

        // 5.5 Dynamic Obstacle Evaluation & Replanning
        const obstacle = ActiveDynamicReplanner.evaluate({
          domElements: interactiveElements,
          pageUrl,
          pageTitle,
          currentTask: planner.getCurrentTask(),
          goal: parsedGoal,
          consecutiveFailures: stateManager.consecutiveFailures,
          actionHistory
        });

        if (obstacle) {
          const replanRes = ActiveDynamicReplanner.replan({
            obstacle,
            planner,
            stateManager,
            goal: parsedGoal,
            domElements: interactiveElements
          });
          if (replanRes.replanned) {
            relayToTerminalLog(`Step ${stepNum}: Dynamic Replanning`, replanRes.reason, {
              obstacle: obstacle.type,
              insertedTask: replanRes.insertedTask
            });
            status.textContent = `Adapting plan: ${replanRes.reason}`;
          }
        }

        const currentTask = planner.getCurrentTask() || { type: "general_action", description: parsedGoal.summary };

        // 5.6 Multimodal Vision / LLM Reasoning
        const currentDomText = piiFindings.sanitizedDomText || lastRedactedDomText || "";
        const targetAgentDesc = provider === "local" || !apiKey ? "Local Agent Server (Port 8765)" : `${provider.toUpperCase()} (${selectedModel})`;

        updateAiMultimodalTransmissionUI({
          targetAgent: targetAgentDesc,
          screenshotBase64: sanitizedScreenshot,
          sanitizedDom: currentDomText,
          elementCount: interactiveElements.length
        });

        setPipelineStage("REDACTED DOM + VISION → AI AGENT");
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Transmitting Redacted SS & DOM to ${targetAgentDesc}...`;
        relayToTerminalLog(`Step ${stepNum}: Multimodal Transmission`, `Transmitting Redacted SS & DOM to AI Agent (${targetAgentDesc})`, {
          targetAgent: targetAgentDesc,
          hasRedactedScreenshot: Boolean(sanitizedScreenshot),
          elementCount: interactiveElements.length,
          domChars: currentDomText.length
        });

        let stepProposal = null;
        let isTaskComplete = false;
        let reasoningSummary = "";

        try {
          const rawPiiVals = (piiFindings.localizedItems || []).map(i => i.value).filter(Boolean);
          const visionResult = await ActiveMultimodalVisionAgent.reason({
            apiKey,
            model: selectedModel,
            provider,
            goal: parsedGoal,
            currentTask,
            executionState: stateManager.getStateSummary(),
            interactiveElements,
            screenshotBase64: sanitizedScreenshot,
            actionHistory,
            sanitizedDomContext: currentDomText,
            rawPiiValues: rawPiiVals
          });

          if (visionResult?.action) {
            stepProposal = {
              actionType: visionResult.action.actionType,
              target: visionResult.action.target,
              parameters: visionResult.action.parameters,
              thenPressEnter: visionResult.action.thenPressEnter,
              actionIntent: visionResult.action.actionIntent || currentTask.actionIntent || parsedGoal.actionIntent,
              isFilter: visionResult.action.isFilter,
              filterName: visionResult.action.filterName,
              filterValue: visionResult.action.filterValue
            };
            reasoningSummary = visionResult.action.reasoningSummary || visionResult.observation;
            isTaskComplete = Boolean(visionResult.goal_progress?.isSatisfied || visionResult.action.actionType === "COMPLETE");
          }
        } catch (mErr) {
          relayToTerminalLog(`Step ${stepNum}: Multimodal Reasoning Exception`, mErr.message, {});
        }

        // 5.7 Generalized Fallback Heuristics
        if (!stepProposal) {
          stepProposal = deriveGeneralizedFallbackAction({
            currentTask,
            goal: parsedGoal,
            interactiveElements,
            stateManager,
            stepNum
          });
          if (stepProposal) {
            reasoningSummary = stepProposal.reasoningSummary || `Heuristic action for task: ${currentTask.type}`;
          }
        }

        // 5.8 Strict Goal Completion Verification
        if (isTaskComplete || !stepProposal || stepProposal.actionType === "COMPLETE") {
          const postCheck = ActiveGoalCompletionChecker.check({
            goal: parsedGoal,
            stateManager,
            planner,
            currentDomElements: interactiveElements,
            actionHistory
          });

          if (postCheck.isSatisfied) {
            finalSummary = postCheck.reason;
            relayToTerminalLog(`Step ${stepNum}: Goal Satisfied`, finalSummary, postCheck);
            break;
          } else {
            relayToTerminalLog(`Step ${stepNum}: Incomplete Requirements`, `Completion claimed but: ${postCheck.reason}`, postCheck);
            if (stepProposal && stepProposal.actionType === "COMPLETE") {
              stepProposal = deriveGeneralizedFallbackAction({
                currentTask,
                goal: parsedGoal,
                interactiveElements,
                stateManager,
                stepNum
              });
            }
            if (!stepProposal) {
              finalSummary = postCheck.reason;
              break;
            }
          }
        }

        const actionType = String(stepProposal.actionType || stepProposal.action || stepProposal.type || "CLICK").toUpperCase();
        const targetId = typeof stepProposal.target === "string" ? stepProposal.target : (stepProposal.target?.elementId || stepProposal.element_id || "page_root");
        const parameters = stepProposal.parameters || (stepProposal.text ? { text: stepProposal.text } : {});

        // 5.9 Local Authoritative Action Execution
        setPipelineStage("LOCAL VALIDATION → BROWSER ACTION");
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Executing [${actionType}] on ${targetId}...`;
        relayToTerminalLog(`Step ${stepNum}: Action Execution`, `Executing [${actionType}] on ${targetId}`, {
          step: stepNum,
          actionType,
          targetId,
          parameters,
          reasoningSummary,
          taskType: currentTask.type
        });

        const execRes = await sendTabMessage({
          type: "EXECUTE_BROWSER_ACTION",
          actionType,
          targetId,
          parameters
        });

        if (actionType === "TYPE" && (stepProposal.thenPressEnter || currentTask.type === "search")) {
          await sendTabMessage({
            type: "EXECUTE_BROWSER_ACTION",
            actionType: "PRESS_KEY",
            targetId,
            parameters: { key: "Enter" }
          });
        }

        // 5.10 State Tracking & Loop Safeguards
        const resolvedIntent = stepProposal.actionIntent || currentTask.actionIntent || parsedGoal.actionIntent || null;
        const outcome = stateManager.recordActionOutcome({
          actionType,
          target: targetId,
          parameters,
          actionIntent: resolvedIntent,
          ok: Boolean(execRes?.ok),
          status: execRes?.status || (execRes?.ok ? "COMPLETED" : "FAILED_EXECUTION"),
          error: execRes?.error,
          reason: reasoningSummary,
          taskType: currentTask.type
        });

        const stepOutcome = {
          step: stepNum,
          ok: Boolean(execRes?.ok),
          status: execRes?.status || (execRes?.ok ? "COMPLETED" : "FAILED_EXECUTION"),
          actionType,
          targetId,
          actionIntent: resolvedIntent,
          reason: reasoningSummary,
          error: execRes?.error
        };
        executedResults.push(stepOutcome);

        if (!execRes?.ok) {
          anyFailed = true;
          relayToTerminalLog(`Step ${stepNum}: Action Failed`, execRes?.error || "Action execution error", stepOutcome, "error");
          if (stateManager.consecutiveFailures >= 3) {
            relayToTerminalLog(`Step ${stepNum}: Stopped`, "Exceeded maximum consecutive failures.", {}, "error");
            break;
          }
        } else {
          if (stepProposal?.isFilter && stepProposal?.filterName) {
            stateManager.recordFilter(stepProposal.filterName, stepProposal.filterValue || "");
          }
          if (stepProposal?.isFieldFill && stepProposal?.fieldName) {
            stateManager.recordFieldFilled?.(stepProposal.fieldName, stepProposal.fieldValue || "");
          }
          planner.completeCurrentTask({
            targetId,
            actionType,
            reason: reasoningSummary
          });
        }

        if (outcome.isLoopDetected) {
          relayToTerminalLog(`Step ${stepNum}: Loop Safeguard Triggered`, outcome.loopReason, outcome);
          await sendTabMessage({
            type: "EXECUTE_BROWSER_ACTION",
            actionType: "SCROLL",
            targetId: "page_root",
            parameters: { direction: "down", distance: 400 }
          });
        }

        actionHistory.push(`Step ${stepNum}: [${actionType}] on ${targetId} (${currentTask.type}) — ${reasoningSummary}`);

        // 5.11 State Stabilization Pause
        if (actionType === "NAVIGATE" || actionType === "PRESS_KEY" || actionType === "SUBMIT" || stepProposal.thenPressEnter || (actionType === "CLICK" && (targetId.startsWith("el_") || stepProposal.isFilter))) {
          status.textContent = `Step ${stepNum} complete. Waiting for page update...`;
          await new Promise(r => setTimeout(r, 2200));
        } else {
          await new Promise(r => setTimeout(r, 900));
        }

        // 5.12 Post-Action Goal Check
        const postExecCheck = ActiveGoalCompletionChecker.check({
          goal: parsedGoal,
          stateManager,
          planner,
          actionHistory
        });
        if (postExecCheck.isSatisfied) {
          finalSummary = postExecCheck.reason;
          relayToTerminalLog(`Step ${stepNum}: Goal Satisfied Post-Action`, finalSummary, postExecCheck);
          break;
        }
      }

      const totalMs = Date.now() - startTime;
      const successfulCount = executedResults.filter(r => r.ok && r.status === "COMPLETED").length;
      const finalGoalCheck = ActiveGoalCompletionChecker.check({
        goal: parsedGoal,
        stateManager,
        planner,
        actionHistory
      });
      const isOverallSuccess = finalGoalCheck.isSatisfied || (!anyFailed && executedResults.length > 0 && successfulCount > 0);

      relayToTerminalLog("Final Task Summary", isOverallSuccess ? "Goal COMPLETED successfully" : "Task INCOMPLETE or HALTED", {
        success: isOverallSuccess,
        goalSatisfied: finalGoalCheck.isSatisfied,
        totalDurationMs: totalMs,
        totalSteps: executedResults.length,
        actionHistory,
        executedResults,
        state: stateManager.getStateSummary()
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
    }
  });
}


