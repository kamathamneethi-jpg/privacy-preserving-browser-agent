import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    const data = rawPayload.data !== undefined ? rawPayload.data : rawPayload.payload || {};
    const metadata = rawPayload.metadata || {};

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
              ℹ️ Default Model Provider: <strong>Hugging Face (Free / Qwen3-VL-4B-Instruct)</strong>
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

      // Redactions / Screenshot
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
            const jsonBox = document.createElement("div");
            jsonBox.className = "code-block";
            jsonBox.textContent = JSON.stringify(ev.data, null, 2);
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
          <td><strong style="color: var(--text-main);">\${d.model || "Qwen/Qwen3-VL-4B-Instruct"}</strong><br><span style="font-size: 11px; color: var(--text-dim);">\${d.provider || "Hugging Face"}</span></td>
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

    // Clear logs button
    document.getElementById("btn-clear").addEventListener("click", async () => {
      if (!confirm("Clear all recorded telemetry history?")) return;
      try {
        await fetch("/api/events", { method: "DELETE" });
        state.events = [];
        state.apiCalls = [];
        state.stats = { totalEvents: 0, agentSteps: 0, apiCalls: 0, apiLatencies: [], elementsCount: 0, redactionsCount: 0 };
        diagBanner.classList.add("hidden");
        updateMetricsUI();
        renderTimeline();
        renderApiTable();
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
            renderTimeline();
            renderApiTable();
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
