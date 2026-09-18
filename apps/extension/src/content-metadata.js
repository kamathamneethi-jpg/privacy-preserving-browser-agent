/**
 * Step 2 privacy boundary:
 * This script intentionally reads no page text, inputs, images, cookies, or full URL.
 * The returned data stays inside the extension and is never sent over the network.
 */
function collectSafePageMetadata() {
  return {
    hostname: window.location.hostname,
    protocol: window.location.protocol.replace(":", ""),
    language: document.documentElement.lang || "not declared",
    contentType: document.contentType || "not declared",
    capturedAt: new Date().toISOString()
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CAPTURE_SAFE_PAGE_METADATA") {
    sendResponse({ ok: true, metadata: collectSafePageMetadata() });
    return;
  }

  if (message?.type === "EXTRACT_PAGE_DOM") {
    sendResponse({ ok: true, domNodes: extractLivePageDomNodes() });
    return;
  }
});

function extractLivePageDomNodes(maxNodes = 500) {
  if (typeof document === "undefined") return [];

  const FORBIDDEN_TAGS = new Set(["script", "style", "noscript", "template", "svg", "canvas", "audio", "video"]);
  const extracted = [];
  let nodeIndex = 0;

  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          if (FORBIDDEN_TAGS.has(tagName)) return NodeFilter.FILTER_REJECT;
          if (node.getAttribute && (node.getAttribute("type") === "hidden" || node.getAttribute("aria-hidden") === "true")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const parentTag = parent.tagName.toLowerCase();
          if (FORBIDDEN_TAGS.has(parentTag)) return NodeFilter.FILTER_REJECT;
          const text = (node.nodeValue || "").trim();
          if (!text) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let currentNode = walker.nextNode();
  while (currentNode && extracted.length < maxNodes) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const text = (currentNode.nodeValue || "").trim();
      if (text) {
        const parent = currentNode.parentElement;
        const rect = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        extracted.push({
          nodeId: `text_${nodeIndex++}`,
          elementPath: parent ? (parent.id ? `#${parent.id}` : parent.tagName.toLowerCase()) : "body",
          text,
          source: "text",
          bbox: {
            x: Math.round(rect.left + (window.scrollX || 0)),
            y: Math.round(rect.top + (window.scrollY || 0)),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }
    } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode;
      const tagName = el.tagName.toLowerCase();
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      const bbox = {
        x: Math.round(rect.left + (window.scrollX || 0)),
        y: Math.round(rect.top + (window.scrollY || 0)),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };

      if (tagName === "input" && (el.type || "").toLowerCase() !== "hidden") {
        const val = (el.value || "").trim();
        const placeholder = (el.placeholder || "").trim();
        const path = el.id ? `#${el.id}` : (el.name ? `input[name="${el.name}"]` : "input");
        extracted.push({
          nodeId: el.id || `input_${nodeIndex++}`,
          elementPath: path,
          text: val || (placeholder ? `[${placeholder}]` : ""),
          value: val,
          source: "input",
          bbox
        });
      } else if (tagName === "textarea") {
        const val = (el.value || "").trim();
        const path = el.id ? `#${el.id}` : "textarea";
        extracted.push({
          nodeId: el.id || `textarea_${nodeIndex++}`,
          elementPath: path,
          text: val,
          value: val,
          source: "textarea",
          bbox
        });
      } else if (tagName === "button" || (tagName === "input" && ["submit", "button"].includes(el.type))) {
        const btnText = (el.innerText || el.value || el.textContent || "").trim();
        if (btnText) {
          extracted.push({
            nodeId: el.id || `button_${nodeIndex++}`,
            elementPath: el.id ? `#${el.id}` : "button",
            text: btnText,
            source: "button",
            bbox
          });
        }
      }
    }
    currentNode = walker.nextNode();
  }

  return extracted;
}

