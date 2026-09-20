import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import { createObservabilityServer, eventStore } from "../scripts/extension-log-server.mjs";
import { MultimodalVisionAgent } from "../packages/privacy-core/src/multimodal-vision-agent.js";

test("Observability Backend & Real-time Dashboard Test Suite", async (t) => {
  const TEST_PORT = 9876;
  const TEST_HOST = "127.0.0.1";
  const { server } = createObservabilityServer(TEST_PORT, TEST_HOST);

  await new Promise((resolve) => server.listen(TEST_PORT, TEST_HOST, resolve));

  t.after(() => {
    server.close();
  });

  const baseUrl = `http://${TEST_HOST}:${TEST_PORT}`;

  // 1. Health Status endpoint
  await t.test("GET /api/status returns ONLINE status and server metrics", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, "ONLINE");
    assert.strictEqual(typeof data.uptimeSeconds, "number");
    assert.strictEqual(typeof data.totalEvents, "number");
    assert.strictEqual(data.port, 8765);
  });

  // 2. Dashboard UI Serving
  await t.test("GET / serves rich HTML dashboard with valid content-type", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "text/html; charset=utf-8");
    const html = await res.text();
    assert.ok(html.includes("Privacy Browser Agent — Observability & Reasoning Inspector"));
    assert.ok(html.includes("Live Timeline"));
    assert.ok(html.includes("API Inspector"));
    assert.ok(html.includes("EventSource"));
  });

  // 3. Telemetry Ingestion: POST /api/events
  await t.test("POST /api/events ingests telemetry events cleanly", async () => {
    const payload = {
      stage: "USER INPUT",
      event: "TASK_SUBMITTED",
      data: {
        task: "search for nike shoes under 7k",
        provider: "huggingface",
        model: "Qwen/Qwen3-VL-4B-Instruct"
      }
    };

    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 200);
    const result = await res.json();
    assert.strictEqual(result.ok, true);
    assert.ok(result.id > 0);
  });

  // 4. Backward compatibility: POST /log
  await t.test("POST /log accepts legacy format and ingests into store", async () => {
    const payload = {
      stage: "DOM PERCEPTION",
      event: "ELEMENTS_DISCOVERED",
      data: {
        pageTitle: "Amazon.in",
        pageUrl: "https://www.amazon.in",
        elementCount: 42
      }
    };

    const res = await fetch(`${baseUrl}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 200);
    const result = await res.json();
    assert.strictEqual(result.ok, true);
  });

  // 5. Invalid JSON Handling
  await t.test("POST /api/events rejects invalid JSON with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json-body{"
    });

    assert.strictEqual(res.status, 400);
    const result = await res.json();
    assert.strictEqual(result.ok, false);
  });

  // 6. Event Retrieval & Filtering: GET /api/events
  await t.test("GET /api/events returns stored events and respects stage filter", async () => {
    const resAll = await fetch(`${baseUrl}/api/events`);
    assert.strictEqual(resAll.status, 200);
    const allEvents = await resAll.json();
    assert.ok(Array.isArray(allEvents));
    assert.ok(allEvents.length >= 2);

    const resFiltered = await fetch(`${baseUrl}/api/events?stage=DOM%20PERCEPTION`);
    assert.strictEqual(resFiltered.status, 200);
    const filteredEvents = await resFiltered.json();
    assert.ok(Array.isArray(filteredEvents));
    assert.ok(filteredEvents.every(e => e.stage === "DOM PERCEPTION"));
  });

  // 7. Server-Sent Events (SSE) Stream
  await t.test("GET /api/events/stream connects as SSE and pushes events", async () => {
    const sseRes = await new Promise((resolve) => {
      const req = http.get(`${baseUrl}/api/events/stream`, (res) => {
        resolve(res);
      });
      req.end();
    });

    assert.strictEqual(sseRes.statusCode, 200);
    assert.strictEqual(sseRes.headers["content-type"], "text/event-stream");

    // Listen for next SSE message
    const messagePromise = new Promise((resolve) => {
      sseRes.on("data", (chunk) => {
        const text = chunk.toString();
        if (text.startsWith("data: ")) {
          const jsonStr = text.replace(/^data: /, "").trim();
          try {
            resolve(JSON.parse(jsonStr));
          } catch {}
        }
      });
    });

    // Ingest an event to trigger broadcast
    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "ACTION EXECUTION",
        event: "CLICK_EXECUTED",
        data: { target: "el_2" }
      })
    });

    const receivedEvent = await messagePromise;
    assert.strictEqual(receivedEvent.stage, "ACTION EXECUTION");
    assert.strictEqual(receivedEvent.event, "CLICK_EXECUTED");
    assert.strictEqual(receivedEvent.data.target, "el_2");

    sseRes.destroy();
  });

  // 8. Event Deletion: DELETE /api/events
  await t.test("DELETE /api/events clears event store", async () => {
    const delRes = await fetch(`${baseUrl}/api/events`, { method: "DELETE" });
    assert.strictEqual(delRes.status, 200);
    const result = await delRes.json();
    assert.strictEqual(result.ok, true);

    const checkRes = await fetch(`${baseUrl}/api/events`);
    const events = await checkRes.json();
    assert.strictEqual(events.length, 0);
  });

  // 9. Export JSON trace
  await t.test("GET /api/export returns JSON file attachment", async () => {
    const exportRes = await fetch(`${baseUrl}/api/export`);
    assert.strictEqual(exportRes.status, 200);
    assert.ok(exportRes.headers.get("content-disposition")?.includes("attachment"));
  });

  // 10. AI Agent Reason Endpoint: POST /api/agent/reason with Redacted Screenshot & Sanitized DOM
  await t.test("POST /api/agent/reason receives redacted screenshot and sanitized DOM, returning agent action", async () => {
    const fakeRedactedScreenshot = "data:image/svg+xml;utf8,<svg><rect fill='%23000000'/></svg>";
    const fakeSanitizedDom = "{\"tag\":\"body\",\"children\":[{\"id\":\"el_1\",\"tag\":\"input\",\"type\":\"search\"}]}";

    const payload = {
      goal: {
        summary: "Search for white running shoes",
        targetEntity: "white running shoes",
        constraints: [{ type: "COLOR", value: "white" }]
      },
      currentTask: { type: "search", description: "Search for white running shoes" },
      executionState: { stepCount: 1 },
      interactiveElements: [
        { elementId: "el_1", id: "el_1", tag: "input", type: "search", placeholder: "Search here" },
        { elementId: "el_2", id: "el_2", tag: "button", text: "Submit" }
      ],
      screenshotBase64: fakeRedactedScreenshot,
      sanitizedDomContext: fakeSanitizedDom,
      actionHistory: []
    };

    const res = await fetch(`${baseUrl}/api/agent/reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 200);
    const decision = await res.json();
    assert.strictEqual(decision.ok, true);
    assert.ok(decision.observation);
    assert.ok(decision.action);
    assert.strictEqual(decision.action.actionType, "TYPE");
    assert.strictEqual(decision.action.target, "el_1");
    assert.ok(decision.action.parameters.text.includes("white"));

    // Verify that the event was recorded in eventStore with screenshotBase64 and sanitizedDomContext
    const eventsRes = await fetch(`${baseUrl}/api/events?stage=AI%20AGENT%20MULTIMODAL%20INGESTION`);
    assert.strictEqual(eventsRes.status, 200);
    const events = await eventsRes.json();
    assert.ok(events.length > 0);
    const lastEvent = events[events.length - 1];
    assert.strictEqual(lastEvent.event, "REDACTED_SS_AND_DOM_RECEIVED");
    assert.strictEqual(lastEvent.data.hasRedactedScreenshot, true);
    assert.strictEqual(lastEvent.data.screenshotBase64, fakeRedactedScreenshot);
    assert.strictEqual(lastEvent.data.sanitizedDomContext, fakeSanitizedDom);
  });

  // 11. MultimodalVisionAgent.reason with provider="local" dispatches redacted SS + DOM cleanly
  await t.test("MultimodalVisionAgent.reason with provider='local' transmits redacted ss and dom, receiving agent decision", async () => {
    const fakeRedactedScreenshot = "data:image/svg+xml;utf8,<svg><rect fill='%23000000'/></svg>";
    const fakeSanitizedDom = "{\"tag\":\"body\",\"children\":[{\"id\":\"el_10\",\"tag\":\"input\",\"type\":\"text\",\"placeholder\":\"Filter by size\"}]}";

    const result = await MultimodalVisionAgent.reason({
      provider: "local",
      localEndpoint: `${baseUrl}/api/agent/reason`,
      goal: { summary: "Filter by size 9", constraints: [{ type: "SIZE", value: "9" }] },
      currentTask: { type: "filter", description: "Filter by size" },
      executionState: { stepCount: 2 },
      interactiveElements: [
        { elementId: "el_10", id: "el_10", tag: "a", text: "Size 9", isFilter: true }
      ],
      screenshotBase64: fakeRedactedScreenshot,
      sanitizedDomContext: fakeSanitizedDom,
      actionHistory: []
    });

    assert.ok(result);
    assert.strictEqual(result.ok, true);
    assert.ok(result.action);
    assert.strictEqual(result.action.actionType, "CLICK");
    assert.strictEqual(result.action.target, "el_10");
  });
});
