// Local-only PII scanner with bounding box localization and multi-signal semantic inspection.
// It returns counts, decisions, and fused localized items without raw sensitive text.
(() => {
  const LIMIT = 250_000;
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
  const CARD_PATTERN = /(?:\d[ -]*?){13,19}/g;

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
    const parentLabel = field.closest("label");
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
      bbox: getElementBoundingBox(field)
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

  function getRangeBoundingBox(node, startOffset, length) {
    try {
      if (typeof document === "undefined" || typeof document.createRange !== "function") {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      const range = document.createRange();
      range.setStart(node, startOffset);
      range.setEnd(node, Math.min(node.nodeValue ? node.nodeValue.length : startOffset, startOffset + length));
      const rect = range.getBoundingClientRect();
      const scrollX = typeof window !== "undefined" ? window.scrollX || 0 : 0;
      const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;
      return {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    } catch {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  function getElementBoundingBox(element) {
    try {
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      const rect = element.getBoundingClientRect();
      const scrollX = typeof window !== "undefined" ? window.scrollX || 0 : 0;
      const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;
      return {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    } catch {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  function scanPage() {
    const counts = {
      email: 0,
      phone: 0,
      payment_card: 0,
      password_field: 0,
      email_field: 0,
      phone_field: 0,
      payment_card_field: 0,
      person_name: 0,
      address: 0,
      account_identifier: 0,
      otp: 0
    };

    const localizedItems = [];
    let charactersScanned = 0;
    let truncated = false;
    let itemIdCounter = 0;

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
            counts[category] = (counts[category] || 0) + 1;
            itemIdCounter += 1;
            const bbox = getRangeBoundingBox(node, match.index, match[0].length);
            localizedItems.push({
              id: `PII_DOM_${itemIdCounter}`,
              category,
              confidence,
              bbox,
              source: "dom",
              placeholder: `[${category.toUpperCase()}_REDACTED]`
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
          counts[category] = (counts[category] || 0) + 1;
          itemIdCounter += 1;
          const bbox = getElementBoundingBox(field);
          localizedItems.push({
            id: `PII_DOM_${itemIdCounter}`,
            category,
            confidence: 0.95,
            bbox,
            source: "dom",
            placeholder: `[${category.toUpperCase()}_REDACTED]`
          });
        }
      }
    }

    const redactDecision = globalThis.PrivacyPolicy && typeof globalThis.PrivacyPolicy.redactSensitiveFinding === "function"
      ? globalThis.PrivacyPolicy.redactSensitiveFinding()
      : "REDACT";

    const categories = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({ category, count, decision: redactDecision }));

    return {
      totalFindings: categories.reduce((total, item) => total + item.count, 0),
      categories,
      localizedItems,
      truncated
    };
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SCAN_LOCAL_PII") sendResponse({ ok: true, summary: scanPage() });
    });
  }

  if (typeof globalThis !== "undefined") {
    globalThis.scanLocalPiiPage = scanPage;
  }
})();
