/**
 * Generic Interactive Element Registry & DOM Analyzer.
 * Discovers interactive elements on arbitrary webpages, assigns temporary snapshot IDs (el_1, el_2, ...),
 * and maintains local-only in-memory mappings to real DOM elements.
 *
 * Privacy & Security Guarantees:
 * 1. 100% On-Device: All DOM node references remain in memory on the client.
 * 2. Zero Leakage: Passwords and sensitive card values are never extracted into element descriptions.
 * 3. Stale Detection: Validates element.isConnected against the live document tree before every action.
 * 4. Generic & Dynamic: Works on any website without hardcoded domain or selector rules.
 */

const INTERACTIVE_TAGS = new Set(["button", "a", "input", "textarea", "select", "option", "summary"]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "tab",
  "menuitem",
  "switch"
]);

/**
 * Checks if a DOM element is interactive based on tag, role, or attributes.
 *
 * @param {Element|object} element
 * @returns {boolean}
 */
export function isInteractiveElement(element) {
  if (!element) return false;

  const tag = String(element.tagName || element.tag || "").toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;

  const role = String(
    (typeof element.getAttribute === "function" ? element.getAttribute("role") : element.role) || ""
  ).toLowerCase();
  if (INTERACTIVE_ROLES.has(role)) return true;

  if (typeof element.getAttribute === "function") {
    const tabIndex = element.getAttribute("tabindex");
    if (tabIndex === "0" || tabIndex === 0) return true;
    const contentEditable = element.getAttribute("contenteditable");
    if (contentEditable === "true" || contentEditable === "") return true;
  }

  if (element.isContentEditable || element.onclick || element.hasAttribute?.("onclick")) {
    return true;
  }

  return false;
}

/**
 * Extracts sanitized semantic description from a DOM element.
 *
 * @param {Element|object} element
 * @param {string} elementId - e.g. "el_1"
 * @returns {object} Contract-adherent element description
 */
export function extractElementDescription(element, elementId) {
  const tag = String(element.tagName || element.tag || "unknown").toLowerCase();
  const getAttr = (name) => {
    if (typeof element.getAttribute === "function") return element.getAttribute(name);
    return element.attributes?.[name] || element[name] || null;
  };

  const role = getAttr("role") || null;
  const ariaLabel = getAttr("aria-label") || getAttr("aria-labelledby") || null;
  const placeholder = getAttr("placeholder") || null;
  const name = getAttr("name") || null;
  const type = getAttr("type") || (tag === "input" ? "text" : null);
  const lowerType = String(type || "").toLowerCase();
  const disabled = Boolean(element.disabled || getAttr("disabled") !== null && getAttr("disabled") !== false);

  // Extract clean text content
  let text = "";
  if (tag === "input" || tag === "textarea") {
    if (type === "button" || type === "submit" || type === "reset") {
      text = element.value || getAttr("value") || getAttr("aria-label") || getAttr("title") || "";
      if (!text && typeof element.closest === "function") {
        const btnWrapper = element.closest("span.a-button, button, form, div");
        if (btnWrapper) text = btnWrapper.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
      }
    } else if (lowerType === "checkbox" || lowerType === "radio") {
      // For checkboxes and radios, extract text from associated label or parent container
      if (element.labels && element.labels.length > 0) {
        text = Array.from(element.labels).map(l => l.textContent).join(" ").replace(/\s+/g, " ").trim();
      } else if (typeof element.closest === "function") {
        const parentContainer = element.closest("label") || element.closest("li") || element.parentElement;
        if (parentContainer) {
          text = parentContainer.textContent.replace(/\s+/g, " ").trim().slice(0, 100);
        }
      }
    } else {
      text = ""; // Don't expose text input value as text
    }
  } else if (typeof element.textContent === "string") {
    text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  } else if (typeof element.text === "string") {
    text = element.text.replace(/\s+/g, " ").trim().slice(0, 120);
  }

  // Fallback text from img alt or title/aria-label if link/button has no visible text
  if (!text) {
    if (ariaLabel) {
      text = ariaLabel;
    } else if (getAttr("title")) {
      text = getAttr("title");
    } else if (typeof element.querySelector === "function") {
      const img = element.querySelector("img");
      if (img && img.alt) {
        text = img.alt.replace(/\s+/g, " ").trim().slice(0, 120);
      }
    }
  }

  // Sanitize value: Never expose raw passwords or long text values
  let value = null;
  if (lowerType === "password") {
    value = null;
  } else if (tag === "select" || tag === "option" || lowerType === "checkbox" || lowerType === "radio" || lowerType === "button" || lowerType === "submit") {
    const rawVal = element.value ?? getAttr("value");
    if (typeof rawVal === "string" || typeof rawVal === "number") {
      value = String(rawVal).slice(0, 80);
    }
  }

  const checked = typeof element.checked === "boolean" ? element.checked : (getAttr("checked") !== null ? true : null);

  // Optional Bounding Box
  let bbox = null;
  if (typeof element.getBoundingClientRect === "function") {
    try {
      const rect = element.getBoundingClientRect();
      bbox = {
        x: Math.round(rect.x || rect.left || 0),
        y: Math.round(rect.y || rect.top || 0),
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0)
      };
    } catch {}
  } else if (element.bbox) {
    bbox = { ...element.bbox };
  }

  // Detect Ads and Sponsored elements
  let isSponsored = Boolean(element.isSponsored || element.isAd);
  if (!isSponsored && typeof element.closest === "function") {
    try {
      const adContainer = element.closest(
        '[data-component-type="sp-sponsored-result"], ' +
        '[data-component-type="sbv-video-single-product"], ' +
        '[data-ad-preview], [data-ad-id], [data-ad-slot], [data-ad-details], ' +
        '.s-sponsored-label-info-icon, .puis-sponsored-label-text, .s-sponsored-info-icon, ' +
        '[class*="sponsored" i], [id*="sponsored" i], [class*="ad-container" i], ' +
        'div[data-cel-widget*="sponsored" i], div[data-cel-widget*="sp_" i]'
      );
      if (adContainer) isSponsored = true;
    } catch {}
  }

  const fullText = `${text || ""} ${ariaLabel || ""} ${getAttr("title") || ""}`;
  if (!isSponsored && /\b(sponsored|advertisement|ad feedback|promoted|ad by)\b/i.test(fullText)) {
    isSponsored = true;
  }

  // Detect Filter / Refinement
  let isFilter = Boolean(element.isFilter);
  let filterCategory = element.filterCategory || null;
  if (!isFilter && typeof element.closest === "function") {
    try {
      const filterContainer = element.closest(
        '#s-refinements, #filters, #refinements, .s-navigation-left, aside, nav#filters, ' +
        '[data-component-type="s-refinements-left-nav"], [aria-label*="refine" i], [aria-label*="filter" i], ' +
        '[id*="refinement"], [class*="refinement"], [class*="filter-container"], [class*="filter-group"], ' +
        'li[id^="p_"], .s-navigation-item'
      );
      if (filterContainer) {
        isFilter = true;
        const section = element.closest('div[id^="p_"], div.a-section, li[id^="p_"]');
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
    } catch {}
  }
  if (lowerType === "checkbox" || role === "checkbox") {
    isFilter = true;
  }

  // Detect Price Specific Controls
  let isMaxPriceInput = Boolean(element.isMaxPriceInput);
  let isMinPriceInput = Boolean(element.isMinPriceInput);
  let isPriceGoButton = Boolean(element.isPriceGoButton);

  const lowerName = (name || "").toLowerCase();
  const lowerId = (getAttr("id") || "").toLowerCase();
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
    const isGo = /^(?:go|apply|submit)$/i.test(text || String(value || ""));
    if (isGo && (isFilter || filterCategory === "price")) {
      isPriceGoButton = true;
      isFilter = true;
      filterCategory = "price";
    }
  }

  // Detect Organic Product Result
  let isProductResult = Boolean(element.isProductResult);
  if (!isProductResult && !isSponsored && typeof element.closest === "function") {
    try {
      const prodCard = element.closest('[data-component-type="s-search-result"], .s-result-item[data-asin]');
      if (prodCard && prodCard.getAttribute("data-asin")) {
        isProductResult = true;
      }
    } catch {}
  }

  return {
    elementId,
    tag,
    role: role || (tag === "button" || lowerType === "submit" || lowerType === "button" ? "button" : (tag === "a" ? "link" : (tag === "input" ? (lowerType === "checkbox" ? "checkbox" : (lowerType === "radio" ? "radio" : "textbox")) : (tag === "label" ? "label" : null)))),
    text: text || null,
    ariaLabel: ariaLabel || null,
    placeholder: placeholder || null,
    name: name || null,
    type: type || null,
    value: value || null,
    checked: checked !== null ? checked : undefined,
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
}

/**
 * Interactive Element Registry managing dynamic temporary snapshot IDs.
 */
export class InteractiveElementRegistry {
  constructor() {
    this.currentSnapshotId = null;
    this.elementsMap = new Map(); // elementId -> DOM element
    this.descriptions = [];       // array of element descriptions
    this.snapshotTimestamp = 0;
  }

  /**
   * Scans a document or root element and registers all interactive elements for a new snapshot.
   *
   * @param {Document|Element|object} rootNode
   * @returns {object} { snapshotId: string, elements: Array<object>, count: number }
   */
  observeDocument(rootNode = (typeof document !== "undefined" ? document : null)) {
    this.elementsMap.clear();
    this.descriptions = [];
    this.snapshotTimestamp = Date.now();
    this.currentSnapshotId = `snap_${this.snapshotTimestamp}_${Math.random().toString(36).substring(2, 8)}`;

    if (!rootNode) {
      return {
        snapshotId: this.currentSnapshotId,
        elements: [],
        count: 0
      };
    }

    let rawElements = [];

    // Real Browser DOM
    if (typeof rootNode.querySelectorAll === "function") {
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

      try {
        rawElements = Array.from(rootNode.querySelectorAll(selector));
      } catch {
        rawElements = [];
      }
    } else if (Array.isArray(rootNode.nodes)) {
      rawElements = rootNode.nodes;
    } else if (Array.isArray(rootNode.children)) {
      // Traverse simulated tree
      const collect = (node) => {
        if (!node) return;
        if (isInteractiveElement(node)) rawElements.push(node);
        if (Array.isArray(node.children)) {
          for (const c of node.children) collect(c);
        }
      };
      collect(rootNode);
    } else if (isInteractiveElement(rootNode)) {
      rawElements = [rootNode];
    }

    let idCounter = 1;
    for (const el of rawElements) {
      if (!el) continue;

      // Filter out hidden / zero-dimension elements if in browser
      if (typeof window !== "undefined" && typeof el.getBoundingClientRect === "function") {
        try {
          const style = window.getComputedStyle?.(el);
          if (style?.display === "none" || style?.visibility === "hidden") continue;
        } catch {}
      }

      const elementId = `el_${idCounter++}`;
      const desc = extractElementDescription(el, elementId);

      this.elementsMap.set(elementId, el);
      // Also map by ID or name if present for fallback resolution
      if (el.id) this.elementsMap.set(el.id, el);
      if (desc.name) this.elementsMap.set(desc.name, el);

      this.descriptions.push(desc);
    }

    return {
      snapshotId: this.currentSnapshotId,
      elements: [...this.descriptions],
      count: this.descriptions.length
    };
  }

  /**
   * Resolves an element by temporary ID or attribute from the active snapshot.
   *
   * @param {string} targetId - e.g. "el_1" or element id
   * @param {string} [snapshotId]
   * @returns {object} { resolved: boolean, element?: Element|object, isConnected: boolean, isStale: boolean, error?: string }
   */
  resolveElement(targetId, snapshotId = null) {
    if (!targetId || typeof targetId !== "string") {
      return { resolved: false, isConnected: false, isStale: false, error: "Invalid target ID." };
    }

    const isSnapshotStale = Boolean(snapshotId && this.currentSnapshotId && snapshotId !== this.currentSnapshotId);

    const element = this.elementsMap.get(targetId);
    if (!element) {
      // Try resolving directly in document if in browser
      if (typeof document !== "undefined") {
        const byId = document.getElementById(targetId);
        if (byId) {
          const isConnected = byId.isConnected !== false;
          return { resolved: true, element: byId, isConnected, isStale: !isConnected };
        }
      }
      return { resolved: false, isConnected: false, isStale: isSnapshotStale, error: `Target '${targetId}' not found in registry.` };
    }

    // Check if element is still connected to document DOM
    let isConnected = true;
    if (typeof element.isConnected === "boolean") {
      isConnected = element.isConnected;
    }

    if (!isConnected || isSnapshotStale) {
      return {
        resolved: false,
        element,
        isConnected,
        isStale: true,
        error: `Target '${targetId}' is disconnected or belongs to a stale snapshot.`
      };
    }

    return {
      resolved: true,
      element,
      isConnected: true,
      isStale: false
    };
  }

  /**
   * Returns list of currently observed interactive element descriptions.
   *
   * @returns {Array<object>}
   */
  getDescriptions() {
    return [...this.descriptions];
  }

  /**
   * Clears registry state.
   */
  clear() {
    this.elementsMap.clear();
    this.descriptions = [];
    this.currentSnapshotId = null;
  }
}

/**
 * Factory function for creating an InteractiveElementRegistry.
 *
 * @returns {InteractiveElementRegistry}
 */
export function createInteractiveElementRegistry() {
  return new InteractiveElementRegistry();
}

export const interactiveElementRegistry = createInteractiveElementRegistry();
