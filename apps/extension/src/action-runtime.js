/**
 * Local Browser Action Runtime & Interactive Element Registry for Chrome Extension (Step 14).
 * Discovers generic interactive elements dynamically (el_1, el_2, ...), validates connectivity,
 * and executes validated local DOM actions on-device.
 *
 * Security Invariants:
 * 1. Zero network egress: Performs only local DOM mutations.
 * 2. Protocol enforcement: Navigation is restricted to safe protocols (http:, https:) and forbids javascript:, data:, file:.
 * 3. Secret hygiene: Injected vault secrets are placed directly into field values and immediately discarded from memory.
 * 4. Stale protection: Checks element.isConnected before executing actions.
 */
(() => {
  const FORBIDDEN_PROTOCOLS = ["javascript:", "data:", "file:", "blob:", "about:"];
  const PERMITTED_PROTOCOLS = ["http:", "https:"];

  const snapshotRegistry = {
    snapshotId: null,
    elements: new Map(), // elementId -> DOM Element
    descriptions: []
  };

  /**
   * Scans document for interactive elements and registers them with temporary snapshot IDs.
   *
   * @returns {object} { snapshotId: string, interactiveElements: Array<object>, pageTitle: string, url: string }
   */
  function observeInteractiveDom() {
    snapshotRegistry.elements.clear();
    snapshotRegistry.descriptions = [];
    const timestamp = Date.now();
    snapshotRegistry.snapshotId = `snap_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

    const selector = [
      "button",
      "a[href]",
      "input",
      "textarea",
      "select",
      "summary",
      "label",
      "[role='button']",
      "[role='link']",
      "[role='textbox']",
      "[role='searchbox']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='combobox']",
      "[role='option']",
      "[role='tab']",
      "[role='menuitem']",
      "[role='switch']",
      "[tabindex='0']",
      "[contenteditable='true']",
      "li[id^='p_'] a",
      ".a-checkbox-label",
      ".s-navigation-item"
    ].join(", ");

    let rawElements = [];
    try {
      rawElements = Array.from(document.querySelectorAll(selector));
    } catch {
      rawElements = [];
    }

    let idCounter = 1;
    for (const el of rawElements) {
      if (!el) continue;

      const tag = String(el.tagName || "").toLowerCase();
      const type = el.getAttribute("type") || (tag === "input" ? "text" : null);
      const lowerType = String(type || "").toLowerCase();

      // Filter out hidden elements, unless it's a styled checkbox/radio input
      try {
        const style = window.getComputedStyle(el);
        if ((style.display === "none" || style.visibility === "hidden") && lowerType !== "checkbox" && lowerType !== "radio") {
          continue;
        }
      } catch {}

      const elementId = `el_${idCounter++}`;
      const role = el.getAttribute("role") || null;
      const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || null;
      const placeholder = el.getAttribute("placeholder") || null;
      const name = el.getAttribute("name") || null;
      const disabled = Boolean(el.disabled || el.getAttribute("disabled") !== null);

      let text = "";
      if (tag === "input" || tag === "textarea") {
        if (type === "button" || type === "submit" || type === "reset") {
          text = el.value || el.getAttribute("value") || el.getAttribute("aria-label") || el.getAttribute("title") || "";
          if (!text && typeof el.closest === "function") {
            const btnWrapper = el.closest("span.a-button, button, form, div");
            if (btnWrapper) text = btnWrapper.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
          }
        } else if (lowerType === "checkbox" || lowerType === "radio") {
          if (el.labels && el.labels.length > 0) {
            text = Array.from(el.labels).map(l => l.textContent).join(" ").replace(/\s+/g, " ").trim();
          } else if (typeof el.closest === "function") {
            const parent = el.closest("label") || el.closest("li") || el.parentElement;
            if (parent) text = parent.textContent.replace(/\s+/g, " ").trim().slice(0, 100);
          }
        }
      } else {
        text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      }

      // Fallback text from img alt or title/aria-label if link/button has no visible text
      if (!text) {
        if (ariaLabel) {
          text = ariaLabel;
        } else if (el.getAttribute("title")) {
          text = el.getAttribute("title");
        } else if (typeof el.querySelector === "function") {
          const img = el.querySelector("img");
          if (img && img.alt) {
            text = img.alt.replace(/\s+/g, " ").trim().slice(0, 120);
          }
        }
      }

      // Safe value extraction: Never expose password values
      let value = null;
      if (lowerType !== "password" && (tag === "select" || tag === "option" || lowerType === "checkbox" || lowerType === "radio")) {
        value = el.value ? String(el.value).slice(0, 80) : null;
      }

      const checked = typeof el.checked === "boolean" ? el.checked : (el.getAttribute("checked") !== null ? true : undefined);

      let bbox = null;
      try {
        const rect = el.getBoundingClientRect();
        bbox = {
          x: Math.round(rect.x || rect.left || 0),
          y: Math.round(rect.y || rect.top || 0),
          width: Math.round(rect.width || 0),
          height: Math.round(rect.height || 0)
        };
      } catch {}

      // Skip elements that are completely non-rendered or zero-size (except inputs/checkboxes)
      if (bbox && bbox.width <= 0 && bbox.height <= 0 && tag !== "input" && tag !== "select" && lowerType !== "checkbox" && lowerType !== "radio") {
        continue;
      }

      // Detect Ads and Sponsored elements
      let isSponsored = false;
      try {
        if (typeof el.closest === "function") {
          const adContainer = el.closest(
            '[data-component-type="sp-sponsored-result"], ' +
            '[data-component-type="sbv-video-single-product"], ' +
            '[data-ad-preview], [data-ad-id], [data-ad-slot], [data-ad-details], ' +
            '.s-sponsored-label-info-icon, .puis-sponsored-label-text, .s-sponsored-info-icon, ' +
            '[class*="sponsored" i], [id*="sponsored" i], [class*="ad-container" i], ' +
            'div[data-cel-widget*="sponsored" i], div[data-cel-widget*="sp_" i]'
          );
          if (adContainer) isSponsored = true;
        }
      } catch {}

      const fullText = `${text || ""} ${ariaLabel || ""} ${el.getAttribute("title") || ""}`;
      if (!isSponsored && /\b(sponsored|advertisement|ad feedback|promoted|ad by)\b/i.test(fullText)) {
        isSponsored = true;
      }

      // Detect Filter / Refinements / Facets Navigation
      let isFilter = false;
      let filterCategory = null;
      try {
        if (typeof el.closest === "function") {
          const filterContainer = el.closest(
            '#s-refinements, #filters, #refinements, .s-navigation-left, aside, nav#filters, ' +
            '[data-component-type="s-refinements-left-nav"], [aria-label*="refine" i], [aria-label*="filter" i], ' +
            '[id*="refinement"], [class*="refinement"], [class*="filter-container"], [class*="filter-group"], ' +
            'li[id^="p_"], .s-navigation-item'
          );
          if (filterContainer) {
            isFilter = true;
            const section = el.closest('div[id^="p_"], div.a-section, li[id^="p_"]');
            const sectionText = section ? (section.querySelector('span.a-text-bold, h4, h3, span[class*="heading"]')?.textContent || "") : "";
            const lowerSec = sectionText.toLowerCase();
            if (/price|₹|\$|eur|gbp/i.test(lowerSec) || (section && /p_36/i.test(section.id || ""))) {
              filterCategory = "price";
            } else if (/brand/i.test(lowerSec) || (section && /p_89/i.test(section.id || ""))) {
              filterCategory = "brand";
            } else if (/colou?r/i.test(lowerSec)) {
              filterCategory = "color";
            } else if (/size/i.test(lowerSec)) {
              filterCategory = "size";
            }
          }
        }
      } catch {}

      if (lowerType === "checkbox" || role === "checkbox") {
        isFilter = true;
      }

      // Detect Price Specific Controls
      let isMaxPriceInput = false;
      let isMinPriceInput = false;
      let isPriceGoButton = false;

      const lowerName = (name || "").toLowerCase();
      const lowerId = (el.id || "").toLowerCase();
      const lowerPlaceholder = (placeholder || "").toLowerCase();
      const lowerAria = (ariaLabel || "").toLowerCase();

      if (tag === "input" && (lowerType === "text" || lowerType === "number")) {
        if (lowerId === "high-price" || lowerName === "high-price" || lowerPlaceholder === "max" || /max-?price/i.test(lowerName) || /max.*price/i.test(lowerAria)) {
          isMaxPriceInput = true;
          isFilter = true;
          filterCategory = "price";
        } else if (lowerId === "low-price" || lowerName === "low-price" || lowerPlaceholder === "min" || /min-?price/i.test(lowerName) || /min.*price/i.test(lowerAria)) {
          isMinPriceInput = true;
          isFilter = true;
          filterCategory = "price";
        }
      }

      if ((tag === "input" && lowerType === "submit") || tag === "button") {
        const isGo = /^(?:go|apply|submit)$/i.test(text || el.value || "");
        if (isGo && (isFilter || filterCategory === "price" || el.closest('form[action*="s"], form[id*="price"]'))) {
          isPriceGoButton = true;
          isFilter = true;
          filterCategory = "price";
        }
      }

      // Detect Organic Search Result Product Cards
      let isProductResult = false;
      try {
        if (!isSponsored && typeof el.closest === "function") {
          const prodCard = el.closest('[data-component-type="s-search-result"], .s-result-item[data-asin]');
          if (prodCard && prodCard.getAttribute("data-asin")) {
            isProductResult = true;
          }
        }
      } catch {}

      const desc = {
        elementId,
        tag,
        role: role || (tag === "button" || lowerType === "submit" || lowerType === "button" ? "button" : (tag === "a" ? "link" : (tag === "input" ? (lowerType === "checkbox" ? "checkbox" : (lowerType === "radio" ? "radio" : "textbox")) : (tag === "label" ? "label" : null)))),
        text: text || null,
        ariaLabel: ariaLabel || null,
        placeholder: placeholder || null,
        name: name || null,
        type: type || null,
        value: value || null,
        checked,
        disabled,
        ...(bbox ? { bbox } : {}),
        ...(isSponsored ? { isSponsored: true, isAd: true } : {}),
        ...(isFilter ? { isFilter: true } : {}),
        ...(filterCategory ? { filterCategory } : {}),
        ...(isMaxPriceInput ? { isMaxPriceInput: true } : {}),
        ...(isMinPriceInput ? { isMinPriceInput: true } : {}),
        ...(isPriceGoButton ? { isPriceGoButton: true } : {}),
        ...(isProductResult ? { isProductResult: true } : {})
      };

      snapshotRegistry.elements.set(elementId, el);
      if (el.id) snapshotRegistry.elements.set(el.id, el);

      snapshotRegistry.descriptions.push(desc);
    }

    return {
      ok: true,
      snapshotId: snapshotRegistry.snapshotId,
      interactiveElements: [...snapshotRegistry.descriptions],
      pageTitle: document.title || "",
      url: location.href || ""
    };
  }

  /**
   * Resolves a DOM element within the active document safely.
   *
   * @param {string|Element} target
   * @returns {object} { element: Element|null, isStale: boolean, isConnected: boolean }
   */
  function resolveElement(target) {
    if (!target) return { element: null, isStale: false, isConnected: false };
    if (typeof Element !== "undefined" && target instanceof Element) {
      const isConnected = target.isConnected !== false;
      return { element: target, isStale: !isConnected, isConnected };
    }
    if (typeof target !== "string") return { element: null, isStale: false, isConnected: false };

    // 1. Snapshot Map Lookup (el_1, el_2, ...)
    if (snapshotRegistry.elements.has(target)) {
      const el = snapshotRegistry.elements.get(target);
      const isConnected = el && el.isConnected !== false;
      return { element: el, isStale: !isConnected, isConnected };
    }

    // 2. Direct ID
    const byId = document.getElementById(target);
    if (byId) {
      const isConnected = byId.isConnected !== false;
      return { element: byId, isStale: !isConnected, isConnected };
    }

    // 3. Safe attribute lookup
    try {
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(target)
        : target.replace(/["\\]/g, "\\$&");

      const byAttr = document.querySelector(`[data-testid="${escaped}"], [data-id="${escaped}"], [name="${escaped}"]`);
      if (byAttr) {
        return { element: byAttr, isStale: byAttr.isConnected === false, isConnected: byAttr.isConnected !== false };
      }

      if (!/[<>()\[\]'"`=]/.test(target)) {
        const byQuery = document.querySelector(`#${escaped}`);
        if (byQuery) {
          return { element: byQuery, isStale: byQuery.isConnected === false, isConnected: byQuery.isConnected !== false };
        }
      }
    } catch {
      // Ignore syntax errors
    }

    return { element: null, isStale: false, isConnected: false };
  }

  function performClick(target) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      if (typeof element.focus === "function") element.focus();

      const tag = String(element.tagName || "").toLowerCase();
      const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();

      // If it's a checkbox or radio input
      if (tag === "input" && (type === "checkbox" || type === "radio")) {
        element.checked = type === "radio" ? true : !element.checked;
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));

        // Trigger parent label or link if styled externally (e.g. Amazon filter)
        const parentLink = element.closest("a, label, li");
        if (parentLink && parentLink !== element) {
          parentLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
        return true;
      }

      // If clicking a label, toggle its associated input
      if (tag === "label") {
        const input = element.querySelector("input") || (element.htmlFor ? document.getElementById(element.htmlFor) : null);
        if (input && (input.type === "checkbox" || input.type === "radio")) {
          input.checked = input.type === "radio" ? true : !input.checked;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      // Standard click
      if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  function performInput(target, textValue) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected || typeof textValue !== "string") return false;
    try {
      element.focus();
      element.value = textValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function performClear(target) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      element.focus();
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function performCheck(target) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      if (typeof element.focus === "function") element.focus();

      const input = (element.tagName === "INPUT") ? element : (element.querySelector?.("input") || element);
      if (input && typeof input.checked !== "undefined") {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const parentLink = element.closest?.("a, li");
      if (parentLink && parentLink !== element) {
        parentLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  function performUncheck(target) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      if (typeof element.focus === "function") element.focus();

      const input = (element.tagName === "INPUT") ? element : (element.querySelector?.("input") || element);
      if (input && typeof input.checked !== "undefined") {
        input.checked = false;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const parentLink = element.closest?.("a, li");
      if (parentLink && parentLink !== element) {
        parentLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  function performPressKey(target, key = "Enter") {
    const { element } = resolveElement(target);
    const targetEl = element || document.activeElement || document.body;
    if (!targetEl) return false;
    try {
      const keyCode = key === "Enter" ? 13 : (key === "Tab" ? 9 : (key === "Escape" ? 27 : 0));
      targetEl.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, keyCode, bubbles: true, cancelable: true }));
      targetEl.dispatchEvent(new KeyboardEvent("keypress", { key, code: key, keyCode, bubbles: true, cancelable: true }));
      targetEl.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, keyCode, bubbles: true, cancelable: true }));

      if (key === "Enter" && (targetEl.tagName === "INPUT" || targetEl.tagName === "BUTTON")) {
        const form = targetEl.form || targetEl.closest?.("form");
        if (form && typeof form.requestSubmit === "function") {
          try {
            form.requestSubmit();
          } catch {
            const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], .a-button-input');
            if (submitBtn) submitBtn.click();
            else if (typeof form.submit === "function") form.submit();
          }
        } else if (form) {
          const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], .a-button-input');
          if (submitBtn) submitBtn.click();
          else if (typeof form.submit === "function") form.submit();
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  function performFill(target, secretValue) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected || typeof secretValue !== "string") return false;
    try {
      element.value = secretValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function performSelect(target, value) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      const val = value || "";
      if (element.tagName === "SELECT" && element.options) {
        const match = Array.from(element.options).find(opt =>
          opt.value === val || opt.textContent?.trim().toLowerCase() === String(val).trim().toLowerCase()
        );
        if (match) {
          element.value = match.value;
        } else {
          element.value = val;
        }
      } else {
        element.value = val;
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function performSubmit(target) {
    const { element, isStale, isConnected } = resolveElement(target);
    if (!element || isStale || !isConnected) return false;
    try {
      if (typeof element.requestSubmit === "function") {
        element.requestSubmit();
      } else if (typeof element.submit === "function") {
        element.submit();
      } else if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  function performScroll(scrollX = 0, scrollY = 0, target = null, direction = null, amount = 500) {
    try {
      if (direction === "down") scrollY = amount;
      else if (direction === "up") scrollY = -amount;

      if (target && target !== "window" && target !== "document" && target !== "page_root") {
        const { element } = resolveElement(target);
        if (element && typeof element.scrollBy === "function") {
          element.scrollBy({ left: scrollX, top: scrollY, behavior: "smooth" });
          return true;
        }
      }
      if (typeof window !== "undefined" && typeof window.scrollBy === "function") {
        window.scrollBy({ left: scrollX, top: scrollY, behavior: "smooth" });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function performGoBack() {
    try {
      if (typeof window !== "undefined" && window.history && typeof window.history.back === "function") {
        window.history.back();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function performNavigate(urlString) {
    if (typeof urlString !== "string" || !urlString.trim()) return false;
    const lower = urlString.trim().toLowerCase();

    for (const forbidden of FORBIDDEN_PROTOCOLS) {
      if (lower.startsWith(forbidden)) return false;
    }

    try {
      const parsed = new URL(urlString);
      if (!PERMITTED_PROTOCOLS.includes(parsed.protocol)) return false;

      if (typeof window !== "undefined") {
        window.location.href = urlString;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Master dispatcher for action execution.
   */
  function executeAction(actionType, targetId, parameters = {}, secretValue = null) {
    try {
      const resolved = resolveElement(targetId);
      const isGlobalTarget = ["window", "document", "page_root"].includes(targetId) || actionType === "GO_BACK" || actionType === "WAIT" || actionType === "NAVIGATE";

      if (!isGlobalTarget) {
        if (!resolved.element) {
          return { ok: false, status: "DENIED_TARGET_NOT_FOUND", actionType, targetId, error: `Target element '${targetId}' not found in current DOM snapshot.` };
        }
        if (resolved.isStale || !resolved.isConnected) {
          return { ok: false, status: "DENIED_STALE_TARGET", actionType, targetId, error: `Target element '${targetId}' is disconnected or stale.` };
        }
      }

      switch (actionType) {
        case "CLICK": {
          const ok = performClick(targetId);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' click failed.` };
        }
        case "TYPE": {
          const text = typeof parameters.text === "string" ? parameters.text : (parameters.value || "");
          const ok = performInput(targetId, text);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' input failed.` };
        }
        case "CLEAR": {
          const ok = performClear(targetId);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' clear failed.` };
        }
        case "CHECK": {
          const ok = performCheck(targetId);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' check failed.` };
        }
        case "UNCHECK": {
          const ok = performUncheck(targetId);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' uncheck failed.` };
        }
        case "PRESS_KEY": {
          const key = parameters.key || "Enter";
          const ok = performPressKey(targetId, key);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Press key '${key}' failed.` };
        }
        case "SELECT": {
          const val = parameters.value || parameters.option || "";
          const ok = performSelect(targetId, val);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' select failed.` };
        }
        case "FILL": {
          const val = typeof secretValue === "string" ? secretValue : (parameters.value || "");
          const ok = performFill(targetId, val);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' fill failed.` };
        }
        case "SUBMIT": {
          const ok = performSubmit(targetId);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : `Target '${targetId}' submit failed.` };
        }
        case "SCROLL": {
          const scrollX = Number(parameters.scrollX) || 0;
          const scrollY = Number(parameters.scrollY) || 0;
          const ok = performScroll(scrollX, scrollY, targetId, parameters.direction, parameters.amount);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : "Scroll execution failed." };
        }
        case "GO_BACK": {
          const ok = performGoBack();
          return { ok, status: "COMPLETED", actionType, targetId: "window" };
        }
        case "WAIT": {
          return { ok: true, status: "COMPLETED", actionType, targetId };
        }
        case "NAVIGATE": {
          const url = parameters.url || targetId;
          const ok = performNavigate(url);
          return { ok, status: ok ? "COMPLETED" : "FAILED_EXECUTION", actionType, targetId, error: ok ? undefined : "Navigation failed: forbidden or invalid URL." };
        }
        default:
          return { ok: false, status: "DENIED_INVALID_ACTION", actionType, targetId, error: `Unsupported action type: ${actionType}` };
      }
    } catch (err) {
      return { ok: false, status: "ERROR", actionType, targetId, error: err.message || "Action execution error." };
    }
  }

  // Extension runtime message listener
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "OBSERVE_INTERACTIVE_DOM") {
        const observation = observeInteractiveDom();
        sendResponse(observation);
        return true;
      }
      if (message?.type === "EXECUTE_BROWSER_ACTION") {
        const { actionType, targetId, parameters, secretValue } = message;
        const result = executeAction(actionType, targetId, parameters, secretValue);
        sendResponse(result);
        return true;
      }
    });
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ActionRuntime = Object.freeze({
      observeInteractiveDom,
      resolveElement,
      performClick,
      performInput,
      performClear,
      performCheck,
      performUncheck,
      performPressKey,
      performSelect,
      performSubmit,
      performScroll,
      performGoBack,
      performFill,
      performNavigate,
      executeAction
    });
  }
})();
