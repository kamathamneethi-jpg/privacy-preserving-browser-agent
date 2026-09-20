import test from "node:test";
import assert from "node:assert/strict";
import {
  InteractiveElementRegistry,
  createInteractiveElementRegistry,
  DomDriver,
  BrowserActionEngine,
  BrowserAgentCoordinator
} from "../packages/privacy-core/src/index.js";
import {
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  E2E_WORKFLOW_STATUS
} from "../packages/shared-types/src/privacy-contracts.js";

/**
 * Simulated DOM Node helper for deterministic testing without full browser overhead.
 */
class MockDomNode {
  constructor(options = {}) {
    this.tagName = options.tagName || "DIV";
    this.id = options.id || "";
    this.name = options.name || "";
    this.type = options.type || "";
    this.value = options.value || "";
    this.textContent = options.textContent || "";
    this.placeholder = options.placeholder || "";
    this.checked = Boolean(options.checked);
    this.disabled = Boolean(options.disabled);
    this.isConnected = options.isConnected !== false;
    this.attributes = { ...options.attributes };
    this.events = [];
    this.options = options.options || [];
    this.children = options.children || [];
  }

  getAttribute(name) {
    if (name === "role") return this.attributes.role || null;
    if (name === "aria-label") return this.attributes["aria-label"] || null;
    if (name === "placeholder") return this.placeholder || null;
    if (name === "name") return this.name || null;
    if (name === "type") return this.type || null;
    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  setAttribute(name, val) {
    this.attributes[name] = val;
  }

  addEventListener(type, handler) {
    // Mock listener
  }

  removeEventListener(type, handler) {
    // Mock listener
  }

  dispatchEvent(evt) {
    this.events.push(evt);
    return true;
  }

  click() {
    this.events.push({ type: "click" });
  }

  focus() {
    this.events.push({ type: "focus" });
  }

  requestSubmit() {
    this.events.push({ type: "submit" });
  }
}

test("InteractiveElementRegistry discovers elements and assigns dynamic el_1, el_2 IDs", () => {
  const registry = createInteractiveElementRegistry();

  const mockTree = {
    children: [
      new MockDomNode({ tagName: "BUTTON", id: "btn-learn", textContent: "Learn more" }),
      new MockDomNode({ tagName: "INPUT", id: "name-in", name: "fullName", placeholder: "Enter your name", type: "text" }),
      new MockDomNode({
        tagName: "SELECT",
        id: "country-sel",
        name: "country",
        options: [{ value: "IN", textContent: "India" }, { value: "US", textContent: "USA" }]
      }),
      new MockDomNode({ tagName: "INPUT", id: "terms-box", type: "checkbox", checked: false }),
      new MockDomNode({ tagName: "A", id: "docs-link", attributes: { role: "link" }, textContent: "Docs" })
    ]
  };

  const observation = registry.observeDocument(mockTree);

  assert.equal(observation.count, 5);
  assert.ok(observation.snapshotId.startsWith("snap_"));
  assert.equal(observation.elements[0].elementId, "el_1");
  assert.equal(observation.elements[0].text, "Learn more");
  assert.equal(observation.elements[1].elementId, "el_2");
  assert.equal(observation.elements[1].placeholder, "Enter your name");
  assert.equal(observation.elements[2].elementId, "el_3");
  assert.equal(observation.elements[3].elementId, "el_4");
  assert.equal(observation.elements[3].type, "checkbox");
  assert.equal(observation.elements[4].elementId, "el_5");
});

test("InteractiveElementRegistry resolves elements and detects stale / disconnected targets", () => {
  const registry = createInteractiveElementRegistry();
  const connectedNode = new MockDomNode({ tagName: "BUTTON", id: "submit-btn", isConnected: true });
  const disconnectedNode = new MockDomNode({ tagName: "BUTTON", id: "old-btn", isConnected: false });

  registry.observeDocument({ children: [connectedNode, disconnectedNode] });

  const resConnected = registry.resolveElement("el_1");
  assert.equal(resConnected.resolved, true);
  assert.equal(resConnected.isConnected, true);
  assert.equal(resConnected.isStale, false);

  const resDisconnected = registry.resolveElement("el_2");
  assert.equal(resDisconnected.resolved, false);
  assert.equal(resDisconnected.isStale, true);

  const resNotFound = registry.resolveElement("el_999");
  assert.equal(resNotFound.resolved, false);
  assert.equal(resNotFound.isStale, false);
});

test("DomDriver executes generic actions (CLICK, TYPE, CLEAR, SELECT, CHECK, PRESS_KEY)", () => {
  const registry = createInteractiveElementRegistry();
  const btn = new MockDomNode({ tagName: "BUTTON", id: "btn-1", textContent: "Learn more" });
  const input = new MockDomNode({ tagName: "INPUT", id: "in-1", value: "" });
  const checkbox = new MockDomNode({ tagName: "INPUT", id: "chk-1", type: "checkbox", checked: false });
  const select = new MockDomNode({
    tagName: "SELECT",
    id: "sel-1",
    options: [{ value: "IN", textContent: "India" }]
  });

  registry.observeDocument({ children: [btn, input, checkbox, select] });

  const driver = new DomDriver({ registry });

  // 1. Click Learn more
  const clickRes = driver.execute(BROWSER_ACTION_TYPES.CLICK, "el_1");
  assert.equal(clickRes.ok, true);

  // 2. Type name
  const typeRes = driver.execute(BROWSER_ACTION_TYPES.TYPE, "el_2", { text: "John Doe" });
  assert.equal(typeRes.ok, true);
  assert.equal(input.value, "John Doe");

  // 3. Clear name
  const clearRes = driver.execute(BROWSER_ACTION_TYPES.CLEAR, "el_2");
  assert.equal(clearRes.ok, true);
  assert.equal(input.value, "");

  // 4. Check checkbox
  const checkRes = driver.execute(BROWSER_ACTION_TYPES.CHECK, "el_3");
  assert.equal(checkRes.ok, true);
  assert.equal(checkbox.checked, true);

  // 5. Select dropdown
  const selectRes = driver.execute(BROWSER_ACTION_TYPES.SELECT, "el_4", { value: "IN" });
  assert.equal(selectRes.ok, true);
  assert.equal(select.value, "IN");

  // 6. Press Enter
  const keyRes = driver.execute(BROWSER_ACTION_TYPES.PRESS_KEY, "el_2", { key: "Enter" });
  assert.equal(keyRes.ok, true);

  // 7. Scroll
  const scrollRes = driver.execute(BROWSER_ACTION_TYPES.SCROLL, "page_root", { direction: "down", amount: 500 });
  assert.equal(scrollRes.ok, true);
});

test("BrowserActionEngine validates dynamic element targets and blocks stale/missing targets", () => {
  const registry = createInteractiveElementRegistry();
  const validNode = new MockDomNode({ tagName: "BUTTON", id: "valid-btn" });
  registry.observeDocument({ children: [validNode] });

  const engine = new BrowserActionEngine({ simulationMode: true });
  engine.initialize();

  // Valid dynamic target el_1
  const validAction = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "el_1" },
    purpose: "LOCAL_ACTION",
    destination: "LOCAL_BROWSER"
  };
  const resValid = engine.executeAction(validAction, { pageState: { interactiveElements: [{ elementId: "el_1" }] } });
  assert.equal(resValid.ok, true);
  assert.equal(resValid.status, ACTION_RESULTS.COMPLETED);

  // Missing target el_999
  const missingAction = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "el_999" },
    purpose: "LOCAL_ACTION",
    destination: "LOCAL_BROWSER"
  };
  const resMissing = engine.executeAction(missingAction, { pageState: { interactiveElements: [{ elementId: "el_1" }] } });
  assert.equal(resMissing.ok, false);
  assert.equal(resMissing.status, ACTION_RESULTS.DENIED_TARGET_NOT_FOUND);

  // Stale target
  const staleAction = {
    actionType: BROWSER_ACTION_TYPES.CLICK,
    target: { id: "el_1", isStale: true },
    purpose: "LOCAL_ACTION",
    destination: "LOCAL_BROWSER"
  };
  const resStale = engine.executeAction(staleAction, { pageState: { isStale: true } });
  assert.equal(resStale.ok, false);
  assert.equal(resStale.status, ACTION_RESULTS.DENIED_STALE_TARGET);
});

test("BrowserAgentCoordinator halts dependent actions when a preceding action fails", async () => {
  const registry = createInteractiveElementRegistry();
  const validNode = new MockDomNode({ tagName: "INPUT", id: "search-input" });
  registry.observeDocument({ children: [validNode] });

  const mockCommClient = {
    sendSanitizedPayload: async () => ({
      ok: true,
      status: "COMPLETED",
      recommendedActions: [
        // Action 1: Fails (Target el_999 does not exist)
        {
          actionType: BROWSER_ACTION_TYPES.TYPE,
          target: { id: "el_999" },
          parameters: { text: "search query" },
          purpose: "LOCAL_ACTION",
          destination: "LOCAL_BROWSER"
        },
        // Action 2: Dependent action (Should NOT be executed)
        {
          actionType: BROWSER_ACTION_TYPES.CLICK,
          target: { id: "el_1" },
          purpose: "LOCAL_ACTION",
          destination: "LOCAL_BROWSER"
        }
      ]
    })
  };

  const coordinator = new BrowserAgentCoordinator({
    commClient: mockCommClient
  });

  const result = await coordinator.runEndToEndTask(
    { instruction: "Search for lightweight laptops and click submit" },
    {
      interactiveElements: [{ elementId: "el_1" }]
    }
  );

  // Overall workflow MUST be marked as failed / denied
  assert.equal(result.ok, false);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.DENIED);
  assert.equal(result.failedActionsCount, 2); // 1 failed + 1 not executed

  // First action failed with DENIED_TARGET_NOT_FOUND
  assert.equal(result.executionResults[0].ok, false);
  assert.equal(result.executionResults[0].status, ACTION_RESULTS.DENIED_TARGET_NOT_FOUND);

  // Second action was halted and marked NOT_EXECUTED
  assert.equal(result.executionResults[1].ok, false);
  assert.equal(result.executionResults[1].status, ACTION_RESULTS.NOT_EXECUTED);
  assert.match(result.executionResults[1].error, /dependent preceding action failed/i);
});

test("BrowserAgentCoordinator reports COMPLETED only when all required actions succeed", async () => {
  const registry = createInteractiveElementRegistry();
  const btn1 = new MockDomNode({ tagName: "INPUT", id: "name-field" });
  const btn2 = new MockDomNode({ tagName: "BUTTON", id: "submit-field" });
  registry.observeDocument({ children: [btn1, btn2] });

  const mockCommClient = {
    sendSanitizedPayload: async () => ({
      ok: true,
      status: "COMPLETED",
      recommendedActions: [
        {
          actionType: BROWSER_ACTION_TYPES.TYPE,
          target: { id: "el_1" },
          parameters: { text: "John Doe" },
          purpose: "LOCAL_ACTION",
          destination: "LOCAL_BROWSER"
        },
        {
          actionType: BROWSER_ACTION_TYPES.CLICK,
          target: { id: "el_2" },
          purpose: "LOCAL_ACTION",
          destination: "LOCAL_BROWSER"
        }
      ]
    })
  };

  const coordinator = new BrowserAgentCoordinator({
    commClient: mockCommClient
  });

  const result = await coordinator.runEndToEndTask(
    { instruction: "Enter John Doe and click Submit" },
    {
      interactiveElements: [{ elementId: "el_1" }, { elementId: "el_2" }]
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, E2E_WORKFLOW_STATUS.COMPLETED);
  assert.equal(result.successfulActionsCount, 2);
  assert.equal(result.failedActionsCount, 0);
  assert.equal(result.executionResults[0].status, ACTION_RESULTS.COMPLETED);
  assert.equal(result.executionResults[1].status, ACTION_RESULTS.COMPLETED);
});

test("DomDriver and safeClick disarm javascript:void(0) href to prevent Chrome CSP navigation violation", () => {
  const registry = createInteractiveElementRegistry();
  const jsAnchor = new MockDomNode({
    tagName: "A",
    id: "filter-link",
    attributes: { href: "javascript:void(0)" },
    textContent: "Under ₹7,000"
  });

  registry.observeDocument({ children: [jsAnchor] });

  const driver = new DomDriver({ registry });
  const clickRes = driver.execute(BROWSER_ACTION_TYPES.CLICK, "el_1");

  assert.equal(clickRes.ok, true);
  assert.equal(jsAnchor.events.some(e => e.type === "click"), true);
  // Original href was restored after the safe click disarming
  assert.equal(jsAnchor.attributes.href, "javascript:void(0)");
});
