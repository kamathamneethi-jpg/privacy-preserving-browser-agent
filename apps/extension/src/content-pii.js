// Local-only PII scanner with bounding box localization, visual webpage highlighting, and deduplication.
// It returns counts, decisions, and deduplicated localized items without raw sensitive text downstream.
(() => {
  const LIMIT = 250_000;
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
  const CARD_PATTERN = /\b(?:\d[ -]*){13,19}\b/g;

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

  function getFieldLabelText(field) {
    if (!field || typeof document === "undefined") return "";
    let labelText = "";
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape ? CSS.escape(field.id) : field.id}"]`);
      if (label) labelText += " " + label.textContent;
    }
    const parentLabel = field.closest ? field.closest("label") : null;
    if (parentLabel) labelText += " " + parentLabel.textContent;
    return labelText.trim();
  }

  function fieldDescriptorObject(field) {
    const labelText = getFieldLabelText(field);
    const ariaLabel = field.getAttribute ? (field.getAttribute("aria-label") || "") : "";
    return {
      type: field.type || "",
      autocomplete: field.autocomplete || "",
      name: field.name || "",
      id: field.id || "",
      placeholder: field.placeholder || "",
      ariaLabel,
      labelText,
      bboxInfo: getElementBoundingBoxInfo(field)
    };
  }

  function fieldCategory(field) {
    const desc = fieldDescriptorObject(field);
    const descriptor = [desc.type, desc.autocomplete, desc.name, desc.id, desc.placeholder, desc.ariaLabel, desc.labelText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (desc.type === "password" || /password|current-password|new-password/.test(descriptor)) return "password_field";
    if (desc.type === "email" || /email/.test(descriptor)) return "email_field";
    if (desc.type === "tel" || /phone|tel|mobile/.test(descriptor)) return "phone_field";
    if (/cc-number|card.?number|credit.?card/.test(descriptor)) return "payment_card_field";
    if (/one-time-code|otp|verification.?code/.test(descriptor)) return "otp";
    if (/person-name|full-name|first-name|last-name/.test(descriptor)) return "person_name";
    if (/street-address|address-line|postal-code|zip-code/.test(descriptor)) return "address";
    if (/account-id|account-number|customer-id/.test(descriptor)) return "account_identifier";
    return null;
  }

  function isElementVisible(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    if (element.checkVisibility && !element.checkVisibility()) return false;
    const style = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
      return false;
    }
    return true;
  }

  function extractValidBoundingBox(rect) {
    if (!rect) return { hasBounds: false, bbox: null };
    const width = Math.round(rect.width || 0);
    const height = Math.round(rect.height || 0);
    if (width <= 0 || height <= 0) {
      return { hasBounds: false, bbox: null };
    }
    const scrollX = typeof window !== "undefined" ? window.scrollX || 0 : 0;
    const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;
    return {
      hasBounds: true,
      bbox: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width,
        height
      }
    };
  }

  function getRangeBoundingBoxInfo(node, startOffset, length) {
    try {
      if (typeof document === "undefined" || typeof document.createRange !== "function") {
        return { hasBounds: false, bbox: null };
      }
      const parent = node.parentElement;
      if (parent && !isElementVisible(parent)) {
        return { hasBounds: false, bbox: null };
      }
      const range = document.createRange();
      range.setStart(node, startOffset);
      range.setEnd(node, Math.min(node.nodeValue ? node.nodeValue.length : startOffset, startOffset + length));
      const rect = range.getBoundingClientRect();
      const result = extractValidBoundingBox(rect);
      if (!result.hasBounds && parent && isElementVisible(parent)) {
        return extractValidBoundingBox(parent.getBoundingClientRect());
      }
      return result;
    } catch {
      return { hasBounds: false, bbox: null };
    }
  }

  function getElementBoundingBoxInfo(element) {
    try {
      if (!isElementVisible(element)) {
        return { hasBounds: false, bbox: null };
      }
      const rect = element.getBoundingClientRect();
      return extractValidBoundingBox(rect);
    } catch {
      return { hasBounds: false, bbox: null };
    }
  }

  /**
   * Cleans all visual PII highlights from the active webpage cleanly.
   */
  function clearLocalHighlights() {
    if (typeof document === "undefined") return;

    // 1. Unwrap all <mark class="privacy-agent-pii-highlight"> elements
    const marks = document.querySelectorAll("mark.privacy-agent-pii-highlight");
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    }

    // 2. Reset input/textarea highlight styles
    const inputs = document.querySelectorAll("[data-privacy-agent-highlighted='true']");
    for (const input of inputs) {
      input.removeAttribute("data-privacy-agent-highlighted");
      input.style.outline = "";
      input.style.backgroundColor = "";
    }
  }

  /**
   * Visually highlights exact detected text ranges on the live webpage.
   */
  function highlightLocalizedPiiItems(localizedItems) {
    if (typeof document === "undefined" || !Array.isArray(localizedItems)) return;

    // Clear previous highlights
    clearLocalHighlights();

    const textNodeMatchesMap = new Map();

    for (const item of localizedItems) {
      // Do not attempt to highlight detections with no valid visible bounds
      if (!item.hasBounds) continue;

      if (item.source === "dom" && item.node && item.node.nodeType === Node.TEXT_NODE) {
        if (!textNodeMatchesMap.has(item.node)) {
          textNodeMatchesMap.set(item.node, []);
        }
        textNodeMatchesMap.get(item.node).push(item);
      } else if (item.element && (item.element.tagName === "INPUT" || item.element.tagName === "TEXTAREA")) {
        item.element.setAttribute("data-privacy-agent-highlighted", "true");
        item.element.style.outline = "2px solid #eab308";
        item.element.style.backgroundColor = "#fef9c3";
      }
    }

    // Process text nodes in descending start offset order to prevent index shifting
    for (const [node, matches] of textNodeMatchesMap.entries()) {
      if (!node.parentNode || !isElementVisible(node.parentElement)) continue;

      matches.sort((a, b) => (b.start ?? 0) - (a.start ?? 0));

      for (const m of matches) {
        try {
          if (m.start === undefined || m.length === undefined) continue;
          const textLength = node.nodeValue ? node.nodeValue.length : 0;
          if (m.start < 0 || m.start + m.length > textLength) continue;

          const range = document.createRange();
          range.setStart(node, m.start);
          range.setEnd(node, m.start + m.length);

          const mark = document.createElement("mark");
          mark.className = "privacy-agent-pii-highlight";
          mark.setAttribute("data-privacy-agent-pii", m.category || "pii");
          mark.style.backgroundColor = "#fef08a";
          mark.style.color = "#854d0e";
          mark.style.fontWeight = "600";
          mark.style.borderRadius = "3px";
          mark.style.padding = "1px 3px";
          mark.style.margin = "0 1px";
          mark.style.border = "1px solid #fde047";
          mark.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";

          range.surroundContents(mark);
        } catch {
          // Ignore range wrapping errors on dynamic node mutation
        }
      }
    }
  }

  /**
   * Deduplicates PII findings by entity (category) + normalized value + DOM element identity.
   * Keeps distinct visual occurrences (different DOM elements) intact.
   * Prefers rendered/visible elements with valid bounds over zero-bounds or parent wrappers.
   */
  function deduplicateLocalizedItems(rawItems) {
    const deduplicated = [];

    for (const item of rawItems) {
      const normVal = (item.value || "").trim().toLowerCase();
      const cat = item.category;
      const elem = item.element;

      let matchIdx = -1;

      for (let i = 0; i < deduplicated.length; i++) {
        const existing = deduplicated[i];
        if (existing.category !== cat) continue;

        const existingNormVal = (existing.value || "").trim().toLowerCase();

        let sameValue = false;
        if (cat === "phone" || cat === "phone_field") {
          const d1 = normVal.replace(/\D/g, "");
          const d2 = existingNormVal.replace(/\D/g, "");
          sameValue = d1.length >= 6 && d1 === d2;
        } else {
          sameValue = normVal === existingNormVal;
        }

        if (!sameValue) continue;

        const exElem = existing.element;

        // Check DOM element identity or containment (parent/child nesting)
        const isSameOrNested =
          elem === exElem ||
          (elem && exElem && (elem.contains(exElem) || exElem.contains(elem)));

        if (isSameOrNested) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx >= 0) {
        const existing = deduplicated[matchIdx];

        // Preference rules:
        // 1. Prefer item with valid bounds over one without bounds.
        // 2. If both have bounds, prefer the rendered child DOM element.
        if (!existing.hasBounds && item.hasBounds) {
          deduplicated[matchIdx] = item;
        } else if (existing.hasBounds && item.hasBounds) {
          if (elem && existing.element && existing.element.contains(elem)) {
            deduplicated[matchIdx] = item;
          }
        }
      } else {
        deduplicated.push(item);
      }
    }

    return deduplicated.map((item, idx) => {
      const { element, node, start, length, ...cleanItem } = item;
      return {
        ...cleanItem,
        id: `PII_DOM_${idx + 1}`
      };
    });
  }

  function scanPage() {
    const rawItems = [];
    let charactersScanned = 0;
    let truncated = false;

    const walker = typeof document !== "undefined" && document.createTreeWalker
      ? document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT)
      : null;

    let node;
    while (walker && (node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(parent.tagName)) continue;
      const remaining = LIMIT - charactersScanned;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const text = node.nodeValue.slice(0, remaining);
      charactersScanned += text.length;

      const patterns = [
        { category: "email", pattern: EMAIL_PATTERN, confidence: 0.98 },
        { category: "phone", pattern: PHONE_PATTERN, confidence: 0.92 },
        { category: "payment_card", pattern: CARD_PATTERN, confidence: 0.95, predicate: passesLuhn }
      ];

      for (const { category, pattern, confidence, predicate } of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          if (!predicate || predicate(match[0])) {
            const bboxInfo = getRangeBoundingBoxInfo(node, match.index, match[0].length);
            rawItems.push({
              category,
              confidence,
              hasBounds: bboxInfo.hasBounds,
              bbox: bboxInfo.bbox,
              node,
              start: match.index,
              length: match[0].length,
              element: parent,
              source: "dom",
              placeholder: `[${category.toUpperCase()}_REDACTED]`,
              value: match[0]
            });
          }
        }
      }

      if (text.length < node.nodeValue.length) truncated = true;
    }

    if (typeof document !== "undefined" && document.querySelectorAll) {
      for (const field of document.querySelectorAll("input, textarea")) {
        const category = fieldCategory(field);
        if (category) {
          const bboxInfo = getElementBoundingBoxInfo(field);
          rawItems.push({
            category,
            confidence: 0.95,
            hasBounds: bboxInfo.hasBounds,
            bbox: bboxInfo.bbox,
            element: field,
            source: "dom",
            placeholder: `[${category.toUpperCase()}_REDACTED]`,
            value: field.value || field.placeholder || `[${category.toUpperCase()}_FIELD]`
          });
        }
      }
    }

    // Filter duplicates before highlighting or returning downstream
    const deduplicatedRawItems = [];
    for (const item of rawItems) {
      const isDup = deduplicatedRawItems.some((ex) => {
        if (ex.category !== item.category) return false;
        const v1 = (ex.value || "").trim().toLowerCase();
        const v2 = (item.value || "").trim().toLowerCase();
        if (v1 !== v2) return false;
        return ex.element === item.element || (ex.element && item.element && (ex.element.contains(item.element) || item.element.contains(ex.element)));
      });
      if (!isDup) {
        deduplicatedRawItems.push(item);
      }
    }

    // Visually highlight valid visible PII text ranges directly on the active webpage
    highlightLocalizedPiiItems(deduplicatedRawItems);

    const localizedItems = deduplicateLocalizedItems(deduplicatedRawItems);

    const counts = {};
    for (const item of localizedItems) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }

    const redactDecision = globalThis.PrivacyPolicy && typeof globalThis.PrivacyPolicy.redactSensitiveFinding === "function"
      ? globalThis.PrivacyPolicy.redactSensitiveFinding()
      : "REDACT";

    const categories = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({ category, count, decision: redactDecision }));

    return {
      totalFindings: localizedItems.length,
      categories,
      localizedItems,
      truncated
    };
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SCAN_LOCAL_PII" || message?.type === "DETECT_AND_LOCALIZE_PAGE_PII") {
        try {
          const summary = scanPage();
          sendResponse({ ok: true, summary });
        } catch (err) {
          sendResponse({ ok: false, error: err.message || "Failed to scan page PII." });
        }
        return true;
      } else if (message?.type === "CLEAR_LOCAL_HIGHLIGHTS") {
        try {
          clearLocalHighlights();
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return true;
      } else if (message?.type === "HIGHLIGHT_LOCAL_PII") {
        try {
          const summary = scanPage();
          sendResponse({ ok: true, summary });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return true;
      }
    });
  }

  if (typeof globalThis !== "undefined") {
    globalThis.scanLocalPiiPage = scanPage;
    globalThis.clearLocalHighlights = clearLocalHighlights;
  }
})();
