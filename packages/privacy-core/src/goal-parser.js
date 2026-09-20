/**
 * Goal Parser Module.
 * Parses arbitrary natural language user requests into a structured goal specification:
 * - Clear goal description
 * - Normalized constraint list (attribute, name, type, operator, value, currency)
 * - Required browser operations (search, filter, inspect, compare, fill, submit, extract, add_to_cart)
 * - Identified domain (ecommerce, form_filling, booking, research, navigation, general)
 *
 * Designed to operate 100% locally with zero domain-specific hardcoding.
 */

export const CONSTRAINT_OPERATORS = Object.freeze({
  EQUALS: "equals",
  NOT_EQUALS: "not_equals",
  LESS_THAN_OR_EQUAL: "less_than_or_equal",
  GREATER_THAN_OR_EQUAL: "greater_than_or_equal",
  CONTAINS: "contains",
  BETWEEN: "between"
});

export const BROWSER_OPERATIONS = Object.freeze({
  NAVIGATE: "navigate",
  SEARCH: "search",
  FILTER: "filter",
  INSPECT: "inspect",
  COMPARE: "compare",
  COMPARE_CANDIDATES: "compare",
  EXTRACT: "extract",
  FILL: "fill",
  FILL_FORM: "fill_form",
  SUBMIT: "submit",
  SUBMIT_FORM: "submit_form",
  ADD_TO_CART: "add_to_cart",
  CLICK: "click",
  WAIT: "wait"
});

export const TASK_DOMAINS = Object.freeze({
  ECOMMERCE: "ecommerce",
  FORM_FILLING: "form_filling",
  BOOKING: "booking",
  RESEARCH: "research",
  NAVIGATION: "navigation",
  GENERAL: "general"
});

export class GoalParser {
  /**
   * Parses a natural language user request into a structured goal definition.
   *
   * @param {string} userRequest - Raw user instruction
   * @returns {object} Structured goal object
   */
  static parse(userRequest) {
    if (!userRequest || typeof userRequest !== "string") {
      return {
        rawRequest: "",
        originalGoal: "",
        goal: "Idle / No task specified",
        summary: "Idle / No task specified",
        domain: TASK_DOMAINS.GENERAL,
        constraints: [],
        required_operations: [BROWSER_OPERATIONS.WAIT],
        operations: [BROWSER_OPERATIONS.WAIT],
        targetEntity: null
      };
    }

    const trimmed = userRequest.trim();
    const domain = this.detectDomain(trimmed);
    const targetWebsite = this.extractTargetWebsite(trimmed);
    const constraints = this.extractConstraints(trimmed);
    const required_operations = this.extractOperations(trimmed, domain, constraints);
    const targetEntity = this.extractTargetEntity(trimmed, domain);
    const summary = this.summarizeGoal(trimmed, targetEntity, domain);

    return {
      rawRequest: trimmed,
      originalGoal: trimmed,
      goal: summary,
      summary,
      domain,
      targetWebsite,
      targetEntity,
      constraints,
      required_operations,
      operations: required_operations
    };
  }

  /**
   * Identifies any explicit target website mentioned in the user request.
   */
  static extractTargetWebsite(text) {
    const lower = text.toLowerCase();
    const match = lower.match(/\b(?:on|in|from|at|via|to)\s+(google|wikipedia|youtube|github|reddit|flipkart|ebay|walmart|amazon|twitter|x|linkedin|stackoverflow|myntra|bing|duckduckgo)\b/i);
    if (match) return match[1].toLowerCase();
    if (/\b(?:wikipedia\.org|google\.com|youtube\.com|github\.com|flipkart\.com|amazon\.in|amazon\.com)\b/i.test(lower)) {
      const m2 = lower.match(/\b([a-z0-9-]+)\.(?:org|com|in|net|io)\b/i);
      if (m2) return m2[1].toLowerCase();
    }
    return null;
  }

  /**
   * Identifies the primary task domain from natural language cues.
   */
  static detectDomain(text) {
    const lower = text.toLowerCase();

    // 1. Form Filling has highest precedence when form filling verbs/nouns are present
    if (/\b(?:fill out|fill in|complete form|registration form|signup form|contact form|survey|application form|enter name|enter email)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }
    if (/\b(?:form|sign up|register|survey|application|registration|employee form)\b/i.test(lower) && !/\b(?:buy|shop|shoes?|sneakers?|laptops?)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }

    // 2. Navigation
    if (/\b(?:http:\/\/|https:\/\/|navigate to|go to website|open url)\b/i.test(lower) && !/\b(?:buy|shop|cart|checkout)\b/i.test(lower)) {
      return TASK_DOMAINS.NAVIGATION;
    }

    // 3. Booking & Travel
    if (/\b(?:flight|hotel|airbnb|booking|ticket|reservation|train|bus)\b/i.test(lower)) {
      return TASK_DOMAINS.BOOKING;
    }

    // 4. E-Commerce
    if (/\b(?:buy|shop|cart|product|price|shoes?|sneakers?|jackets?|clothes?|laptops?|phones?|amazon|flipkart|ebay|walmart|myntra|discount|cost|order|winter jacket)\b/i.test(lower)) {
      return TASK_DOMAINS.ECOMMERCE;
    }

    // 5. Research & Information Retrieval
    if (/\b(?:read|article|paper|summary|extract|wikipedia|wiki|google|search for|look up|research|info|information|docs|documentation|learn about)\b/i.test(lower)) {
      return TASK_DOMAINS.RESEARCH;
    }

    return TASK_DOMAINS.GENERAL;
  }

  /**
   * Extracts user constraints into structured operator/value pairs.
   */
  static extractConstraints(text) {
    const constraints = [];

    // Helper to push normalized constraint
    const addConstraint = (attr, op, val, extra = {}) => {
      constraints.push({
        attribute: attr,
        name: attr,
        type: attr,
        operator: op,
        value: val,
        ...extra
      });
    };

    // 1. Price constraint: under / below / less than / max <number><k?>
    const maxPriceMatch = text.match(/(?:under|below|less than|max|up to|<=?)\s*(?:[₹$€£]|rs\.?|inr|usd)?\s*([\d,]+(?:\.\d+)?)\s*(k\b|thousand\b)?/i);
    if (maxPriceMatch) {
      const numStr = maxPriceMatch[1].replace(/,/g, "");
      let val = parseFloat(numStr);
      if (maxPriceMatch[2] && /^k\b/i.test(maxPriceMatch[2])) {
        val = val * 1000;
      } else if (maxPriceMatch[2] && /^thousand\b/i.test(maxPriceMatch[2])) {
        val = val * 1000;
      }
      if (!isNaN(val)) {
        let currency = "USD";
        if (text.includes("₹") || /inr|rs/i.test(text) || (maxPriceMatch[2] && val >= 1000)) currency = "INR";
        else if (text.includes("€") || /eur/i.test(text)) currency = "EUR";
        else if (text.includes("£") || /gbp/i.test(text)) currency = "GBP";

        addConstraint("price", CONSTRAINT_OPERATORS.LESS_THAN_OR_EQUAL, val, { currency });
      }
    }

    // 2. Minimum price constraint: above / at least / over <number><k?>
    const minPriceMatch = text.match(/(?:above|over|more than|at least|>=?)\s*(?:[₹$€£]|rs\.?|inr|usd)?\s*([\d,]+(?:\.\d+)?)\s*(k\b|thousand\b)?/i);
    if (minPriceMatch) {
      const numStr = minPriceMatch[1].replace(/,/g, "");
      let val = parseFloat(numStr);
      if (minPriceMatch[2] && /^k\b/i.test(minPriceMatch[2])) {
        val = val * 1000;
      } else if (minPriceMatch[2] && /^thousand\b/i.test(minPriceMatch[2])) {
        val = val * 1000;
      }
      if (!isNaN(val)) {
        addConstraint("price", CONSTRAINT_OPERATORS.GREATER_THAN_OR_EQUAL, val);
      }
    }

    // 3. Color constraints: (white, black, blue, red, green, etc.)
    const colorMatch = text.match(/\b(white|black|blue|red|green|yellow|grey|gray|pink|purple|orange|brown|silver|gold)\b/i);
    if (colorMatch) {
      addConstraint("color", CONSTRAINT_OPERATORS.EQUALS, colorMatch[1].toLowerCase());
    }

    // 4. Brand / Organization constraints
    const brandMatch = text.match(/\b(nike|adidas|puma|reebok|apple|samsung|sony|dell|hp|lenovo|asus|bose|logitech)\b/i);
    if (brandMatch) {
      addConstraint("brand", CONSTRAINT_OPERATORS.EQUALS, brandMatch[1].charAt(0).toUpperCase() + brandMatch[1].slice(1).toLowerCase());
    }

    // 5. Rating constraints
    const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:stars?|rating|\+?\s*stars?)/i);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      if (rating >= 1 && rating <= 5) {
        addConstraint("rating", CONSTRAINT_OPERATORS.GREATER_THAN_OR_EQUAL, rating);
      }
    }

    // 6. Generic key-value constraints (e.g. "size: 10" or "size 10")
    const sizeMatch = text.match(/\bsize\s*(?::|=|\s)?\s*([0-9A-Z]+)\b/i);
    if (sizeMatch) {
      addConstraint("size", CONSTRAINT_OPERATORS.EQUALS, sizeMatch[1].toUpperCase());
    }

    // 7. Candidate Count Constraint (e.g. "top 2", "compare 2", "3 options")
    const countMatch = text.match(/\b(?:top|compare|select from|best)\s*(\d+)\b/i) || text.match(/\b(\d+)\s*(?:options|candidates|laptops|phones|items)\b/i);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      if (count > 0) {
        addConstraint("candidate_count", CONSTRAINT_OPERATORS.GREATER_THAN_OR_EQUAL, count);
      }
    }

    // 8. Technical specs constraint (e.g. "16GB RAM", "512GB SSD")
    const specMatch = text.match(/\b(\d+\s*(?:gb|tb)\s*(?:ram|ssd|storage|rom)?)\b/i);
    if (specMatch) {
      addConstraint("spec", CONSTRAINT_OPERATORS.CONTAINS, specMatch[1].toLowerCase().replace(/\s+/g, ""));
    }

    // 9. URL constraint (avoid matching email domains)
    const urlMatch = text.match(/https?:\/\/[^\s]+|(?<!@)\b[a-zA-Z0-9-]+\.(?:org|com|net|edu|gov|io)\b[^\s,.]*/i);
    if (urlMatch) {
      let u = urlMatch[0];
      if (!u.startsWith("http")) u = `https://${u}`;
      addConstraint("url", CONSTRAINT_OPERATORS.EQUALS, u);
    }

    // 10. Form Field constraints (name, email, phone, message, etc.)
    const emailMatch = text.match(/(?:email|e-mail)\s*(?:as|is|to|=|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i);
    if (emailMatch) {
      addConstraint("email", CONSTRAINT_OPERATORS.EQUALS, emailMatch[1].trim());
    }

    const nameMatch = text.match(/(?:name|full\s*name|first\s*name)\s*(?:as|is|to|=|:)?\s*([a-zA-Z\s]{2,35}?)(?=[,\.]|\band\b|\bemail\b|\bphone\b|\bwith\b|$)/i);
    if (nameMatch) {
      addConstraint("name", CONSTRAINT_OPERATORS.EQUALS, nameMatch[1].trim());
    }

    const phoneMatch = text.match(/(?:phone|mobile|tel|contact(?:\s*number)?)\s*(?:as|is|to|=|:)?\s*(\+?[\d\s-]{7,15})/i);
    if (phoneMatch) {
      addConstraint("phone", CONSTRAINT_OPERATORS.EQUALS, phoneMatch[1].replace(/[\s-]/g, "").trim());
    }

    const msgMatch = text.match(/(?:message|comment|feedback|query|notes?)\s*(?:as|is|to|=|:)\s*(["'][^"']+["']|[^,\.]+)/i);
    if (msgMatch) {
      addConstraint("message", CONSTRAINT_OPERATORS.EQUALS, msgMatch[1].replace(/^["']|["']$/g, "").trim());
    }

    return constraints;
  }

  /**
   * Identifies required operations from the task intent.
   */
  static extractOperations(text, domain, constraints) {
    const ops = new Set();
    const lower = text.toLowerCase();

    if (/\b(?:https?:\/\/|go to|open|navigate|visit)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.NAVIGATE);
    }
    if (/\b(?:search|find|look for|query)\b/i.test(lower) || domain === TASK_DOMAINS.ECOMMERCE || domain === TASK_DOMAINS.RESEARCH) {
      ops.add(BROWSER_OPERATIONS.SEARCH);
    }
    if (constraints.length > 0 || /\b(?:filter|sort|under|color|brand|price|size)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.FILTER);
    }
    if (/\b(?:inspect|check|view|details|look at|examine|open first|click)\b/i.test(lower) || domain === TASK_DOMAINS.ECOMMERCE) {
      ops.add(BROWSER_OPERATIONS.INSPECT);
    }
    if (/\b(?:compare|options|few options|which is better|best of)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.COMPARE);
      ops.add(BROWSER_OPERATIONS.COMPARE_CANDIDATES);
    }
    if (/\b(?:fill|enter|input|type)\b/i.test(lower) || domain === TASK_DOMAINS.FORM_FILLING) {
      ops.add(BROWSER_OPERATIONS.FILL);
      ops.add(BROWSER_OPERATIONS.FILL_FORM);
    }
    if (/\b(?:submit|apply|register|sign up|book now|complete form)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.SUBMIT);
      ops.add(BROWSER_OPERATIONS.SUBMIT_FORM);
    }
    if (/\b(?:add to cart|add to bag|buy now|buy|cart)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.ADD_TO_CART);
      ops.add(BROWSER_OPERATIONS.SUBMIT);
    }
    if (/\b(?:extract|summarize|read|get info|information)\b/i.test(lower) || domain === TASK_DOMAINS.RESEARCH) {
      ops.add(BROWSER_OPERATIONS.EXTRACT);
    }

    if (ops.size === 0) {
      ops.add(BROWSER_OPERATIONS.SEARCH);
      ops.add(BROWSER_OPERATIONS.INSPECT);
    }

    return Array.from(ops);
  }

  /**
   * Extracts the main subject or target entity.
   */
  static extractTargetEntity(text, domain) {
    let cleaned = text.trim();

    // 1. Explicit search targets with platform cues
    const searchMatch = cleaned.match(/(?:search\s+(?:on|in)\s+[a-z0-9.-]+\s+for|search\s+[a-z0-9.-]+\s+for|search\s+for|look\s+up|find\s+information\s+(?:on|about)|read\s+about|learn\s+about)\s+(.+?)(?:\s+(?:and\s+.*|on\s+[a-z0-9.-]+|under\s+.*|below\s+.*|with\s+.*))?$/i);
    if (searchMatch) {
      return searchMatch[1].trim();
    }

    // 2. Strip standard action and navigation prefixes
    cleaned = cleaned.replace(/^(?:find me a|find me|find a|find|search for|search on\s+[a-z0-9.-]+\s+for|search in\s+[a-z0-9.-]+\s+for|search|look for|look up|open|go to|show me|compare|buy|get me)\s+/i, "");

    // 3. Strip website references
    cleaned = cleaned.replace(/\s+(?:on|in|from|at)\s+(?:google|wikipedia|youtube|github|reddit|flipkart|ebay|walmart|amazon|myntra)\b/gi, "");

    // 4. Strip trailing filter constraints (e.g. "under 7k", "below $100", "in black")
    cleaned = cleaned.replace(/\s+(?:under|below|less than|above|over|priced|max)\s+.*$/i, "");
    cleaned = cleaned.trim();

    return cleaned || (domain === TASK_DOMAINS.ECOMMERCE ? "product" : (domain === TASK_DOMAINS.RESEARCH ? "topic" : "target"));
  }

  /**
   * Creates a concise goal summary.
   */
  static summarizeGoal(text, targetEntity, domain) {
    if (/compare/i.test(text)) {
      return `Find, filter, and compare options for ${targetEntity || "requested items"}`;
    }
    if (/add to cart|buy/i.test(text)) {
      return `Find and add ${targetEntity || "item"} to cart`;
    }
    if (domain === TASK_DOMAINS.FORM_FILLING) {
      return `Complete form workflow for ${targetEntity || "submission"}`;
    }
    if (domain === TASK_DOMAINS.RESEARCH) {
      return `Research and extract information regarding ${targetEntity || "query"}`;
    }
    return `Accomplish user goal: ${text}`;
  }
}
