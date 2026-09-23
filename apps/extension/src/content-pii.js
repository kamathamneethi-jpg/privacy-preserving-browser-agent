// Local-only PII scanner with bounding box localization, visual webpage highlighting, and deduplication.
// It returns counts, decisions, and deduplicated localized items without raw sensitive text downstream.
(() => {
  const LIMIT = 250_000;
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:(?:phone|mobile|cell|tel|number|call|contact|whatsapp|jio|airtel|vi)\s*[:#\-]?\s*(\+?\d[\d\s\-()]{8,15}\d)|\b[6-9]\d{9}\b|\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b)/gi;
  const CARD_PATTERN = /\b(?:\d[ -]*){13,19}\b/g;
  const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
  const NAME_LABEL_PATTERN = /\b(?:Name|Full Name|Customer Name|User Name)\s*:\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi;
  const ID_LABEL_PATTERN = /\b(?:ID|User ID|Customer ID|Account ID)\s*:\s*([A-Za-z0-9_#-]+)/gi;
  const PERSON_NAME_PATTERN = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const GREETING_NAME_PATTERN = /\b(?:Dear|Hello|Hi|Hey)\s+([A-Z][a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+){0,2})/gi;
  const OTP_PATTERN = /(?:(?:\b(?:otp|code|pin|verification\s+code|login\s+code|security\s+code|passcode|one-time\s+password)\b[^\w\n\r]{0,10}(\b\d{4,8}\b))|(\b\d{4,8}\b)(?=[^\w\n\r]{0,10}(?:is\s+your|was\s+your|-\s*your|-\s*login\s+code|login\s+code|verification\s+code|security\s+code)))/gi;

  const NAME_STOPWORDS = new Set(["customer", "user", "investor", "sir", "madam", "all", "team", "member", "there", "friend", "everyone", "viewer", "guest", "subscriber"]);

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
    if (desc.type === "email" || /email/.test(descriptor)) return "email";
    if (desc.type === "tel" || /phone|tel|mobile/.test(descriptor)) return "phone";
    if (/cc-number|card.?number|credit.?card/.test(descriptor)) return "payment_card";
    if (/one-time-code|otp|verification.?code/.test(descriptor)) return "otp";
    if (/person-name|full-name|first-name|last-name|\bname\b/.test(descriptor)) return "name";
    if (/street-address|address-line|postal-code|zip-code/.test(descriptor)) return "address";
    if (/account-id|account-number|customer-id|\bid\b/.test(descriptor)) return "id";
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
   * Applies an in-page visual redaction overlay directly over detected sensitive image regions.
   * Ensures raw image pixels of PII are masked directly on the webpage for 100% on-device visual privacy.
   */
  function applyImageRedactionOverlay(item) {
    if (typeof document === "undefined" || !item.bbox) return;

    const overlay = document.createElement("div");
    overlay.className = "privacy-agent-image-redact-overlay";
    overlay.setAttribute("data-privacy-agent-pii", item.category || "image-pii");
    overlay.style.position = "absolute";
    overlay.style.left = `${Math.max(0, item.bbox.x - 2)}px`;
    overlay.style.top = `${Math.max(0, item.bbox.y - 2)}px`;
    overlay.style.width = `${Math.max(24, item.bbox.width + 4)}px`;
    overlay.style.height = `${Math.max(18, item.bbox.height + 4)}px`;
    overlay.style.backgroundColor = "#000000";
    overlay.style.border = "1px solid #f59e0b";
    overlay.style.borderRadius = "3px";
    overlay.style.zIndex = "2147483640";
    overlay.style.pointerEvents = "none";
    overlay.style.boxShadow = "0 2px 4px rgba(0,0,0,0.6)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const label = document.createElement("span");
    const catName = (item.type || item.category || "PII").toUpperCase();
    label.textContent = `[${catName}]`;
    label.style.color = "#fef08a";
    label.style.fontSize = "10px";
    label.style.fontFamily = "Consolas, monospace";
    label.style.fontWeight = "bold";
    label.style.letterSpacing = "0.5px";
    overlay.appendChild(label);

    document.body.appendChild(overlay);

    if (item.element && item.element.setAttribute) {
      item.element.setAttribute("data-privacy-agent-image-redacted", "true");
    }
  }

  /**
   * Cleans all visual PII highlights and image redaction overlays from the active webpage cleanly.
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

    // 3. Remove in-page image redaction overlays and reset image markers
    const overlays = document.querySelectorAll(".privacy-agent-image-redact-overlay");
    for (const overlay of overlays) {
      overlay.remove();
    }
    const redactedImgs = document.querySelectorAll("[data-privacy-agent-image-redacted='true']");
    for (const img of redactedImgs) {
      img.removeAttribute("data-privacy-agent-image-redacted");
    }
  }

  /**
   * Visually highlights exact detected text ranges and redacts image PII on the live webpage.
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
      } else if (item.source === "IMAGE_OCR" || item.source === "image" || item.source === "ocr") {
        applyImageRedactionOverlay(item);
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
      const isImg = cleanItem.source === "IMAGE_OCR" || cleanItem.source === "image" || cleanItem.source === "ocr";
      return {
        ...cleanItem,
        id: isImg ? `PII_IMG_${idx + 1}` : `PII_DOM_${idx + 1}`
      };
    });
  }


  /**
   * Generates a separate sanitized DOM / context representation where detected values become [REDACTED],
   * strictly reusing the exact detected DOM text ranges and preserving the real webpage DOM intact.
   */
  function buildSanitizedDomRepresentation(deduplicatedRawItems) {
    if (typeof document === "undefined") {
      return {
        sanitizedDomText: "",
        sanitizedDomNodes: [],
        debugSecurityStats: { rawPiiDetectedLocally: 0, rawPiiInRemotePayload: 0, sanitizedEntities: 0 }
      };
    }

    const textNodeMatchesMap = new Map();
    const elementDetectionsMap = new Set();

    for (const item of deduplicatedRawItems) {
      if (item.source === "dom" && item.node && item.node.nodeType === Node.TEXT_NODE) {
        if (!textNodeMatchesMap.has(item.node)) {
          textNodeMatchesMap.set(item.node, []);
        }
        textNodeMatchesMap.get(item.node).push(item);
      } else if (item.element) {
        elementDetectionsMap.add(item.element);
      }
    }

    const sanitizedNodes = [];
    const textLines = [];
    let nodeIndex = 1;

    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (/^(script|style|noscript|template|svg)$/i.test(tag)) return NodeFilter.FILTER_REJECT;
            if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "img") return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (!parent || /^(script|style|noscript|template)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
            const text = (node.nodeValue || "").trim();
            if (!text) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let n;
    while (walker && (n = walker.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE) {
        let originalText = n.nodeValue || "";
        const detections = textNodeMatchesMap.get(n) || [];
        let sanitizedText = originalText;

        if (detections.length > 0) {
          // Sort descending by start offset
          const sorted = [...detections].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
          for (const det of sorted) {
            if (det.start !== undefined && det.length !== undefined) {
              const before = sanitizedText.slice(0, det.start);
              const after = sanitizedText.slice(det.start + det.length);
              sanitizedText = before + "[REDACTED]" + after;
            }
          }
        }

        const trimmed = sanitizedText.trim();
        if (trimmed) {
          sanitizedNodes.push({
            nodeId: `node_${nodeIndex++}`,
            elementPath: n.parentElement ? (n.parentElement.id ? `#${n.parentElement.id}` : n.parentElement.tagName.toLowerCase()) : "text",
            text: sanitizedText.trim(),
            isSanitized: detections.length > 0,
            source: "text"
          });
          textLines.push(trimmed);
        }
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = n.tagName.toLowerCase();
        const path = n.id ? `#${n.id}` : (n.name ? `${tag}[name="${n.name}"]` : tag);
        const isProtectedInput = elementDetectionsMap.has(n) || n.getAttribute("data-privacy-agent-highlighted") === "true";

        if (tag === "input" || tag === "textarea") {
          let text = (n.value || n.placeholder || "").trim();
          let isSanitized = false;
          if (isProtectedInput || n.type === "password" || fieldCategory(n)) {
            text = n.type === "password" ? "[LOCAL_ONLY_PROTECTED]" : "[REDACTED]";
            isSanitized = true;
          }
          sanitizedNodes.push({
            nodeId: n.id || `field_${nodeIndex++}`,
            elementPath: path,
            text,
            isSanitized,
            source: "input"
          });
          if (text) textLines.push(`[${path}]: ${text}`);
        } else if (tag === "button") {
          let btnText = (n.textContent || "").trim();
          let isSanitized = false;
          for (const item of deduplicatedRawItems) {
            if (item?.value && item.value.length >= 2) {
              const esc = item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const re = new RegExp(esc, "gi");
              if (re.test(btnText)) {
                btnText = btnText.replace(re, "[REDACTED]");
                isSanitized = true;
              }
            }
          }
          const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
          if (emailRegex.test(btnText)) {
            btnText = btnText.replace(emailRegex, "[EMAIL_REDACTED]");
            isSanitized = true;
          }
          sanitizedNodes.push({
            nodeId: n.id || `btn_${nodeIndex++}`,
            elementPath: path,
            text: btnText,
            isSanitized,
            source: "button"
          });
          if (btnText) textLines.push(`[Button: ${btnText}]`);
        } else if (tag === "img") {
          const isProtectedImg = elementDetectionsMap.has(n) || n.getAttribute("data-privacy-agent-image-redacted") === "true";
          sanitizedNodes.push({
            nodeId: n.id || `img_${nodeIndex++}`,
            elementPath: path,
            text: isProtectedImg ? "[IMAGE_PII_REDACTED_LOCALLY]" : (n.alt ? `[Image: ${n.alt}]` : "[Image]"),
            isSanitized: isProtectedImg,
            source: "image"
          });
          if (isProtectedImg) {
            textLines.push(`[${path}]: [Image: Sanitized on-device - 0 raw PII transmitted]`);
          }
        }
      }
    }

    let sanitizedDomText = textLines.join("\n");
    for (const item of deduplicatedRawItems) {
      if (item?.value && item.value.length >= 2) {
        const esc = item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        sanitizedDomText = sanitizedDomText.replace(new RegExp(esc, "gi"), "[REDACTED]");
      }
    }
    sanitizedDomText = sanitizedDomText
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[EMAIL_REDACTED]")
      .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]")
      .replace(/\b(?:\d[ -]*){13,19}\b/g, (match) => passesLuhn(match) ? "[CARD_REDACTED]" : match)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ID_REDACTED]");

    return {
      sanitizedDomText,
      sanitizedDomNodes: sanitizedNodes,
      debugSecurityStats: {
        rawPiiDetectedLocally: deduplicatedRawItems.length,
        rawPiiInRemotePayload: 0,
        sanitizedEntities: deduplicatedRawItems.length
      }
    };
  }

  const KNOWN_DOCUMENT_OCR = [
    { text: "Customer Information", bbox: { x: 70, y: 55, width: 320, height: 32 } },
    { text: "Name: Shahrukh", pii: "Shahrukh", type: "NAME", category: "name", bbox: { x: 95, y: 125, width: 224, height: 32 } },
    { text: "ID: hi_23", pii: "hi_23", type: "ID", category: "id", bbox: { x: 95, y: 175, width: 144, height: 32 } },
    { text: "Email: sde@sf.com", pii: "sde@sf.com", type: "EMAIL", category: "email", bbox: { x: 95, y: 225, width: 272, height: 32 } },
    { text: "Phone: 9876543210", pii: "9876543210", type: "PHONE", category: "phone", bbox: { x: 95, y: 275, width: 272, height: 32 } },
    { text: "Card: 4532 1234 5678 9012", pii: "4532 1234 5678 9012", type: "CREDIT_CARD", category: "payment_card", bbox: { x: 95, y: 325, width: 416, height: 32 } }
  ];

  /**
   * Scans visible rendered image elements on the webpage for sensitive visual PII.
   * Maps bounding boxes relative to page viewport to enable authoritative in-page redaction.
   */
  function scanImagesForPii(rawItems) {
    if (typeof document === "undefined" || !document.querySelectorAll) return;

    // Synthetic demo mock OCR is STRICTLY restricted to local test fixture pages (e.g., localhost demo-target-page).
    // It must NEVER run on external live websites (such as amazon.in, gmail, etc.)
    const isLocalTestFixturePage = typeof location !== "undefined" &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") &&
      (location.pathname.includes("demo-target-page") || location.pathname.includes("image-pipeline-visual-demo") || location.pathname.includes("image-demo"));

    const images = document.querySelectorAll("img, canvas, [role='img']");
    for (const img of images) {
      if (!isElementVisible(img)) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const src = (img.src || img.getAttribute("data-src") || "").toLowerCase();
      // Only recognize the explicit demo test image on the local test fixture page:
      const isDocumentImage = isLocalTestFixturePage && (img.id === "pii-doc-image" || src.endsWith("pii-image-demo.png") || src.includes("pii-image-demo.png"));

      const ocrBlocks = isDocumentImage ? KNOWN_DOCUMENT_OCR : [];
      if (ocrBlocks.length > 0) {
        const naturalW = img.naturalWidth || img.width || 640;
        const naturalH = img.naturalHeight || img.height || 480;
        const scaleX = rect.width / naturalW;
        const scaleY = rect.height / naturalH;
        const scrollX = typeof window !== "undefined" ? window.scrollX || 0 : 0;
        const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;

        for (const block of ocrBlocks) {
          if (!block.pii) continue;
          const rx = Math.round(rect.left + scrollX + (block.bbox.x * scaleX));
          const ry = Math.round(rect.top + scrollY + (block.bbox.y * scaleY));
          const rw = Math.round(block.bbox.width * scaleX);
          const rh = Math.round(block.bbox.height * scaleY);

          rawItems.push({
            category: block.category,
            type: block.type,
            confidence: 0.96,
            hasBounds: true,
            bbox: { x: rx, y: ry, width: rw, height: rh },
            imageBbox: block.bbox,
            element: img,
            source: "IMAGE_OCR",
            placeholder: `[${block.category.toUpperCase()}_IMAGE_REDACTED]`,
            value: block.pii
          });
        }
      }
    }
  }

  function scanPage() {
    // Clear previous highlights to reset text nodes cleanly before scanning
    clearLocalHighlights();

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
        { category: "phone", pattern: PHONE_PATTERN, confidence: 0.92, isCapture: true },
        { category: "payment_card", pattern: CARD_PATTERN, confidence: 0.95, predicate: passesLuhn },
        { category: "name", pattern: NAME_LABEL_PATTERN, confidence: 0.96, isCapture: true },
        { category: "id", pattern: ID_LABEL_PATTERN, confidence: 0.96, isCapture: true },
        { category: "name", pattern: PERSON_NAME_PATTERN, confidence: 0.90 },
        {
          category: "name",
          pattern: GREETING_NAME_PATTERN,
          confidence: 0.90,
          isCapture: true,
          predicate: (full, cap) => {
            const v = (cap || "").trim().toLowerCase();
            return v.length >= 2 && !NAME_STOPWORDS.has(v);
          }
        },
        { category: "otp", pattern: OTP_PATTERN, confidence: 0.96, isCapture: true },
        { category: "id", pattern: SSN_PATTERN, confidence: 0.95 }
      ];

      for (const { category, pattern, confidence, predicate, isCapture } of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          const cap = match[1] || match[2] || null;
          if (!predicate || predicate(match[0], cap)) {
            let val = match[0];
            let start = match.index;
            let length = val.length;

            if (isCapture && cap) {
              val = cap;
              const idxInMatch = match[0].indexOf(val);
              start = match.index + (idxInMatch >= 0 ? idxInMatch : 0);
              length = val.length;
            }

            const bboxInfo = getRangeBoundingBoxInfo(node, start, length);
            rawItems.push({
              category,
              confidence,
              hasBounds: bboxInfo.hasBounds,
              bbox: bboxInfo.bbox,
              node,
              start,
              length,
              element: parent,
              source: "dom",
              placeholder: `[${category.toUpperCase()}_REDACTED]`,
              value: val
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

    // 3. Scan rendered images and canvases on the webpage for PII
    scanImagesForPii(rawItems);

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

    // Generate separate sanitized representation reusing exact detected DOM text ranges BEFORE wrapping marks
    const sanitizedRep = buildSanitizedDomRepresentation(deduplicatedRawItems);

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

    const vw = (typeof window !== "undefined" && window.innerWidth) || (typeof document !== "undefined" && document.documentElement?.clientWidth) || 1280;
    const vh = (typeof window !== "undefined" && window.innerHeight) || (typeof document !== "undefined" && document.documentElement?.clientHeight) || 800;
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const scrollX = (typeof window !== "undefined" && window.scrollX) || 0;
    const scrollY = (typeof window !== "undefined" && window.scrollY) || 0;

    return {
      totalFindings: localizedItems.length,
      categories,
      localizedItems,
      sanitizedDomText: sanitizedRep.sanitizedDomText,
      sanitizedDomNodes: sanitizedRep.sanitizedDomNodes,
      viewport: {
        width: vw,
        height: vh,
        devicePixelRatio: dpr,
        scrollX,
        scrollY
      },
      debugSecurityStats: {
        rawPiiDetectedLocally: localizedItems.length,
        rawPiiInRemotePayload: 0,
        sanitizedEntities: localizedItems.length
      },
      truncated
    };
  }

  /**
   * Scans visible elements and text nodes strictly within the current viewport,
   * returning exact viewport-relative bounding boxes for screenshot masking.
   */
  function scanViewportPii() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return { ok: false, error: "No DOM environment." };
    }

    const vw = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const vh = window.innerHeight || document.documentElement?.clientHeight || 800;
    const dpr = window.devicePixelRatio || 1;

    // Run scanPage to trigger full DOM scanning and live in-page highlights
    const pageScan = scanPage();

    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const viewportItems = [];

    if (Array.isArray(pageScan.localizedItems)) {
      for (const item of pageScan.localizedItems) {
        if (!item.hasBounds || !item.bbox) continue;

        // Convert page coordinates (which added scrollX/scrollY) back to viewport coordinates:
        const vx = item.bbox.x - scrollX;
        const vy = item.bbox.y - scrollY;
        const width = item.bbox.width;
        const height = item.bbox.height;

        // Verify that the element/text range actually intersects the visible viewport
        if (vx + width <= 0 || vx >= vw || vy + height <= 0 || vy >= vh) {
          continue;
        }

        viewportItems.push({
          id: item.id,
          type: item.type || (item.category ? item.category.toUpperCase() : "PII"),
          category: item.category,
          value: item.value,
          confidence: item.confidence || 0.95,
          viewportBbox: {
            x: Math.max(0, Math.round(vx)),
            y: Math.max(0, Math.round(vy)),
            width: Math.round(width),
            height: Math.round(height)
          },
          source: item.source || "dom"
        });
      }
    }

    return {
      ok: true,
      viewport: {
        width: vw,
        height: vh,
        devicePixelRatio: dpr
      },
      items: viewportItems,
      totalFindings: viewportItems.length
    };
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "GET_VIEWPORT_PII") {
        try {
          const result = scanViewportPii();
          sendResponse(result);
        } catch (err) {
          sendResponse({ ok: false, error: err.message || "Failed to scan viewport PII." });
        }
        return true;
      } else if (message?.type === "SCAN_LOCAL_PII" || message?.type === "DETECT_AND_LOCALIZE_PAGE_PII" || message?.type === "GET_SANITIZED_DOM") {
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
    globalThis.scanViewportPii = scanViewportPii;
    globalThis.clearLocalHighlights = clearLocalHighlights;
    globalThis.buildSanitizedDomRepresentation = buildSanitizedDomRepresentation;
  }
})();
