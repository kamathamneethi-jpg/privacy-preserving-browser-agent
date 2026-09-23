/**
 * Semantic Target Resolver Module.
 * Resolves natural language target descriptions (e.g. "email", "phone number", "confirm order", "submit")
 * to concrete interactive DOM elements (el_1, el_2, ...) based on rich semantic signals.
 *
 * Invariants:
 * 1. Zero Website-Specific Hardcoding: Works on any arbitrary website or form.
 * 2. Multi-Signal Scoring: Uses label, aria-label, name, id, placeholder, visible text, input type, and semantic type.
 * 3. Mode Separation: Distinguishes between input/fill targets and button/click targets.
 * 4. Value Isolation: CLICK targets never receive or inherit text values.
 */

/**
 * Normalizes text for semantic token matching.
 */
function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0 && !/^(?:the|a|an|please|to|on|in|into|for|with|of|at|by)$/i.test(t));
}

/**
 * Common semantic synonyms for standard form concepts.
 */
const SEMANTIC_SYNONYMS = {
  email: ["email", "mail", "e-mail", "address"],
  phone: ["phone", "tel", "telephone", "mobile", "cell", "contact"],
  name: ["name", "fullname", "firstname", "lastname"],
  password: ["password", "pass", "pwd"],
  otp: ["otp", "code", "pin", "token", "2fa", "two-factor", "auth", "verification"],
  message: ["message", "comment", "feedback", "notes", "query", "description", "inquiry"],
  address: ["address", "street", "city", "location", "shipping", "billing", "delivery"],
  submit: ["submit", "send", "save", "apply", "register", "signup", "proceed", "continue", "finish", "complete"],
  confirm: ["confirm", "place", "order", "accept", "agree", "verify", "ok", "yes"],
  cancel: ["cancel", "dismiss", "close", "back", "abort", "reject", "no"]
};

/**
 * Scores an interactive element against a semantic target description.
 *
 * @param {object} el - Interactive element descriptor ({ elementId, tag, type, text, name, id, labelText, placeholder, ariaLabel, semanticType })
 * @param {string} targetSemantic - Target description (e.g. "phone number", "email", "confirm order")
 * @param {string} mode - "input" | "click" | "any"
 * @returns {number} Score >= 0 (higher is better match)
 */
export function scoreElementMatch(el, targetSemantic, mode = "any") {
  if (!el || !targetSemantic) return 0;

  const targetLower = targetSemantic.toLowerCase().trim();
  const targetTokens = tokenize(targetLower);
  if (targetTokens.length === 0) return 0;

  const tag = (el.tag || "").toLowerCase();
  const type = (el.type || "").toLowerCase();
  const role = (el.role || "").toLowerCase();

  // Mode gating
  const isInputLike = tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  const isButtonLike = tag === "button" || (tag === "input" && (type === "submit" || type === "button")) || role === "button" || tag === "a";

  if (mode === "input") {
    if (!isInputLike) return 0;
    if (type === "hidden" || type === "submit" || type === "button" || type === "reset" || type === "image") return 0;
  } else if (mode === "click") {
    if (!isButtonLike && !el.isClickable) return 0;
  }

  // Collect text signals from element
  const labelText = (el.labelText || "").toLowerCase();
  const placeholder = (el.placeholder || "").toLowerCase();
  const ariaLabel = (el.ariaLabel || "").toLowerCase();
  const elName = (el.name || "").toLowerCase();
  const elId = (el.id || el.elementId || "").toLowerCase();
  const visibleText = (el.text || el.innerText || (isButtonLike ? el.value : "") || "").toLowerCase();
  const semanticType = (el.semanticType || "").toLowerCase();

  // Combined high-confidence text (user-facing labels & placeholders)
  const userFacingText = `${labelText} ${placeholder} ${ariaLabel} ${visibleText}`.trim();
  // Combined technical text (DOM name, ID, type)
  const codeText = `${elName} ${elId} ${semanticType}`.trim();
  const allText = `${userFacingText} ${codeText}`.trim();

  let score = 0;

  // 1. Exact phrase match
  if (userFacingText.includes(targetLower)) {
    score += 120;
  } else if (codeText.includes(targetLower.replace(/\s+/g, "_")) || codeText.includes(targetLower.replace(/\s+/g, "-")) || codeText.includes(targetLower.replace(/\s+/g, ""))) {
    score += 90;
  }

  // 2. Token coverage
  let matchedTokens = 0;
  for (const token of targetTokens) {
    if (userFacingText.includes(token)) {
      matchedTokens++;
      score += 30;
    } else if (codeText.includes(token)) {
      matchedTokens++;
      score += 20;
    }
  }

  // Bonus if all tokens in target matched
  if (matchedTokens === targetTokens.length && targetTokens.length > 1) {
    score += 50;
  }

  // 3. Concept / Synonym Matching
  for (const [concept, syns] of Object.entries(SEMANTIC_SYNONYMS)) {
    const targetHasConcept = targetTokens.some(t => syns.includes(t));
    if (!targetHasConcept) continue;

    // Check if element has this concept in its type or semanticType
    if (type === concept || semanticType === concept || (concept === "phone" && type === "tel")) {
      score += 80;
    }

    // Check if element signals contain any synonym
    const elementHasSynonym = syns.some(s => userFacingText.includes(s) || codeText.includes(s));
    if (elementHasSynonym) {
      score += 40;
    }
  }

  // 4. Role / Type Appropriateness
  if (mode === "click") {
    if (type === "submit" || role === "button" || tag === "button") {
      score += 15;
    }
  }

  return score;
}

/**
 * Resolves the best matching interactive element for a given semantic target.
 *
 * @param {Array<object>} interactiveElements - List of elements from observeInteractiveDom
 * @param {object} query - Query parameters
 * @param {string} query.targetSemantic - Target description (e.g. "email", "phone number", "confirm order")
 * @param {string} [query.mode="any"] - "input" | "click" | "any"
 * @param {number} [query.minScore=20] - Minimum score threshold
 * @returns {object|null} Best matching element or null
 */
export function resolveSemanticTarget(interactiveElements = [], {
  targetSemantic = "",
  mode = "any",
  minScore = 20
} = {}) {
  if (!Array.isArray(interactiveElements) || interactiveElements.length === 0 || !targetSemantic) {
    return null;
  }

  let bestElement = null;
  let highestScore = minScore;

  for (const el of interactiveElements) {
    if (el.isSponsored || el.isAd) continue;

    const score = scoreElementMatch(el, targetSemantic, mode);
    if (score > highestScore) {
      highestScore = score;
      bestElement = el;
    }
  }

  return bestElement;
}
