import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeTelemetryData, evaluateMixedContentDemo } from "../packages/privacy-core/src/index.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;
const HOST = process.env.HOST || "127.0.0.1";

// ANSI Terminal Colors
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m"
};

// In-Memory Telemetry Repository
export const eventStore = {
  events: [],
  maxEvents: 1000,
  sseClients: new Set(),
  startTime: Date.now(),

  add(rawPayload) {
    const id = this.events.length + 1;
    const timestamp = new Date().toISOString();
    const timeShort = new Date().toLocaleTimeString();

    const stage = (rawPayload.stage || rawPayload.category || "GENERAL").toUpperCase();
    const event = rawPayload.event || rawPayload.action || "EVENT";
    const rawData = rawPayload.data !== undefined ? rawPayload.data : rawPayload.payload || {};
    const data = sanitizeTelemetryData(rawData);
    const metadata = sanitizeTelemetryData(rawPayload.metadata || {});

    const entry = {
      id,
      timestamp,
      timeShort,
      stage,
      event,
      data,
      metadata,
      level: rawPayload.level || (stage.includes("ERROR") || stage.includes("FAIL") ? "error" : stage.includes("WARN") ? "warn" : "info")
    };

    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Broadcast to active SSE clients
    this.broadcastSSE(entry);

    // Print to terminal console
    this.printToTerminal(entry);

    return entry;
  },

  broadcastSSE(entry) {
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  },

  clear() {
    this.events = [];
    const clearEvent = {
      id: 0,
      timestamp: new Date().toISOString(),
      timeShort: new Date().toLocaleTimeString(),
      stage: "SYSTEM",
      event: "LOGS_CLEARED",
      data: { message: "Telemetry session history cleared." },
      level: "info"
    };
    this.broadcastSSE(clearEvent);
  },

  printToTerminal(entry) {
    const { timeShort, stage, event, data, level } = entry;
    let stageColor = COLORS.cyan;
    if (stage.includes("ERROR") || level === "error") stageColor = COLORS.red;
    else if (stage.includes("API")) stageColor = COLORS.yellow;
    else if (stage.includes("ACTION")) stageColor = COLORS.green;
    else if (stage.includes("USER")) stageColor = COLORS.magenta;
    else if (stage.includes("PII") || stage.includes("REDACT")) stageColor = COLORS.blue;

    console.log(`\n${stageColor}[${timeShort}] ${COLORS.bright}${stage}${COLORS.reset} ── ${COLORS.yellow}${event}${COLORS.reset}`);

    if (data) {
      if (typeof data === "string") {
        console.log(`  ${COLORS.dim}▸${COLORS.reset} ${data}`);
      } else if (typeof data === "object") {
        const jsonStr = JSON.stringify(data, null, 2);
        const snippet = jsonStr.length > 800 ? jsonStr.slice(0, 800) + "\n... (truncated)" : jsonStr;
        console.log(snippet.split("\n").map(l => `    ${COLORS.dim}${l}${COLORS.reset}`).join("\n"));
      }
    }
  }
};

// Embedded Web Dashboard HTML/CSS/JS
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Browser Agent — Observability & Reasoning Inspector</title>
  <style>
    :root {
      --bg-base: #0a0e17;
      --bg-surface: #111927;
      --bg-surface-elevated: #1a2333;
      --border-subtle: #223049;
      --border-focus: #3b82f6;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent-blue: #38bdf8;
      --accent-purple: #c084fc;
      --accent-green: #34d399;
      --accent-amber: #fbbf24;
      --accent-red: #f87171;
      --accent-cyan: #22d3ee;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Top Navigation Header */
    header {
      background: rgba(17, 25, 39, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      color: white;
      box-shadow: 0 0 16px rgba(14, 165, 233, 0.4);
    }
    .brand-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .brand-subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      background: rgba(52, 211, 153, 0.1);
      color: var(--accent-green);
      border: 1px solid rgba(52, 211, 153, 0.25);
    }
    .status-pill.disconnected {
      background: rgba(248, 113, 113, 0.1);
      color: var(--accent-red);
      border-color: rgba(248, 113, 113, 0.25);
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
      box-shadow: 0 0 8px currentColor;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }

    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: #253347;
      border-color: var(--border-focus);
    }
    .btn-danger {
      color: #fca5a5;
      border-color: rgba(248, 113, 113, 0.3);
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: var(--accent-red);
    }

    /* Diagnostics & Alert Banner */
    #diagnostic-banner {
      background: rgba(245, 158, 11, 0.12);
      border-bottom: 1px solid rgba(245, 158, 11, 0.3);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: #fef3c7;
    }
    #diagnostic-banner.hidden { display: none; }
    #diagnostic-banner.error {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
      color: #fee2e2;
    }
    .diag-icon { font-size: 16px; flex-shrink: 0; }
    .diag-body { flex: 1; }
    .diag-title { font-weight: 700; margin-bottom: 2px; }
    .diag-desc { font-size: 12px; opacity: 0.9; }

    /* Stat Cards Row */
    .metrics-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      padding: 16px 24px;
      background: #0d121c;
      border-bottom: 1px solid var(--border-subtle);
    }
    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px 16px;
    }
    .metric-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      margin-bottom: 4px;
    }
    .metric-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-main);
      font-family: var(--font-mono);
    }
    .metric-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Tab Controls */
    .tabs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 24px 0 24px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
    }
    .tabs-nav {
      display: flex;
      gap: 4px;
    }
    .tab-btn {
      padding: 10px 16px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text-main); }
    .tab-btn.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
    }
    .tab-badge {
      background: var(--bg-surface-elevated);
      padding: 2px 6px;
      border-radius: 9999px;
      font-size: 11px;
      font-family: var(--font-mono);
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      align-items: center;
      padding-bottom: 8px;
    }
    .pill {
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface-elevated);
      color: var(--text-muted);
      transition: all 0.15s;
    }
    .pill:hover { color: var(--text-main); }
    .pill.active {
      background: var(--accent-blue);
      color: #0f172a;
      border-color: var(--accent-blue);
    }

    /* Main Container */
    main {
      flex: 1;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .tab-pane { display: none; }
    .tab-pane.active { display: flex; flex-direction: column; gap: 14px; }

    /* Timeline Cards */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .event-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-left: 4px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px 18px;
      transition: transform 0.1s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .event-card:hover {
      border-color: #334155;
      background: #141d2e;
    }

    /* Color Coded Left Borders by Stage */
    .event-card.stage-user { border-left-color: var(--accent-purple); }
    .event-card.stage-nav { border-left-color: var(--accent-blue); }
    .event-card.stage-dom { border-left-color: var(--accent-cyan); }
    .event-card.stage-pii { border-left-color: var(--accent-green); }
    .event-card.stage-api { border-left-color: var(--accent-amber); }
    .event-card.stage-reason { border-left-color: #818cf8; }
    .event-card.stage-action { border-left-color: #2dd4bf; }
    .event-card.stage-error { border-left-color: var(--accent-red); background: rgba(239, 68, 68, 0.05); }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      font-family: var(--font-mono);
    }
    .badge-purple { background: rgba(192, 132, 252, 0.15); color: var(--accent-purple); }
    .badge-blue { background: rgba(56, 189, 248, 0.15); color: var(--accent-blue); }
    .badge-cyan { background: rgba(34, 211, 238, 0.15); color: var(--accent-cyan); }
    .badge-green { background: rgba(52, 211, 153, 0.15); color: var(--accent-green); }
    .badge-amber { background: rgba(251, 191, 36, 0.15); color: var(--accent-amber); }
    .badge-indigo { background: rgba(129, 140, 248, 0.15); color: #818cf8; }
    .badge-teal { background: rgba(45, 212, 191, 0.15); color: #2dd4bf; }
    .badge-red { background: rgba(248, 113, 113, 0.2); color: var(--accent-red); }

    .card-event { font-weight: 700; font-size: 14px; }
    .card-time { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); }

    .card-summary {
      font-size: 13px;
      color: var(--text-main);
      line-height: 1.5;
    }

    .code-block {
      background: #080c14;
      border: 1px solid #1a2333;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #cbd5e1;
      overflow-x: auto;
      max-height: 280px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .key-val-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      background: #0d1422;
      border: 1px solid #1a2538;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
    }
    .kv-item { display: flex; flex-direction: column; gap: 2px; }
    .kv-k { font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 600; }
    .kv-v { color: var(--text-main); font-family: var(--font-mono); font-weight: 500; }

    /* API Inspector Table */
    .table-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    th {
      background: #0f1624;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border-subtle);
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #1a2333;
      vertical-align: top;
    }
    tr:hover td { background: #141c2c; }

    .status-code {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
    }
    .status-200 { background: rgba(52, 211, 153, 0.15); color: var(--accent-green); }
    .status-400, .status-401, .status-403, .status-429, .status-500 {
      background: rgba(248, 113, 113, 0.2);
      color: var(--accent-red);
    }

    /* Screenshot Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal-overlay.hidden { display: none; }
    .modal-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .modal-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      justify-content: center;
      background: #080c14;
    }
    .modal-img {
      max-width: 100%;
      max-height: 75vh;
      border-radius: 6px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    }

    /* Empty State */
    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .empty-icon { font-size: 40px; opacity: 0.5; }
    .empty-title { font-size: 16px; font-weight: 600; color: var(--text-main); }
    .empty-desc { font-size: 13px; max-width: 440px; }
  </style>
</head>
<body>

  <!-- Top Header -->
  <header>
    <div class="brand-section">
      <div class="brand-logo">🛡️</div>
      <div>
        <div class="brand-title">Privacy Browser Agent — Observability & Reasoning Inspector</div>
        <div class="brand-subtitle">Real-time telemetry, DOM perception, visual redaction & API reasoning streams</div>
      </div>
    </div>
    <div class="header-actions">
      <div id="connection-status" class="status-pill">
        <div class="pulse-dot"></div>
        <span id="connection-text">Live Streaming</span>
      </div>
      <button id="btn-export" class="btn" title="Download complete telemetry trace as JSON">⬇ Export JSON</button>
      <button id="btn-clear" class="btn btn-danger" title="Clear recorded telemetry history">🗑 Clear Logs</button>
    </div>
  </header>

  <!-- Diagnostic Alert Banner -->
  <div id="diagnostic-banner" class="hidden">
    <div class="diag-icon">⚠️</div>
    <div class="diag-body">
      <div id="diag-title" class="diag-title">Root Cause Alert</div>
      <div id="diag-desc" class="diag-desc">An issue was detected during agent execution.</div>
    </div>
  </div>

  <!-- Real-time Metrics Bar -->
  <div class="metrics-bar">
    <div class="metric-card">
      <div class="metric-label">Total Events</div>
      <div id="metric-total-events" class="metric-value">0</div>
      <div class="metric-sub">Session stream events</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Agent Steps</div>
      <div id="metric-agent-steps" class="metric-value">0</div>
      <div id="metric-step-sub" class="metric-sub">Iterative Re-Act loop</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">LLM API Calls</div>
      <div id="metric-api-calls" class="metric-value">0</div>
      <div id="metric-api-sub" class="metric-sub">Avg latency: -- ms</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Elements Discovered</div>
      <div id="metric-elements" class="metric-value">0</div>
      <div id="metric-elements-sub" class="metric-sub">Interactive DOM nodes</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">PII Redactions</div>
      <div id="metric-redactions" class="metric-value">0</div>
      <div class="metric-sub">100% on-device masked</div>
    </div>
  </div>

  <!-- View Switcher & Filters -->
  <div class="tabs-bar">
    <div class="tabs-nav">
      <button class="tab-btn active" data-tab="timeline">
        📋 Live Timeline <span id="tab-count-timeline" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="api">
        🌐 API Inspector <span id="tab-count-api" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="dom">
        🔍 DOM & Vision <span id="tab-count-dom" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="privacy">
        🛡️ Privacy Transparency <span id="tab-count-privacy" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="diagnostics">
        🩺 Diagnostics & Health
      </button>
    </div>
    <div class="filter-pills" id="filter-container">
      <span style="font-size: 11px; color: var(--text-dim); margin-right: 4px;">Filter:</span>
      <button class="pill active" data-filter="ALL">ALL</button>
      <button class="pill" data-filter="USER">USER INPUT</button>
      <button class="pill" data-filter="API">API CALLS</button>
      <button class="pill" data-filter="DOM">PERCEPTION</button>
      <button class="pill" data-filter="ACTION">ACTIONS</button>
      <button class="pill" data-filter="ERROR">ERRORS</button>
    </div>
  </div>

  <!-- Main Content Area -->
  <main>
    <!-- TAB 1: Live Timeline -->
    <div id="pane-timeline" class="tab-pane active">
      <div class="timeline" id="timeline-feed">
        <div class="empty-state" id="empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-title">Waiting for Extension Activity</div>
          <div class="empty-desc">Open Chrome, click the Privacy Browser Agent extension, enter a task like "search for nike shoes under 7k", and click Run. Every step, API call, and element discovery will stream here in real time.</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: API Inspector -->
    <div id="pane-api" class="tab-pane">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Provider / Model</th>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Action Chosen</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="api-table-body">
            <tr>
              <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 40px;">No outgoing LLM API calls captured yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: DOM & Vision Inspector -->
    <div id="pane-dom" class="tab-pane">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="metric-card" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="font-weight: 700; font-size: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            Current Observed Webpage
          </div>
          <div class="key-val-grid">
            <div class="kv-item">
              <span class="kv-k">Page URL</span>
              <span class="kv-v" id="dom-curr-url">--</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Page Title</span>
              <span class="kv-v" id="dom-curr-title">--</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Interactive Elements</span>
              <span class="kv-v" id="dom-curr-elements">0</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">PII Findings</span>
              <span class="kv-v" id="dom-curr-pii">0</span>
            </div>
          </div>
          <div style="font-weight: 700; font-size: 13px; margin-top: 8px;">Discovered Dynamic Elements (Sample):</div>
          <div class="code-block" id="dom-elements-json" style="max-height: 380px;">No elements scanned yet.</div>
        </div>

        <div class="metric-card" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="font-weight: 700; font-size: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            On-Device Sanitized Screenshot (Masked)
          </div>
          <div style="font-size: 12px; color: var(--text-muted);">
            Zero raw screenshots are ever uploaded. Sensitive bounding boxes are locally masked with solid black rectangles before dispatching to the multimodal model.
          </div>
          <div style="flex: 1; min-height: 280px; background: #080c14; border: 1px solid #1a2538; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;" id="ss-container">
            <span style="color: var(--text-dim); font-size: 12px;" id="ss-placeholder">No screenshot captured yet.</span>
            <img id="ss-image" style="max-width: 100%; max-height: 380px; display: none; cursor: pointer;" title="Click to enlarge" />
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: Diagnostics & Health -->
    <div id="pane-diagnostics" class="tab-pane">
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div class="metric-card">
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">Automated Health & Pre-flight Diagnostics</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            The diagnostics engine automatically inspects your configuration and active browser state to highlight why an action stalled or failed.
          </div>
          <div id="diag-items-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="padding: 10px 14px; background: #0f1624; border-radius: 6px; border: 1px solid var(--border-subtle); font-size: 13px;">
              ✔ Telemetry server running on <code style="color: var(--accent-cyan);">http://${HOST}:${PORT}</code>
            </div>
            <div id="diag-model-status" style="padding: 10px 14px; background: #0f1624; border-radius: 6px; border: 1px solid var(--border-subtle); font-size: 13px;">
              ℹ️ Default Model Provider: <strong>Hugging Face (Qwen/Qwen2.5-VL-72B-Instruct)</strong>
            </div>
            <div id="diag-tab-status" style="padding: 10px 14px; background: #0f1624; border-radius: 6px; border: 1px solid var(--border-subtle); font-size: 13px;">
              ℹ️ Tab Status: Awaiting extension action
            </div>
          </div>
        </div>

        <div class="metric-card">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px;">Quick Troubleshooting Guide</div>
          <ul style="padding-left: 20px; font-size: 13px; line-height: 1.8; color: var(--text-muted);">
            <li><strong style="color: var(--text-main);">"Halted: No interactive elements discovered on page"</strong>: Chrome extensions cannot inject content scripts into <code style="color: var(--accent-blue);">chrome://</code> or <code style="color: var(--accent-blue);">about:blank</code> tabs. Open <code style="color: var(--accent-green);">https://www.google.com</code> or any active website in Chrome and try again.</li>
            <li><strong style="color: var(--text-main);">HTTP 401 Unauthorized</strong>: Your Hugging Face token is missing or expired. Generate a free token at <a href="https://huggingface.co/settings/tokens" target="_blank" style="color: var(--accent-blue);">huggingface.co/settings/tokens</a> and paste it into the extension popup.</li>
            <li><strong style="color: var(--text-main);">Local Heuristic Fallback</strong>: If you leave the API key blank, the agent runs entirely locally using deterministic DOM tree parsing with zero cost and zero network calls.</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 5: Privacy Transparency & Reviewer Demonstration -->
    <div id="pane-privacy" class="tab-pane">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Top Banner with Live Verification Sandbox Runner -->
        <div class="metric-card" style="border-left: 4px solid var(--accent-green); background: #0b1522;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 700; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <span>🛡️ PolicyEngine Reviewer Transparency Matrix</span>
                <span id="privacy-demo-badge" class="status-pill" style="font-size: 10px;">Authoritative 4-Way Decision Engine</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Demonstrating that a single PolicyEngine decision is consistently enforced across DOM, Screenshot, Remote Payload, Telemetry, and PrivacyVault.
              </div>
            </div>
            <button id="btn-run-privacy-demo" class="btn" style="background: #059669; color: #ffffff; font-weight: 700; border-color: #10b981; padding: 8px 16px; cursor: pointer;">
              ▶ Run Mixed-Content Verification
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 12px;">
            <div style="padding: 10px; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.25); border-radius: 6px;">
              <div style="font-weight: 700; font-size: 12px; color: #34d399; margin-bottom: 2px;">🟢 ALLOW (Green)</div>
              <div style="font-size: 11px; color: var(--text-muted);">Public & safe context permitted for task. Original value preserved across all representations.</div>
            </div>
            <div style="padding: 10px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px;">
              <div style="font-weight: 700; font-size: 12px; color: #f87171; margin-bottom: 2px;">🔴 TOKENIZE (Red)</div>
              <div style="font-size: 11px; color: var(--text-muted);">Sensitive data tokenized with opaque identifier for remote reasoning; raw value stored in local vault only.</div>
            </div>
            <div style="padding: 10px; background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 6px;">
              <div style="font-weight: 700; font-size: 12px; color: #94a3b8; margin-bottom: 2px;">⚫ REDACT (Black)</div>
              <div style="font-size: 11px; color: var(--text-muted);">Unnecessary or unverified sensitive data stripped/masked. Original value completely removed.</div>
            </div>
            <div style="padding: 10px; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 6px;">
              <div style="font-weight: 700; font-size: 12px; color: #c084fc; margin-bottom: 2px;">🔒 LOCAL_ONLY (Purple)</div>
              <div style="font-size: 11px; color: var(--text-muted);">Critical secrets (passwords, OTPs, CVVs) strictly isolated in on-device memory; zero remote egress.</div>
            </div>
          </div>
        </div>

        <!-- Verification Results Container -->
        <div id="privacy-demo-results-box" class="metric-card" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 14px; color: var(--text-main);">
              Mixed-Content Synthetic Verification Matrix (7 Information Classes)
            </div>
            <span id="privacy-demo-consistency-tag" style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: rgba(52, 211, 153, 0.15); color: #34d399;">
              ✔ 100% Boundary Consistency Verified
            </span>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Information Class</th>
                  <th>Category</th>
                  <th>Role & Necessity</th>
                  <th>Authoritative Decision</th>
                  <th>DOM Representation</th>
                  <th>Screenshot</th>
                  <th>Remote Payload</th>
                  <th>Telemetry Metadata</th>
                  <th>PrivacyVault</th>
                </tr>
              </thead>
              <tbody id="privacy-demo-table-body"></tbody>
            </table>
          </div>
        </div>

        <!-- Live Session Decisions Table -->
        <div class="metric-card">
          <div style="font-weight: 700; font-size: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 12px;">
            Live Session Privacy Decisions (From Connected Extension)
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Entity ID</th>
                  <th>Category</th>
                  <th>Semantic Role</th>
                  <th>Task Necessity</th>
                  <th>Decision</th>
                  <th>Reason Code</th>
                  <th>Token Identifier</th>
                </tr>
              </thead>
              <tbody id="session-privacy-table-body">
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">
                    No live privacy decisions recorded in current session. Run a task in the extension to view live decisions.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Screenshot Modal View -->
  <div id="modal-overlay" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="modal-header">
        <span style="font-weight: 700; font-size: 14px;">Sanitized On-Device Masked Screenshot</span>
        <button id="modal-close-btn" class="btn">Close</button>
      </div>
      <div class="modal-body">
        <img id="modal-img" class="modal-img" src="" alt="Sanitized Screenshot" />
      </div>
    </div>
  </div>

  <script>
    // State management
    const state = {
      events: [],
      filter: "ALL",
      activeTab: "timeline",
      apiCalls: [],
      privacyDecisions: [],
      lastScreenshotUrl: null,
      stats: {
        totalEvents: 0,
        agentSteps: 0,
        apiCalls: 0,
        apiLatencies: [],
        elementsCount: 0,
        redactionsCount: 0
      }
    };

    // DOM Elements
    const feed = document.getElementById("timeline-feed");
    const emptyState = document.getElementById("empty-state");
    const connStatus = document.getElementById("connection-status");
    const connText = document.getElementById("connection-text");
    const diagBanner = document.getElementById("diagnostic-banner");
    const diagTitle = document.getElementById("diag-title");
    const diagDesc = document.getElementById("diag-desc");

    // Metrics
    const mTotalEvents = document.getElementById("metric-total-events");
    const mAgentSteps = document.getElementById("metric-agent-steps");
    const mApiCalls = document.getElementById("metric-api-calls");
    const mApiSub = document.getElementById("metric-api-sub");
    const mElements = document.getElementById("metric-elements");
    const mRedactions = document.getElementById("metric-redactions");

    // Tabs
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");
    const filterPills = document.querySelectorAll(".pill");

    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        state.activeTab = tab;
        tabBtns.forEach(b => b.classList.toggle("active", b === btn));
        tabPanes.forEach(p => p.classList.toggle("active", p.id === "pane-" + tab));
      });
    });

    filterPills.forEach(pill => {
      pill.addEventListener("click", () => {
        filterPills.forEach(p => p.classList.toggle("active", p === pill));
        state.filter = pill.dataset.filter;
        renderTimeline();
      });
    });

    // Helper: Map stage to badge style
    function getBadgeClass(stage) {
      if (stage.includes("USER")) return "badge-purple";
      if (stage.includes("NAV")) return "badge-blue";
      if (stage.includes("DOM") || stage.includes("PERCEPT")) return "badge-cyan";
      if (stage.includes("PII") || stage.includes("REDACT")) return "badge-green";
      if (stage.includes("API")) return "badge-amber";
      if (stage.includes("REASON")) return "badge-indigo";
      if (stage.includes("ACTION")) return "badge-teal";
      if (stage.includes("ERROR") || stage.includes("FAIL") || stage.includes("STALL")) return "badge-red";
      return "badge-blue";
    }

    function getCardStageClass(stage) {
      if (stage.includes("USER")) return "stage-user";
      if (stage.includes("NAV")) return "stage-nav";
      if (stage.includes("DOM") || stage.includes("PERCEPT")) return "stage-dom";
      if (stage.includes("PII") || stage.includes("REDACT")) return "stage-pii";
      if (stage.includes("API")) return "stage-api";
      if (stage.includes("REASON")) return "stage-reason";
      if (stage.includes("ACTION")) return "stage-action";
      if (stage.includes("ERROR") || stage.includes("FAIL") || stage.includes("STALL")) return "stage-error";
      return "";
    }

    // Process incoming event
    function processEvent(event) {
      state.events.push(event);
      state.stats.totalEvents++;

      const s = event.stage.toUpperCase();
      const e = (event.event || "").toUpperCase();

      // Diagnostic analyzer
      if (s.includes("ERROR") || s.includes("STALL") || e.includes("FAIL") || e.includes("STALLED")) {
        diagBanner.classList.remove("hidden");
        diagBanner.classList.add("error");
        diagTitle.textContent = "Agent Diagnostic Alert: " + event.event;
        const msg = (typeof event.data === "string" ? event.data : event.data?.error || event.data?.message || JSON.stringify(event.data));
        diagDesc.textContent = msg;
      }

      // Step count
      if (s.includes("STEP") || e.includes("STEP")) {
        const stepMatch = (event.stage + " " + event.event).match(/Step\s*(\d+)/i);
        if (stepMatch) {
          state.stats.agentSteps = Math.max(state.stats.agentSteps, parseInt(stepMatch[1], 10));
        }
      }

      // API Calls
      if (s.includes("API") || e.includes("API")) {
        if (e.includes("RESPONSE") || e.includes("RESULT") || event.data?.latencyMs || event.data?.status) {
          state.stats.apiCalls++;
          const lat = event.data?.latencyMs || 0;
          if (lat > 0) state.stats.apiLatencies.push(lat);
          state.apiCalls.push(event);
          renderApiTable();
        }
      }

      // DOM elements
      if (event.data?.elementCount !== undefined) {
        state.stats.elementsCount = event.data.elementCount;
        document.getElementById("dom-curr-elements").textContent = event.data.elementCount;
      }
      if (event.data?.pageUrl) {
        document.getElementById("dom-curr-url").textContent = event.data.pageUrl;
      }
      if (event.data?.pageTitle) {
        document.getElementById("dom-curr-title").textContent = event.data.pageTitle;
      }
      if (event.data?.sample) {
        document.getElementById("dom-elements-json").textContent = JSON.stringify(event.data.sample, null, 2);
      }

      // Privacy Decisions & Redactions
      if (e.includes("PRIVACY_DECISION") || s.includes("PRIVACY") || event.data?.decision || event.data?.decisions) {
        if (event.data?.decision) {
          state.privacyDecisions.push({
            timeShort: event.timeShort,
            ...event.data
          });
          renderPrivacyTable();
        } else if (Array.isArray(event.data?.decisions)) {
          for (const d of event.data.decisions) {
            state.privacyDecisions.push({
              timeShort: event.timeShort,
              ...d
            });
          }
          renderPrivacyTable();
        }
      }

      if (event.data?.piiCount !== undefined || event.data?.redactedCount !== undefined) {
        const count = event.data.piiCount || event.data.redactedCount || 0;
        state.stats.redactionsCount += count;
        document.getElementById("dom-curr-pii").textContent = count;
      }

      if (event.data?.screenshotUrl || event.data?.sanitizedScreenshot) {
        const url = event.data.screenshotUrl || event.data.sanitizedScreenshot;
        state.lastScreenshotUrl = url;
        const ssImg = document.getElementById("ss-image");
        const ssPlaceholder = document.getElementById("ss-placeholder");
        ssImg.src = url;
        ssImg.style.display = "block";
        ssPlaceholder.style.display = "none";
      }

      updateMetricsUI();
      renderTimeline();
    }

    function updateMetricsUI() {
      mTotalEvents.textContent = state.stats.totalEvents;
      mAgentSteps.textContent = state.stats.agentSteps;
      mApiCalls.textContent = state.stats.apiCalls;
      mElements.textContent = state.stats.elementsCount;
      mRedactions.textContent = state.stats.redactionsCount;

      document.getElementById("tab-count-timeline").textContent = state.events.length;
      document.getElementById("tab-count-api").textContent = state.apiCalls.length;
      document.getElementById("tab-count-dom").textContent = state.stats.elementsCount;
      const privTabCount = document.getElementById("tab-count-privacy");
      if (privTabCount) privTabCount.textContent = state.privacyDecisions.length;

      if (state.stats.apiLatencies.length > 0) {
        const avg = Math.round(state.stats.apiLatencies.reduce((a,b)=>a+b,0) / state.stats.apiLatencies.length);
        mApiSub.textContent = "Avg latency: " + avg + " ms";
      }
    }

    function renderTimeline() {
      if (state.events.length === 0) {
        emptyState.style.display = "flex";
        return;
      }
      emptyState.style.display = "none";

      const filter = state.filter;
      const filtered = state.events.filter(ev => {
        if (filter === "ALL") return true;
        const s = ev.stage.toUpperCase();
        if (filter === "USER") return s.includes("USER");
        if (filter === "API") return s.includes("API");
        if (filter === "DOM") return s.includes("DOM") || s.includes("PERCEPT");
        if (filter === "ACTION") return s.includes("ACTION");
        if (filter === "ERROR") return s.includes("ERROR") || s.includes("FAIL") || s.includes("STALL") || ev.level === "error";
        return true;
      });

      feed.innerHTML = "";
      for (const ev of filtered) {
        const card = document.createElement("div");
        card.className = "event-card " + getCardStageClass(ev.stage);

        const header = document.createElement("div");
        header.className = "card-header";

        const meta = document.createElement("div");
        meta.className = "card-meta";

        const badge = document.createElement("span");
        badge.className = "badge " + getBadgeClass(ev.stage);
        badge.textContent = ev.stage;

        const eventTitle = document.createElement("span");
        eventTitle.className = "card-event";
        eventTitle.textContent = ev.event;

        meta.appendChild(badge);
        meta.appendChild(eventTitle);

        const time = document.createElement("span");
        time.className = "card-time";
        time.textContent = ev.timeShort || "";

        header.appendChild(meta);
        header.appendChild(time);
        card.appendChild(header);

        if (ev.data) {
          if (typeof ev.data === "string") {
            const summary = document.createElement("div");
            summary.className = "card-summary";
            summary.textContent = ev.data;
            card.appendChild(summary);
          } else {
            // Check for redacted screenshot thumbnail
            const ssUrl = ev.data.screenshotBase64 || ev.data.sanitizedScreenshot || ev.data.screenshotUrl;
            if (ssUrl && typeof ssUrl === "string" && ssUrl.startsWith("data:image/")) {
              const ssThumbWrap = document.createElement("div");
              ssThumbWrap.style.margin = "8px 0";
              const titleBar = document.createElement("div");
              titleBar.style.cssText = "font-size: 11px; font-weight: 600; color: var(--accent-cyan); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;";
              titleBar.innerHTML = '<span>📷 Redacted Screenshot (Sent to AI Agent)</span><span style="font-size: 10px; background: rgba(6,182,212,0.15); color: #06b6d4; padding: 1px 6px; border-radius: 4px;">0 Raw PII</span>';
              const imgEl = document.createElement("img");
              imgEl.src = ssUrl;
              imgEl.style.cssText = "max-height: 140px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border-subtle); cursor: pointer; display: block;";
              imgEl.title = "Click to view full redacted screenshot";
              imgEl.addEventListener("click", () => {
                const modal = document.getElementById("img-modal");
                const modalImg = document.getElementById("modal-img");
                modalImg.src = ssUrl;
                modal.classList.add("open");
              });
              ssThumbWrap.appendChild(titleBar);
              ssThumbWrap.appendChild(imgEl);
              card.appendChild(ssThumbWrap);
            }

            // Check for sanitized DOM context
            if (ev.data.sanitizedDomContext && typeof ev.data.sanitizedDomContext === "string") {
              const domDetails = document.createElement("details");
              domDetails.style.margin = "6px 0";
              const summaryEl = document.createElement("summary");
              summaryEl.style.cssText = "cursor: pointer; color: var(--accent-blue); font-size: 11px; font-weight: 600; user-select: none;";
              summaryEl.textContent = "📄 Sanitized DOM Context (" + ev.data.sanitizedDomContext.length + " chars)";
              const preEl = document.createElement("pre");
              preEl.className = "code-block";
              preEl.style.cssText = "max-height: 160px; margin-top: 6px; white-space: pre-wrap; font-size: 10px;";
              preEl.textContent = ev.data.sanitizedDomContext;
              domDetails.appendChild(summaryEl);
              domDetails.appendChild(preEl);
              card.appendChild(domDetails);
            }

            // Clean data object without huge base64 strings for the JSON inspector
            const cleanData = Object.assign({}, ev.data);
            if (cleanData.screenshotBase64) cleanData.screenshotBase64 = "[data:image/... base64 length: " + cleanData.screenshotBase64.length + "]";
            if (cleanData.sanitizedScreenshot) cleanData.sanitizedScreenshot = "[data:image/... base64 length: " + cleanData.sanitizedScreenshot.length + "]";
            if (cleanData.screenshotUrl && cleanData.screenshotUrl.startsWith("data:image/")) cleanData.screenshotUrl = "[data:image/... base64 length: " + cleanData.screenshotUrl.length + "]";
            if (cleanData.sanitizedDomContext && cleanData.sanitizedDomContext.length > 300) cleanData.sanitizedDomContext = cleanData.sanitizedDomContext.slice(0, 300) + "... [truncated in summary, see DOM preview above]";

            const jsonBox = document.createElement("div");
            jsonBox.className = "code-block";
            jsonBox.textContent = JSON.stringify(cleanData, null, 2);
            card.appendChild(jsonBox);
          }
        }

        feed.appendChild(card);
      }
    }

    function renderApiTable() {
      const tbody = document.getElementById("api-table-body");
      if (state.apiCalls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 40px;">No outgoing LLM API calls captured yet.</td></tr>';
        return;
      }

      tbody.innerHTML = "";
      for (const call of state.apiCalls) {
        const tr = document.createElement("tr");
        const d = call.data || {};
        const status = d.status || (call.event.includes("FAIL") ? 400 : 200);
        const statusClass = status === 200 ? "status-200" : "status-400";

        tr.innerHTML = \`
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-dim);">\${call.timeShort}</td>
          <td><strong style="color: var(--text-main);">\${d.model || "Qwen/Qwen2.5-VL-72B-Instruct"}</strong><br><span style="font-size: 11px; color: var(--text-dim);">\${d.provider || "Hugging Face"}</span></td>
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--accent-blue); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${d.endpoint || "https://router.huggingface.co/v1/chat/completions"}</td>
          <td><span class="status-code \${statusClass}">\${status}</span></td>
          <td style="font-family: var(--font-mono); font-size: 12px;">\${d.latencyMs ? d.latencyMs + " ms" : "--"}</td>
          <td><strong style="color: var(--accent-cyan);">\${d.actionType || d.chosenAction || "--"}</strong></td>
          <td><button class="btn" style="padding: 2px 8px; font-size: 11px;" onclick='alert(\${JSON.stringify(JSON.stringify(d, null, 2))})'>Inspect</button></td>
        \`;
        tbody.appendChild(tr);
      }
    }

    // Modal interaction
    const modal = document.getElementById("modal-overlay");
    const modalImg = document.getElementById("modal-img");
    const ssImg = document.getElementById("ss-image");
    if (ssImg) {
      ssImg.addEventListener("click", () => {
        if (state.lastScreenshotUrl) {
          modalImg.src = state.lastScreenshotUrl;
          modal.classList.remove("hidden");
        }
      });
    }
    document.getElementById("modal-close-btn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    // Privacy Decision Table Rendering
    function renderPrivacyTable() {
      const tbody = document.getElementById("session-privacy-table-body");
      if (!tbody) return;
      if (state.privacyDecisions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 30px;">No live privacy decisions recorded in current session. Run a task in the extension to view live decisions.</td></tr>';
        return;
      }
      tbody.innerHTML = "";
      for (const d of state.privacyDecisions) {
        const tr = document.createElement("tr");
        const badgeColor = d.decision === "ALLOW" ? "#34d399" : (d.decision === "TOKENIZE" ? "#f87171" : (d.decision === "LOCAL_ONLY" ? "#c084fc" : "#94a3b8"));
        const badgeBg = d.decision === "ALLOW" ? "rgba(52, 211, 153, 0.15)" : (d.decision === "TOKENIZE" ? "rgba(239, 68, 68, 0.15)" : (d.decision === "LOCAL_ONLY" ? "rgba(168, 85, 247, 0.15)" : "rgba(148, 163, 184, 0.12)"));
        const icon = d.decision === "ALLOW" ? "🟢" : (d.decision === "TOKENIZE" ? "🔴" : (d.decision === "LOCAL_ONLY" ? "🔒" : "⚫"));

        const timeText = d.timeShort || "--";
        const idText = d.piiId || d.id || "--";
        const catText = d.category || "--";
        const roleText = d.semanticRole || "unknown";
        const necText = d.taskNecessity || "unknown";
        const reasonText = (d.reasonCodes && d.reasonCodes[0]) || d.reasonCode || "--";
        const tokenText = d.token || "--";

        tr.innerHTML = "<td>" + timeText + "</td>" +
          "<td style='font-family: var(--font-mono); font-weight: 600;'>" + idText + "</td>" +
          "<td>" + catText + "</td>" +
          "<td><span style='font-size: 11px; color: var(--text-muted);'>" + roleText + "</span></td>" +
          "<td><span style='font-size: 11px; color: var(--text-dim);'>" + necText + "</span></td>" +
          "<td><span style='display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; background: " + badgeBg + "; color: " + badgeColor + ";'><span>" + icon + "</span> " + d.decision + "</span></td>" +
          "<td style='font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);'>" + reasonText + "</td>" +
          "<td style='font-family: var(--font-mono); font-size: 11px; color: var(--accent-cyan);'>" + tokenText + "</td>";
        tbody.appendChild(tr);
      }
    }

    // Interactive Reviewer Mixed-Content Demo Runner
    const btnRunDemo = document.getElementById("btn-run-privacy-demo");
    if (btnRunDemo) {
      btnRunDemo.addEventListener("click", async () => {
        btnRunDemo.textContent = "⏳ Running Verification...";
        btnRunDemo.disabled = true;
        try {
          const res = await fetch("/api/privacy/demo");
          if (!res.ok) throw new Error("HTTP " + res.status);
          const data = await res.json();

          const resultsBox = document.getElementById("privacy-demo-results-box");
          const tableBody = document.getElementById("privacy-demo-table-body");
          const consistencyTag = document.getElementById("privacy-demo-consistency-tag");

          if (resultsBox && tableBody) {
            resultsBox.style.display = "block";
            tableBody.innerHTML = "";

            if (data.allConsistent) {
              consistencyTag.textContent = "✔ 100% Boundary Consistency Verified (7/7 Classes)";
              consistencyTag.style.background = "rgba(52, 211, 153, 0.15)";
              consistencyTag.style.color = "#34d399";
            } else {
              consistencyTag.textContent = "⚠️ Inconsistency Detected";
              consistencyTag.style.background = "rgba(239, 68, 68, 0.15)";
              consistencyTag.style.color = "#f87171";
            }

            for (const row of (data.matrix || [])) {
              const tr = document.createElement("tr");
              const b = row.badge;
              const badgeBg = b.color === "GREEN" ? "rgba(52, 211, 153, 0.15)" : (b.color === "RED" ? "rgba(239, 68, 68, 0.15)" : (b.color === "PURPLE" ? "rgba(168, 85, 247, 0.15)" : "rgba(148, 163, 184, 0.12)"));
              const badgeColor = b.color === "GREEN" ? "#34d399" : (b.color === "RED" ? "#f87171" : (b.color === "PURPLE" ? "#c084fc" : "#94a3b8"));
              const domColor = b.color === "GREEN" ? "#34d399" : (b.color === "RED" ? "#f87171" : "#94a3b8");
              const ssColor = b.color === "GREEN" ? "#34d399" : "#f87171";
              const vaultColor = row.representations.vault.indexOf("Stored") !== -1 ? "#c084fc" : "var(--text-dim)";

              tr.innerHTML = "<td style='font-weight: 600; color: var(--text-main);'>" + row.name + "</td>" +
                "<td><code style='color: var(--accent-cyan);'>" + row.category + "</code></td>" +
                "<td><div style='font-size: 11px;'>Role: <strong>" + row.semanticRole + "</strong></div><div style='font-size: 10px; color: var(--text-dim);'>" + row.taskNecessity + "</div></td>" +
                "<td><span style='display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; background: " + badgeBg + "; color: " + badgeColor + ";'><span>" + b.icon + "</span> " + b.label + "</span><div style='font-size: 9px; font-family: var(--font-mono); color: var(--text-dim); margin-top: 2px;'>" + row.reasonCode + "</div></td>" +
                "<td style='font-family: var(--font-mono); font-size: 11px; color: " + domColor + ";'>" + row.representations.dom + "</td>" +
                "<td style='font-size: 11px; color: " + ssColor + ";'>" + row.representations.screenshot + "</td>" +
                "<td style='font-family: var(--font-mono); font-size: 11px; color: " + domColor + ";'>" + row.representations.remotePayload + "</td>" +
                "<td style='font-size: 11px; color: #34d399;'>" + row.representations.telemetry + "</td>" +
                "<td style='font-size: 11px; color: " + vaultColor + ";'>" + row.representations.vault + "</td>";

              tableBody.appendChild(tr);
            }
          }
        } catch (err) {
          alert("Failed to run privacy verification demo: " + err.message);
        } finally {
          btnRunDemo.textContent = "▶ Re-Run Mixed-Content Verification";
          btnRunDemo.disabled = false;
        }
      });
    }

    // Clear logs button
    document.getElementById("btn-clear").addEventListener("click", async () => {
      if (!confirm("Clear all recorded telemetry history?")) return;
      try {
        await fetch("/api/events", { method: "DELETE" });
        state.events = [];
        state.apiCalls = [];
        state.privacyDecisions = [];
        state.stats = { totalEvents: 0, agentSteps: 0, apiCalls: 0, apiLatencies: [], elementsCount: 0, redactionsCount: 0 };
        diagBanner.classList.add("hidden");
        updateMetricsUI();
        renderTimeline();
        renderApiTable();
        renderPrivacyTable();
      } catch (err) {
        alert("Failed to clear: " + err.message);
      }
    });

    // Export logs JSON button
    document.getElementById("btn-export").addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.events, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "agent-telemetry-" + Date.now() + ".json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    // Initial Load & SSE Connection
    async function initDashboard() {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const initialEvents = await res.json();
          if (Array.isArray(initialEvents)) {
            for (const ev of initialEvents) processEvent(ev);
          }
        }
      } catch {}

      const sse = new EventSource("/api/events/stream");
      sse.onopen = () => {
        connStatus.className = "status-pill";
        connText.textContent = "Live Streaming";
      };
      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.event === "LOGS_CLEARED") {
            state.events = [];
            state.apiCalls = [];
            state.privacyDecisions = [];
            renderTimeline();
            renderApiTable();
            renderPrivacyTable();
            return;
          }
          processEvent(event);
        } catch {}
      };
      sse.onerror = () => {
        connStatus.className = "status-pill disconnected";
        connText.textContent = "Reconnecting...";
      };
    }

    window.addEventListener("DOMContentLoaded", initDashboard);
  </script>
</body>
</html>`;

// Autonomous Agent Reasoning Engine (Zero Remote Key Local Agent)
export function computeAutonomousAgentDecision({
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
  sanitizedDomContext = "",
  currentUrl = "",
  pageTitle = "",
  actionHistory = []
}) {
  function computeRawDecision() {
    const taskType = currentTask?.type || "general_action";
    const goalSummary = userGoal || goal.summary || goal.originalGoal || "Execute user browser task";
    const constraints = goal.constraints || [];
    const targetEntity = goal.targetEntity || "";

    // 1. Check if already satisfied or completed
    if (taskType === "complete" || executionState.isGoalSatisfied) {
      return {
        ok: true,
        observation: "Goal satisfied based on previous execution steps.",
        goal_progress: { isSatisfied: true, remainingTasks: [] },
        next_task: null,
        action: {
          actionType: "COMPLETE",
          target: "page_root",
          parameters: {},
          thenPressEnter: false,
          reasoningSummary: "All goal objectives and constraints satisfied."
        }
      };
    }

    // 2. Search Task: find search input field
    if (taskType === "search" || (!actionHistory.some(a => a.includes("search") || a.includes("TYPE")) && !executionState.hasSearched)) {
      const searchInput = interactiveElements.find(el => {
        const tag = (el.tag || "").toLowerCase();
        const type = (el.type || "").toLowerCase();
        const name = (el.name || "").toLowerCase();
        const placeholder = (el.placeholder || "").toLowerCase();
        const aria = (el.ariaLabel || "").toLowerCase();
        if (tag === "input" || tag === "textarea") {
          if (type === "search" || name === "q" || name === "field-keywords" || placeholder.includes("search") || aria.includes("search")) {
            return true;
          }
        }
        return false;
      }) || interactiveElements.find(el => (el.tag === "input" || el.tag === "textarea") && (el.type === "text" || !el.type));

      if (searchInput) {
        let searchQuery = targetEntity || goalSummary;
        for (const c of constraints) {
          if (c.value && !searchQuery.toLowerCase().includes(String(c.value).toLowerCase())) {
            searchQuery += ` ${c.value}`;
          }
        }

        return {
          ok: true,
          observation: `Identified search input [${searchInput.elementId || searchInput.id}]. Dispatching query: "${searchQuery.trim()}".`,
          goal_progress: { isSatisfied: false, remainingTasks: ["filter", "select_item"] },
          next_task: "filter",
          action: {
            actionType: "TYPE",
            target: searchInput.elementId || searchInput.id,
            parameters: { text: searchQuery.trim() },
            thenPressEnter: true,
            reasoningSummary: `Type search query "${searchQuery.trim()}" into search bar and press Enter.`
          }
        };
      }
    }

    // 3. Filter Task: handle price or facet filters
    if (taskType === "filter") {
      const priceConstraint = constraints.find(c => c.type === "PRICE_MAX" || c.type === "PRICE_RANGE");
      if (priceConstraint) {
        const maxPrice = priceConstraint.value || priceConstraint.max;
        const maxPriceInput = interactiveElements.find(el => {
          const text = ((el.placeholder || "") + " " + (el.ariaLabel || "") + " " + (el.text || "")).toLowerCase();
          return (el.tag === "input" || el.isFilter) && (text.includes("high-price") || text.includes("max") || text.includes("upper") || text.includes("to"));
        });
        if (maxPriceInput) {
          return {
            ok: true,
            observation: `Found max price input [${maxPriceInput.elementId || maxPriceInput.id}]. Setting price limit to ${maxPrice}.`,
            goal_progress: { isSatisfied: false, remainingTasks: ["select_item"] },
            next_task: "select_item",
            action: {
              actionType: "TYPE",
              target: maxPriceInput.elementId || maxPriceInput.id,
              parameters: { text: String(maxPrice) },
              thenPressEnter: true,
              isFilter: true,
              filterName: "price_max",
              filterValue: String(maxPrice),
              reasoningSummary: `Enter upper price limit ${maxPrice} into price filter.`
            }
          };
        }
      }

      for (const c of constraints) {
        const val = String(c.value || "").toLowerCase();
        if (!val) continue;
        const facet = interactiveElements.find(el => {
          if (el.isSponsored) return false;
          const text = ((el.text || "") + " " + (el.ariaLabel || "")).toLowerCase();
          return (el.isFilter || el.type === "checkbox" || el.tag === "a" || el.tag === "button") && text.includes(val);
        });
        if (facet) {
          return {
            ok: true,
            observation: `Found filter facet [${facet.elementId || facet.id}] for constraint "${val}".`,
            goal_progress: { isSatisfied: false, remainingTasks: ["select_item"] },
            next_task: "select_item",
            action: {
              actionType: "CLICK",
              target: facet.elementId || facet.id,
              parameters: {},
              thenPressEnter: false,
              isFilter: true,
              filterName: c.type || "facet",
              filterValue: val,
              reasoningSummary: `Apply filter facet for "${val}".`
            }
          };
        }
      }
    }

    // 4. Select Candidate / Item: find genuine product or search result (skip sponsored ads)
    if (taskType === "select_candidate" || taskType === "select_item" || taskType === "inspect" || taskType === "inspect_candidate" || taskType === "navigate" || taskType === "general_action") {
      const productItem = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        if (el.isFilter) return false;
        if (el.tag === "button" && ((el.text || "").toLowerCase().includes("search") || (el.text || "").toLowerCase().includes("go"))) return false;
        if (el.isProductResult) return true;
        const text = (el.text || el.ariaLabel || "").toLowerCase();
        return (el.tag === "a" || el.tag === "div" || el.tag === "li" || el.tag === "h3" || el.tag === "h2") &&
          text.length > 10 &&
          !/\b(sign in|login|register|cart|basket|home|help|privacy|terms|menu)\b/i.test(text);
      });

      if (productItem) {
        const isCartNext = /add to cart|add to bag|add to basket/i.test(goalSummary);
        const isPerformActionNext = Boolean(goal.actionIntent || currentTask?.actionIntent || taskType === "perform_action");
        const nextTask = isCartNext ? "add_to_cart" : (isPerformActionNext ? "perform_action" : "submit");
        return {
          ok: true,
          observation: `Identified authentic candidate item [${productItem.elementId || productItem.id}]: "${(productItem.text || productItem.ariaLabel || '').slice(0, 50)}...".`,
          goal_progress: { isSatisfied: false, remainingTasks: [nextTask] },
          next_task: nextTask,
          action: {
            actionType: "CLICK",
            target: productItem.elementId || productItem.id,
            parameters: {},
            thenPressEnter: false,
            reasoningSummary: `Click on matching authentic candidate result "${(productItem.text || productItem.ariaLabel || '').slice(0, 50)}".`
          }
        };
      }
    }

    // 5. Add to Cart: strictly matches Add to Cart / Add to Bag / Add to Basket (preserves user intent)
    if (taskType === "add_to_cart" || (/add to cart|add to bag|add to basket/i.test(goalSummary) && !actionHistory.some(a => /add to cart|cart|bag/i.test(a)))) {
      const cartBtn = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = ((el.text || "") + " " + (el.value || "") + " " + (el.ariaLabel || "") + " " + (el.title || "")).toLowerCase();
        return /^(?:add to (?:cart|bag|basket)|add item to cart)\b/i.test(text) ||
               (/\b(?:add to cart|add to bag|add to basket)\b/i.test(text) && !/\b(?:buy now|checkout|place order)\b/i.test(text));
      }) || interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = ((el.text || "") + " " + (el.value || "") + " " + (el.ariaLabel || "")).toLowerCase();
        return (el.tag === "button" || el.tag === "input" || el.type === "submit") && (text.includes("cart") || text.includes("bag"));
      });

      if (cartBtn) {
        return {
          ok: true,
          observation: `Found primary Add to Cart button [${cartBtn.elementId || cartBtn.id}]. Satisfying intent to add selected item.`,
          goal_progress: { isSatisfied: true, remainingTasks: [] },
          next_task: null,
          action: {
            actionType: "CLICK",
            target: cartBtn.elementId || cartBtn.id,
            parameters: {},
            thenPressEnter: false,
            actionIntent: "add_to_cart",
            reasoningSummary: "Click Add to Cart button to complete user intent."
          }
        };
      }
    }

    // 5b. Generic UI Action Task (e.g., subscribe, follow, star, like, bookmark, download, share, pin, play, favorite, join)
    const actionIntent = currentTask?.actionIntent || goal?.actionIntent;
    if (taskType === "perform_action" || (actionIntent && !actionHistory.some(a => String(a).toLowerCase().includes(String(actionIntent).toLowerCase())))) {
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
            ok: true,
            observation: `Found target element for requested action "${intentVerb}" [${targetBtn.elementId || targetBtn.id}].`,
            goal_progress: { isSatisfied: true, remainingTasks: [] },
            next_task: null,
            action: {
              actionType: "CLICK",
              target: targetBtn.elementId || targetBtn.id,
              parameters: {},
              actionIntent: intentVerb,
              thenPressEnter: false,
              reasoningSummary: `Click "${targetBtn.text || targetBtn.ariaLabel || intentVerb}" to perform requested ${intentVerb} action.`
            }
          };
        }
      }
    }

    // 6. Generic Form Field Filling: fill inputs from goal constraints
    const unfilledInput = interactiveElements.find(el => {
      if (el.tag !== "input" && el.tag !== "textarea") return false;
      const type = (el.type || "").toLowerCase();
      return type !== "submit" && type !== "button" && type !== "hidden" && !el.value;
    });
    if (unfilledInput && constraints.length > 0) {
      const constraint = constraints.find(c => c.value);
      if (constraint) {
        return {
          ok: true,
          observation: `Populating form field [${unfilledInput.elementId || unfilledInput.id}] with constraint "${constraint.value}".`,
          goal_progress: { isSatisfied: false, remainingTasks: ["submit"] },
          next_task: "submit",
          action: {
            actionType: "TYPE",
            target: unfilledInput.elementId || unfilledInput.id,
            parameters: { text: String(constraint.value) },
            thenPressEnter: false,
            reasoningSummary: `Fill form field with ${constraint.value}.`
          }
        };
      }
    }

    // 7. Submit Button
    if (taskType === "submit" || taskType === "confirm" || /confirm|submit|place order/i.test(goalSummary)) {
      const submitBtn = interactiveElements.find(el => {
        if (el.isSponsored || el.isAd) return false;
        const text = ((el.text || "") + " " + (el.value || "") + " " + (el.ariaLabel || "")).toLowerCase();
        return (el.tag === "button" || el.type === "submit" || el.tag === "a") &&
          /^(confirm|submit|place order|complete|continue)\b/i.test(text);
      });
      if (submitBtn) {
        return {
          ok: true,
          observation: `Found Submit button [${submitBtn.elementId || submitBtn.id}].`,
          goal_progress: { isSatisfied: true, remainingTasks: [] },
          next_task: null,
          action: {
            actionType: "CLICK",
            target: submitBtn.elementId || submitBtn.id,
            parameters: {},
            thenPressEnter: false,
            reasoningSummary: "Click Submit button to complete form action."
          }
        };
      }
    }

    // 8. Generic first actionable element
    const firstActionable = interactiveElements.find(el => !el.isSponsored && !el.isAd && (el.tag === "button" || el.tag === "a" || el.tag === "input"));
    if (firstActionable) {
      return {
        ok: true,
        observation: `Progressing goal with actionable element [${firstActionable.elementId || firstActionable.id}].`,
        goal_progress: { isSatisfied: false, remainingTasks: [] },
        next_task: "advance",
        action: {
          actionType: firstActionable.tag === "input" ? "TYPE" : "CLICK",
          target: firstActionable.elementId || firstActionable.id,
          parameters: firstActionable.tag === "input" ? { text: goalSummary } : {},
          thenPressEnter: false,
          reasoningSummary: `Advance interaction with [${firstActionable.elementId || firstActionable.id}].`
        }
      };
    }

    return {
      ok: true,
      observation: "No further DOM interactions required. Goal completed.",
      goal_progress: { isSatisfied: true, remainingTasks: [] },
      next_task: null,
      action: {
        actionType: "COMPLETE",
        target: "page_root",
        parameters: {},
        thenPressEnter: false,
        reasoningSummary: "Execution completed."
      }
    };
  }

  const rawDec = computeRawDecision();
  const goalDesc = userGoal || goal.summary || goal.description || goal.originalGoal || "Execute user browser task";
  const actionType = String(rawDec?.action?.actionType || rawDec?.action?.type || "CLICK").toUpperCase();
  const isComplete = Boolean(
    rawDec?.goal_progress?.isSatisfied ||
    actionType === "COMPLETE" ||
    actionType === "DONE"
  );
  const target = rawDec?.action?.target || (isComplete ? "page_root" : null);
  const val = rawDec?.action?.parameters?.text ?? rawDec?.action?.parameters?.value ?? rawDec?.action?.value ?? null;
  const currentTaskId = rawDec?.next_task || (isComplete ? "task_complete" : "task_step");

  return {
    ...rawDec,
    goal: {
      description: goalDesc,
      status: isComplete ? "completed" : "in_progress"
    },
    tasks: Array.isArray(tasks) && tasks.length > 0 ? tasks : [
      { id: "task_1", description: goalDesc, status: isComplete ? "completed" : "in_progress" }
    ],
    currentTaskId,
    taskUpdate: {
      completedTaskIds: isComplete ? ["task_1"] : [],
      newTaskIds: []
    },
    replan: false,
    reason: rawDec?.action?.reasoningSummary || rawDec?.observation || "Model planned action",
    action: {
      ...rawDec?.action,
      type: actionType,
      actionType,
      target,
      value: val,
      parameters: rawDec?.action?.parameters || (val !== null ? { text: String(val) } : {}),
      thenPressEnter: Boolean(rawDec?.action?.thenPressEnter),
      reasoningSummary: rawDec?.action?.reasoningSummary || rawDec?.observation || "Model planned action"
    }
  };
}

// Create HTTP Server
export function createObservabilityServer(port = PORT, host = HOST) {
  const server = http.createServer((req, res) => {
    // CORS headers for Chrome Extension
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;

    // 1. Ingest Telemetry: POST /api/events or legacy POST /log
    if (req.method === "POST" && (pathname === "/api/events" || pathname === "/log")) {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) { // 25MB limit for high-res screenshots
          req.destroy();
        }
      });

      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const entry = eventStore.add(payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id: entry.id }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON: " + err.message }));
        }
      });
      return;
    }

    // 1b. Environment & Token Configuration: GET /api/config
    if (req.method === "GET" && pathname === "/api/config") {
      const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const envPath = path.resolve(rootDir, ".env");
      const envVars = {};
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, "utf-8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            envVars[key] = val;
          }
        }
      }
      const hfKey = envVars.HUGGINGFACE_API_KEY || envVars.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        provider: envVars.LLM_PROVIDER || "huggingface",
        huggingface_api_key: hfKey,
        hf_token: hfKey,
        huggingface_model: envVars.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct",
        openrouter_api_key: envVars.OPENROUTER_API_KEY || "",
        openrouter_model: envVars.OPENROUTER_MODEL || "qwen/qwen-2.5-vl-72b-instruct:free",
        groq_api_key: envVars.GROQ_API_KEY || "",
        groq_model: envVars.GROQ_MODEL || "llama-3.3-70b-versatile"
      }));
      return;
    }

    // 2. AI Agent Autonomous Multimodal Reasoning: POST /api/agent/reason
    if (req.method === "POST" && pathname === "/api/agent/reason") {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
        if (body.length > 30 * 1024 * 1024) { // 30MB limit for base64 screenshot + DOM
          req.destroy();
        }
      });

      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const {
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
            sanitizedDomContext = "",
            currentUrl = "",
            pageTitle = "",
            actionHistory = []
          } = payload;

          // Record multimodal payload reception
          eventStore.add({
            stage: "AI AGENT MULTIMODAL INGESTION",
            event: "REDACTED_SS_AND_DOM_RECEIVED",
            level: "info",
            data: {
              goalSummary: userGoal || goal.summary || goal.originalGoal || "Execute user browser task",
              currentTask: currentTask?.type || "general_action",
              elementCount: interactiveElements.length,
              hasRedactedScreenshot: Boolean(screenshotBase64),
              screenshotBase64: screenshotBase64 || undefined,
              sanitizedDomContext: sanitizedDomContext || undefined,
              elementsSample: interactiveElements.slice(0, 10).map(e => ({ id: e.elementId || e.id, tag: e.tag, text: e.text, isFilter: e.isFilter }))
            }
          });

          // Autonomous decision
          const decision = computeAutonomousAgentDecision({
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
          });

          // Log decision
          eventStore.add({
            stage: "AI AGENT DECISION",
            event: "ACTION_PLANNED",
            level: "info",
            data: {
              observation: decision.observation,
              action: decision.action,
              goal_progress: decision.goal_progress
            }
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(decision));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "AI Agent Reasoning Error: " + err.message }));
        }
      });
      return;
    }

    // 2. Fetch Events: GET /api/events
    if (req.method === "GET" && pathname === "/api/events") {
      const since = parseInt(parsedUrl.searchParams.get("since") || "0", 10);
      const stage = parsedUrl.searchParams.get("stage");

      let filtered = eventStore.events;
      if (since > 0) {
        filtered = filtered.filter(e => e.id > since);
      }
      if (stage) {
        filtered = filtered.filter(e => e.stage.toUpperCase() === stage.toUpperCase());
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(filtered));
      return;
    }

    // 3. Server-Sent Events Stream: GET /api/events/stream
    if (req.method === "GET" && pathname === "/api/events/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write("retry: 3000\n\n");

      eventStore.sseClients.add(res);
      req.on("close", () => {
        eventStore.sseClients.delete(res);
      });
      return;
    }

    // 4. Clear Events: DELETE /api/events
    if (req.method === "DELETE" && pathname === "/api/events") {
      eventStore.clear();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "Telemetry cleared." }));
      return;
    }

    // 5. Health Status: GET /api/status
    if (req.method === "GET" && pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ONLINE",
        uptimeSeconds: Math.round((Date.now() - eventStore.startTime) / 1000),
        totalEvents: eventStore.events.length,
        connectedClients: eventStore.sseClients.size,
        port: PORT,
        host: HOST
      }));
      return;
    }

    // 6. Export JSON: GET /api/export
    if (req.method === "GET" && pathname === "/api/export") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="agent-telemetry-${Date.now()}.json"`
      });
      res.end(JSON.stringify(eventStore.events, null, 2));
      return;
    }

    // 7. Privacy Reviewer Verification Demo: GET /api/privacy/demo
    if (req.method === "GET" && pathname === "/api/privacy/demo") {
      try {
        const demoResults = evaluateMixedContentDemo();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(demoResults));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // 7. Serve Web Dashboard: GET /
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
      return;
    }

    // Fallback 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  return { server, eventStore };
}

// CLI Execution check
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { server } = createObservabilityServer(PORT, HOST);
  server.listen(PORT, HOST, () => {
    console.log(`\n${COLORS.bgGreen}${COLORS.bright} PRIVACY BROWSER AGENT: OBSERVABILITY BACKEND ACTIVE ${COLORS.reset}`);
    console.log(`${COLORS.green}✔ Dashboard UI:   http://${HOST}:${PORT}${COLORS.reset}`);
    console.log(`${COLORS.green}✔ Ingestion API:  http://${HOST}:${PORT}/api/events${COLORS.reset}`);
    console.log(`${COLORS.green}✔ Live SSE Stream: http://${HOST}:${PORT}/api/events/stream${COLORS.reset}`);
    console.log(`${COLORS.dim}Open the Dashboard in your browser, then run tasks in Chrome to see live telemetry, API calls, and DOM perception.${COLORS.reset}\n`);
  });
}
