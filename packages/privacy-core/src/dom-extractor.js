/**
 * DOM Text Extraction & Semantic Structural Mapping Module.
 * Extracts meaningful user-visible content, form values, and ARIA descriptors from the DOM
 * while ignoring scripts, stylesheets, and hidden implementation details.
 */

const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "path",
  "canvas",
  "audio",
  "video"
]);

/**
 * Generates a unique node identifier.
 * @param {string} prefix
 * @param {number} index
 * @returns {string}
 */
export function generateDomNodeId(prefix = "node", index = 0) {
  return `${prefix}-${index}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Extracts visible text nodes and form values from a live DOM Document/Element or structured DOM JSON.
 *
 * @param {Document|Element|object} rootNode - Live browser DOM element/document or JSON DOM tree
 * @param {object} [options={}]
 * @param {number} [options.maxNodes=1000] - Max nodes to extract to prevent memory exhaustion on massive pages
 * @returns {Array<{ nodeId: string, elementPath: string, text: string, source: string, bbox: { x: number, y: number, width: number, height: number } }>}
 */
export function extractDomTextNodes(rootNode, options = {}) {
  const maxNodes = options.maxNodes || 1000;
  const extracted = [];

  if (!rootNode) return extracted;

  // Case 1: Live Browser DOM Document or Element
  if (typeof rootNode.nodeType === "number") {
    extractFromLiveDom(rootNode, extracted, maxNodes);
    return extracted;
  }

  // Case 2: Structured JSON DOM tree representation (e.g. from Step 11 fixtures or background bridge)
  if (typeof rootNode === "object") {
    extractFromJsonDom(rootNode, extracted, maxNodes);
    return extracted;
  }

  return extracted;
}

/**
 * Traverses a live browser DOM element.
 */
function extractFromLiveDom(root, extracted, maxNodes) {
  if (typeof document === "undefined") return;

  const walker = document.createTreeWalker(
    root,
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
  let nodeIndex = 0;

  while (currentNode && extracted.length < maxNodes) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const text = (currentNode.nodeValue || "").trim();
      if (text) {
        const parent = currentNode.parentElement;
        const rect = parent ? getLiveElementBoundingBox(parent) : { x: 0, y: 0, width: 0, height: 0 };
        const path = parent ? getElementPath(parent) : "body";

        extracted.push({
          nodeId: generateDomNodeId("text", nodeIndex++),
          elementPath: path,
          text,
          source: "text",
          bbox: rect
        });
      }
    } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode;
      const tagName = el.tagName.toLowerCase();
      const rect = getLiveElementBoundingBox(el);
      const path = getElementPath(el);

      // Form Inputs
      if (tagName === "input") {
        const inputType = (el.type || "text").toLowerCase();
        if (inputType !== "hidden") {
          const val = (el.value || "").trim();
          if (val) {
            extracted.push({
              nodeId: el.id || generateDomNodeId("input", nodeIndex++),
              elementPath: path,
              text: val,
              source: "input",
              bbox: rect
            });
          }
        }
      } else if (tagName === "textarea") {
        const val = (el.value || "").trim();
        if (val) {
          extracted.push({
            nodeId: el.id || generateDomNodeId("textarea", nodeIndex++),
            elementPath: path,
            text: val,
            source: "textarea",
            bbox: rect
          });
        }
      } else if (tagName === "select") {
        const selected = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex]?.text : "";
        if (selected) {
          extracted.push({
            nodeId: el.id || generateDomNodeId("select", nodeIndex++),
            elementPath: path,
            text: selected.trim(),
            source: "select",
            bbox: rect
          });
        }
      } else if (el.isContentEditable) {
        const text = (el.innerText || el.textContent || "").trim();
        if (text) {
          extracted.push({
            nodeId: el.id || generateDomNodeId("editable", nodeIndex++),
            elementPath: path,
            text,
            source: "contenteditable",
            bbox: rect
          });
        }
      }

      // ARIA label or associated form label text
      const ariaLabel = el.getAttribute ? el.getAttribute("aria-label") : "";
      if (ariaLabel && ariaLabel.trim()) {
        extracted.push({
          nodeId: generateDomNodeId("aria", nodeIndex++),
          elementPath: path,
          text: ariaLabel.trim(),
          source: "aria",
          bbox: rect
        });
      }
    }
    currentNode = walker.nextNode();
  }
}

/**
 * Traverses a JSON DOM tree representation.
 */
function extractFromJsonDom(node, extracted, maxNodes, currentPath = "body", nodeCounter = { index: 0 }) {
  if (!node || extracted.length >= maxNodes) return;

  const tag = (node.tag || node.tagName || "").toLowerCase();
  if (FORBIDDEN_TAGS.has(tag)) return;

  const path = node.path || (node.id ? `${currentPath}>#${node.id}` : `${currentPath}>${tag || "div"}`);
  const bbox = node.bbox || { x: 0, y: 0, width: 0, height: 0 };
  const nodeId = node.id || generateDomNodeId("json_node", nodeCounter.index++);

  // Check form values
  if (node.value && typeof node.value === "string" && node.value.trim()) {
    extracted.push({
      nodeId,
      elementPath: path,
      text: node.value.trim(),
      source: tag === "textarea" ? "textarea" : tag === "select" ? "select" : "input",
      bbox
    });
  } else if (node.text && typeof node.text === "string" && node.text.trim()) {
    extracted.push({
      nodeId,
      elementPath: path,
      text: node.text.trim(),
      source: node.source || (node.contentEditable ? "contenteditable" : "text"),
      bbox
    });
  }

  // Check ARIA / label text
  if (node.ariaLabel && typeof node.ariaLabel === "string" && node.ariaLabel.trim()) {
    extracted.push({
      nodeId: generateDomNodeId("aria", nodeCounter.index++),
      elementPath: path,
      text: node.ariaLabel.trim(),
      source: "aria",
      bbox
    });
  }

  // Recurse children
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      extractFromJsonDom(child, extracted, maxNodes, path, nodeCounter);
    }
  }
}

function getLiveElementBoundingBox(element) {
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

function getElementPath(element) {
  if (!element || !element.tagName) return "body";
  const path = [];
  let current = element;
  while (current && current.tagName && current.tagName.toLowerCase() !== "html") {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      let siblingIndex = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) siblingIndex++;
        sibling = sibling.previousElementSibling;
      }
      selector += `:nth-of-type(${siblingIndex})`;
      path.unshift(selector);
    }
    current = current.parentElement;
  }
  return path.join(" > ") || "body";
}
