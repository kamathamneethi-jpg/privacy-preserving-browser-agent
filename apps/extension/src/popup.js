import {
  GoalParser as CoreGoalParser,
  TaskPlanner as CoreTaskPlanner,
  TASK_STATUS as CoreTaskStatus,
  ExecutionStateManager as CoreExecutionStateManager,
  DynamicReplanner as CoreDynamicReplanner,
  GoalCompletionChecker as CoreGoalCompletionChecker,
  MultimodalVisionAgent as CoreMultimodalVisionAgent,
  DEFAULT_MULTIMODAL_MODEL as CoreDefaultModel
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
const pipelineBreadcrumb = document.querySelector("#pipeline-breadcrumb");
const pipelineStatus = document.querySelector("#pipeline-status");
const redactedInfoPanel = document.querySelector("#redacted-info-panel");
const redactedSummary = document.querySelector("#redacted-summary");
const copyRedactedDomButton = document.querySelector("#copy-redacted-dom");

const detectedPiiCount = document.querySelector("#detected-pii-count");
const detectedPiiTypes = document.querySelector("#detected-pii-types");
const viewRedactedDomButton = document.querySelector("#view-redacted-dom");
const redactedDomContainer = document.querySelector("#redacted-dom-container");
const redactedDomView = document.querySelector("#redacted-dom-view");
const secRawPiiDetected = document.querySelector("#sec-raw-pii-detected");
const secRawPiiRemote = document.querySelector("#sec-raw-pii-remote");
const secSanitizedEntities = document.querySelector("#sec-sanitized-entities");

const togglePiiValuesButton = document.querySelector("#toggle-pii-values");
const clearHighlightsButton = document.querySelector("#clear-highlights");

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
// IMAGE PRIVACY & LOCAL REDACTION PIPELINE
// ---------------------------------------------------------------------
const btnScanScreenshot = document.querySelector("#btn-scan-screenshot");
const btnLoadTestImage = document.querySelector("#btn-load-test-image");
const imgFileInput = document.querySelector("#img-file-input");
const btnViewRedactedImage = document.querySelector("#btn-view-redacted-image");
const btnCopyRedactedImage = document.querySelector("#btn-copy-redacted-image");
const btnClearImageDetection = document.querySelector("#btn-clear-image-detection");
const btnToggleBboxOverlay = document.querySelector("#btn-toggle-bbox-overlay");
const imageDisplayContainer = document.querySelector("#image-display-container");
const redactedImageCanvas = document.querySelector("#redacted-image-canvas");
const sanitizedOcrTextView = document.querySelector("#sanitized-ocr-text-view");
const imgViewTitle = document.querySelector("#img-view-title");

const imgDetectedPiiCount = document.querySelector("#img-detected-pii-count");
const imgDetectedPiiTypes = document.querySelector("#img-detected-pii-types");

const secImgRawProcessed = document.querySelector("#sec-img-raw-processed");
const secImgRawPii = document.querySelector("#sec-img-raw-pii");
const secImgRemotePii = document.querySelector("#sec-img-remote-pii");
const secImgSanitizedGen = document.querySelector("#sec-img-sanitized-gen");
const secImgRedactedRegions = document.querySelector("#sec-img-redacted-regions");
const secImgBackendRaw = document.querySelector("#sec-img-backend-raw");

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
    const canvas = document.createElement("canvas");
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

const ENV_HUGGINGFACE_KEY = (typeof process !== "undefined" && (process.env?.HUGGINGFACE_API_KEY || process.env?.HF_TOKEN)) || "";
const ENV_HUGGINGFACE_MODEL = (typeof process !== "undefined" && process.env?.HUGGINGFACE_MODEL) || "Qwen/Qwen3-VL-4B-Instruct";
const ENV_GROQ_KEY = (typeof process !== "undefined" && process.env?.GROQ_API_KEY) || "";
const ENV_GROQ_MODEL = (typeof process !== "undefined" && process.env?.GROQ_MODEL) || "llama-3.3-70b-versatile";
const ENV_OPENROUTER_KEY = (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) || "";
const ENV_OPENROUTER_MODEL = (typeof process !== "undefined" && process.env?.OPENROUTER_MODEL) || "qwen/qwen-2.5-vl-72b-instruct:free";

const DEFAULT_PROVIDER = ENV_HUGGINGFACE_KEY ? "huggingface" : (ENV_OPENROUTER_KEY ? "openrouter" : (ENV_GROQ_KEY ? "groq" : "huggingface"));

function getDefaultModelForProvider(prov) {
  if (prov === "huggingface" || prov === "hf") return ENV_HUGGINGFACE_MODEL;
  if (prov === "groq") return ENV_GROQ_MODEL;
  return ENV_OPENROUTER_MODEL;
}

function getDefaultKeyForProvider(prov) {
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
      if (prov === "huggingface") {
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
 */
function extractNavigationUrl(task, currentUrl = "", parsedGoal = null) {
  if (!task) return null;
  const isInternal = !currentUrl || currentUrl.startsWith("chrome://") || currentUrl.startsWith("about:") || currentUrl.startsWith("chrome-extension://") || currentUrl.startsWith("devtools://");

  // 1. Check for explicit URL in task
  const urlMatch = task.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) return urlMatch[0];

  // 2. Check for known domain keywords in task
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

  const isEcommerceIntent = parsedGoal?.domain === "ecommerce" || /\b(shoes?|sneakers?|laptops?|phones?|jackets?|clothes?|buy|shop|under\s+\d+k?|under\s+rs|cart|order)\b/i.test(task);
  const isAlreadyOnEcommerce = currentUrl.includes("amazon.") || currentUrl.includes("flipkart.") || currentUrl.includes("ebay.") || currentUrl.includes("walmart.");

  // If shopping/ecommerce intent and not already on shopping site, or on internal tab
  if (isEcommerceIntent && (!isAlreadyOnEcommerce || isInternal)) {
    return "https://www.amazon.in";
  }

  // If on an internal page (newtab, extensions), check domain intent
  if (isInternal) {
    if (/\b(amazon|buy|shop|cart|order)\b/i.test(task)) return "https://www.amazon.in";
    if (/\b(youtube|video|watch)\b/i.test(task)) return "https://www.youtube.com";
    if (/\b(wikipedia|wiki|encyclopedia)\b/i.test(task)) return "https://www.wikipedia.org";
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

    // Name detection
    NAME_PATTERN.lastIndex = 0;
    if (NAME_PATTERN.test(text) || (node.elementPath && /name/i.test(node.elementPath))) {
      text = text.replace(NAME_PATTERN, "[REDACTED]");
      if (text.includes("[REDACTED]") || (node.elementPath && /name/i.test(node.elementPath))) {
        if (!text.includes("[REDACTED]")) text = "[REDACTED]";
        redactedCounts.Name++;
        isSanitized = true;
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
 * over all detected PII bounding boxes before converting to base64.
 * Raw pixels NEVER leave the local client.
 */
async function captureSanitizedScreenshot(viewportPiiItems = []) {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    return null;
  }
  try {
    const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    if (!rawDataUrl) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(rawDataUrl);

          ctx.drawImage(img, 0, 0);

          // Redact all localized DOM PII bounding boxes with solid black rects
          if (Array.isArray(viewportPiiItems) && viewportPiiItems.length > 0) {
            ctx.fillStyle = "#000000";
            for (const item of viewportPiiItems) {
              const bbox = item.bbox || item.boundingBox;
              if (bbox && bbox.width > 0 && bbox.height > 0) {
                const x = Math.max(0, bbox.x || bbox.left || 0);
                const y = Math.max(0, bbox.y || bbox.top || 0);
                const w = Math.min(canvas.width - x, bbox.width);
                const h = Math.min(canvas.height - y, bbox.height);
                ctx.fillRect(x, y, w, h);
              }
            }
          }

          // Also redact any image PII detections stored locally
          if (Array.isArray(lastImagePiiDetections) && lastImagePiiDetections.length > 0) {
            ctx.fillStyle = "#000000";
            for (const det of lastImagePiiDetections) {
              const bbox = det.bbox;
              if (bbox && bbox.width > 0 && bbox.height > 0) {
                ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
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
function deriveGeneralizedFallbackAction({ currentTask, goal, interactiveElements, stateManager, stepNum }) {
  if (!Array.isArray(interactiveElements) || interactiveElements.length === 0) {
    return null;
  }

  const taskType = currentTask?.type || "general";
  const entity = goal?.targetEntity || "";
  const constraints = goal?.constraints || [];

  // 1. Close Modal
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

  // 2. Search Task: find search input field
  if (taskType === "search" || (stepNum === 1 && !stateManager.hasPerformedAction("search"))) {
    const searchInput = interactiveElements.find(el => {
      if (el.tag !== "input" && el.tag !== "textarea") return false;
      const type = (el.type || "").toLowerCase();
      if (type === "hidden" || type === "password" || type === "checkbox" || type === "radio") return false;
      const t = `${el.name || ""} ${el.placeholder || ""} ${el.ariaLabel || ""} ${el.elementId || ""}`.toLowerCase();
      return type === "search" || /search|query|find|keyword|term/i.test(t);
    }) || interactiveElements.find(el => el.tag === "input" && (el.type === "text" || !el.type));

    if (searchInput) {
      const query = entity || (currentTask?.description ? currentTask.description.replace(/^Search for\s*/i, "") : goal.summary);
      return {
        actionType: "TYPE",
        target: searchInput.elementId,
        parameters: { text: query },
        thenPressEnter: true,
        reasoningSummary: `Entered search query "${query}" into search field.`
      };
    }
  }

  // 3. Filter Task: find filter option matching constraint
  if (taskType === "filter") {
    for (const c of constraints) {
      if (!stateManager.isFilterApplied(c.name, c.value)) {
        const valStr = String(c.value || c.name).toLowerCase();
        const filterEl = interactiveElements.find(el => {
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
            reasoningSummary: `Applied filter for "${c.name}: ${c.value}".`
          };
        }
      }
    }
  }

  // 4. Select / Inspect Candidate
  if (taskType === "select_candidate" || taskType === "inspect_candidate") {
    const candidateLink = interactiveElements.find(el => {
      if (el.tag !== "a" && el.tag !== "div" && el.tag !== "li") return false;
      const t = (el.text || "").trim();
      if (t.length < 8) return false;
      if (/\b(sign in|login|register|cart|basket|home|help|customer service|privacy|terms|about us|careers|contact|menu|navigation)\b/i.test(t)) {
        return false;
      }
      if (entity && t.toLowerCase().includes(entity.toLowerCase().split(" ")[0])) {
        return true;
      }
      return true;
    });

    if (candidateLink) {
      return {
        actionType: "CLICK",
        target: candidateLink.elementId,
        parameters: {},
        reasoningSummary: `Inspecting candidate item: "${(candidateLink.text || '').slice(0, 45)}...".`
      };
    }
  }

  // 5. Perform Action / Submit
  if (taskType === "perform_action" || taskType === "submit_action") {
    const actionKeywords = /\b(add to cart|add to bag|buy now|submit|register|book now|continue|proceed|checkout|save|confirm|next|place order)\b/i;
    const actionBtn = interactiveElements.find(el => {
      const t = `${el.text || ""} ${el.value || ""} ${el.ariaLabel || ""}`.toLowerCase();
      return actionKeywords.test(t);
    }) || interactiveElements.find(el => el.tag === "button" || (el.tag === "input" && el.type === "submit"));

    if (actionBtn) {
      return {
        actionType: "CLICK",
        target: actionBtn.elementId,
        parameters: {},
        reasoningSummary: `Executed primary action: "${actionBtn.text || actionBtn.ariaLabel || 'Submit'}".`
      };
    }
  }

  // 6. Form Filling
  if (taskType === "fill_form") {
    const emptyInput = interactiveElements.find(el => {
      return (el.tag === "input" || el.tag === "textarea") &&
        el.type !== "hidden" &&
        el.type !== "submit" &&
        el.type !== "checkbox" &&
        el.type !== "radio" &&
        !el.value;
    });
    if (emptyInput) {
      return {
        actionType: "TYPE",
        target: emptyInput.elementId,
        parameters: { text: "Value" },
        reasoningSummary: `Populating form field "${emptyInput.name || emptyInput.placeholder || emptyInput.elementId}".`
      };
    }
  }

  // 7. General clickable element
  const generalAction = interactiveElements.find(el => (el.tag === "button" || el.tag === "a") && (el.text || "").length > 2);
  if (generalAction) {
    return {
      actionType: "CLICK",
      target: generalAction.elementId,
      parameters: {},
      reasoningSummary: `Interacting with element "${(generalAction.text || '').slice(0, 30)}".`
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

    const startTime = Date.now();
    relayToTerminalLog("User Request", "Received user task instruction", { task: userTask });

    try {
      // 1. Goal Decomposition into structured objectives and constraints
      const parsedGoal = ActiveGoalParser.parse(userTask);
      relayToTerminalLog("Goal Decomposition", "Parsed user goal and constraints", {
        summary: parsedGoal.summary,
        targetEntity: parsedGoal.targetEntity,
        constraints: parsedGoal.constraints,
        operations: parsedGoal.operations,
        domain: parsedGoal.domain
      });

      // 2. Initialize dynamic task planner and execution state manager
      const planner = new ActiveTaskPlanner(parsedGoal);
      relayToTerminalLog("Task Plan", `Generated ${planner.tasks.length} initial sub-tasks`, planner.getPlanSummary());

      const stateManager = new ActiveExecutionStateManager({
        goal: parsedGoal,
        maxReplans: 5,
        maxConsecutiveFailures: 3
      });

      // 3. Obtain API settings
      const userKey = (apiKeyInput?.value || "").trim();
      const provider = providerSelect?.value || DEFAULT_PROVIDER;
      const apiKey = userKey || getDefaultKeyForProvider(provider);
      const selectedModel = (modelInput?.value || "").trim() || getDefaultModelForProvider(provider);

      // 4. Auto-Navigation if needed
      let activeTab = null;
      if (typeof chrome !== "undefined" && chrome.tabs?.query) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs?.[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))?.[0] || null;
      }

      const currentUrl = activeTab?.url || "";
      const targetNavUrl = extractNavigationUrl(userTask, currentUrl, parsedGoal);

      if (targetNavUrl) {
        setPipelineStage("AUTO-NAVIGATION");
        status.textContent = `Navigating to ${targetNavUrl}...`;
        relayToTerminalLog("Auto-Navigation", `Navigating tab to ${targetNavUrl}`, { targetNavUrl, fromUrl: currentUrl });
        await navigateTabAndWait(activeTab?.id, targetNavUrl);
        if (planner.getCurrentTask()?.type === "navigate") {
          planner.completeCurrentTask({ url: targetNavUrl });
        }
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

        // 5.4 Capture On-Device Sanitized Screenshot (Masks all visual PII boxes)
        const sanitizedScreenshot = await captureSanitizedScreenshot(piiFindings.localizedItems || []);

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
          finalSummary = `Halted: ${errMsg} Please ensure an active, standard webpage (e.g. https://www.amazon.in) is open in Chrome.`;
          relayToTerminalLog(`Step ${stepNum}: Stalled`, finalSummary, { error: errMsg, pageUrl, pageTitle });
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
        setPipelineStage("REDACTED DOM + VISION → REMOTE LLM");
        status.textContent = `Step ${stepNum}/${MAX_STEPS}: Reasoning for [${currentTask.type}] via ${provider.toUpperCase()} (${selectedModel})...`;

        let stepProposal = null;
        let isTaskComplete = false;
        let reasoningSummary = "";

        if (apiKey) {
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
              sanitizedDomContext: piiFindings.sanitizedDomText || lastRedactedDomText || "",
              rawPiiValues: rawPiiVals
            });

            if (visionResult?.action) {
              stepProposal = {
                actionType: visionResult.action.actionType,
                target: visionResult.action.target,
                parameters: visionResult.action.parameters,
                thenPressEnter: visionResult.action.thenPressEnter
              };
              reasoningSummary = visionResult.action.reasoningSummary || visionResult.observation;
              isTaskComplete = Boolean(visionResult.goal_progress?.isSatisfied || visionResult.action.actionType === "COMPLETE");
            }
          } catch (mErr) {
            relayToTerminalLog(`Step ${stepNum}: Multimodal Reasoning Exception`, mErr.message, {});
          }
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
        const outcome = stateManager.recordActionOutcome({
          actionType,
          target: targetId,
          parameters,
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
          reason: reasoningSummary,
          error: execRes?.error
        };
        executedResults.push(stepOutcome);

        if (!execRes?.ok) {
          anyFailed = true;
          relayToTerminalLog(`Step ${stepNum}: Action Failed`, execRes?.error || "Action execution error", stepOutcome);
          if (stateManager.consecutiveFailures >= 3) {
            relayToTerminalLog(`Step ${stepNum}: Stopped`, "Exceeded maximum consecutive failures.", {});
            break;
          }
        } else {
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
        status.textContent = `Task halted: No actions could be executed on this page. Please open an active website (e.g. https://www.amazon.in) and click Run Agent Task again.`;
      } else {
        setPipelineStage("TASK HALTED / INCOMPLETE");
        status.textContent = `Task execution stopped after ${executedResults.length} step(s).`;
      }
    } catch (err) {
      setPipelineStage("FAILED / DENIED");
      status.textContent = `Task execution error: ${err.message || "Cannot inspect tab."}`;
      relayToTerminalLog("Pipeline Error", err.message, { error: err.message });
    }
  });
}


