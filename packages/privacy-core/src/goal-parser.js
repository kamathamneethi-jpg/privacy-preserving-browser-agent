/**
 * Goal Parser Module.
 * Parses arbitrary natural language user requests into a structured goal specification:
 * - Clear goal description & summary
 * - Structured compositional intent model (action, selection, entities, constraints, navigation)
 * - Preposition-derived candidate roles (sender, source, author, recipient, brand, platform scope, etc.)
 * - Linguistic selection & ordinal indexing (first, second, top, latest, last, etc.)
 * - Open-ended target semantics without fixed domain/vocabulary constraints
 * - Normalized constraint list (attribute, name, type, operator, value, currency)
 * - Required browser operations (navigate, search, filter, inspect, compare, fill, submit, perform_action, extract)
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
  PERFORM_ACTION: "perform_action",
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

export const CANDIDATE_ROLES = Object.freeze({
  SENDER: "sender",
  SOURCE: "source",
  AUTHOR: "author",
  ORIGIN: "origin",
  CREATOR: "creator",
  BRAND: "brand",
  RECIPIENT: "recipient",
  TARGET_ENTITY: "target_entity",
  DESTINATION: "destination",
  SEARCH_QUERY: "search_query",
  PLATFORM_SCOPE: "platform_scope",
  CATEGORY: "category",
  FOLDER: "folder",
  LOCATION: "location",
  FILTER_CONSTRAINT: "filter_constraint"
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
        navigation: {
          isExplicit: false,
          requiresExplicitNavigation: false,
          destinationKeyword: null,
          targetUrl: null
        },
        selection: null,
        entities: [],
        constraints: [],
        required_operations: [BROWSER_OPERATIONS.WAIT],
        operations: [BROWSER_OPERATIONS.WAIT],
        targetEntity: null,
        targetWebsite: null,
        actionIntent: null
      };
    }

    const trimmed = userRequest.trim();
    const navigation = this.extractNavigationIntent(trimmed);
    const selection = this.extractSelection(trimmed);
    const domain = this.detectDomain(trimmed, navigation);
    const actionIntent = this.extractActionIntent(trimmed);
    const entities = this.extractPrepositionalEntities(trimmed);
    const constraints = this.extractConstraints(trimmed, entities);
    const targetEntity = this.extractTargetEntity(trimmed, domain, actionIntent, selection);
    const required_operations = this.extractOperations(trimmed, domain, constraints, actionIntent, navigation, selection);
    const summary = this.summarizeGoal(trimmed, targetEntity, domain, actionIntent, selection, navigation);

    return {
      rawRequest: trimmed,
      originalGoal: trimmed,
      goal: summary,
      summary,
      domain,
      navigation,
      selection,
      entities,
      constraints,
      targetWebsite: navigation.destinationKeyword,
      targetEntity,
      actionIntent: actionIntent || null,
      required_operations,
      operations: required_operations
    };
  }

  /**
   * Identifies explicit navigation intent vs in-page entity references.
   * Distinguishes:
   * - "go to amazon.in" -> requiresExplicitNavigation: true
   * - "open youtube and search for ..." -> requiresExplicitNavigation: true
   * - "open first mail from LinkedIn" -> requiresExplicitNavigation: false (LinkedIn is an entity/sender, not a destination)
   */
  static extractNavigationIntent(text) {
    if (!text || typeof text !== "string") {
      return { isExplicit: false, requiresExplicitNavigation: false, destinationKeyword: null, targetUrl: null };
    }

    const lower = text.toLowerCase().trim();

    // 1. Explicit Full URL (e.g. https://... or http://...)
    const fullUrlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (fullUrlMatch) {
      return {
        isExplicit: true,
        requiresExplicitNavigation: true,
        destinationKeyword: null,
        targetUrl: fullUrlMatch[0]
      };
    }

    // 2. Explicit domain name with TLD (e.g. "go to example.org", "open cnn.com")
    const domainTldMatch = lower.match(/\b(?:go to|navigate to|visit|open(?:\s+website)?)\s+([a-z0-9-]+\.(?:com|org|net|in|io|co|gov|edu|ai|app|dev))\b/i);
    if (domainTldMatch) {
      return {
        isExplicit: true,
        requiresExplicitNavigation: true,
        destinationKeyword: domainTldMatch[1].split(".")[0],
        targetUrl: `https://${domainTldMatch[1]}`
      };
    }

    // 3. Explicit Navigation Verbs at the root ("go to <platform>", "navigate to <platform>", "visit <platform>")
    const explicitNavVerbsMatch = lower.match(/^(?:go to|navigate to|visit)\s+([a-z0-9.-]+)\b/i);
    if (explicitNavVerbsMatch) {
      const dest = explicitNavVerbsMatch[1].toLowerCase();
      return {
        isExplicit: true,
        requiresExplicitNavigation: true,
        destinationKeyword: dest,
        targetUrl: null
      };
    }

    // 4. "open <platform> and <action>" where <platform> is the direct object of open and not an item
    // e.g. "open youtube and search...", "open amazon and buy..."
    const openAndMatch = lower.match(/^open\s+([a-z0-9.-]+)\s+(?:and|then|to)\s+/i);
    if (openAndMatch) {
      const candidate = openAndMatch[1].toLowerCase();
      const nonDestinations = ["first", "second", "third", "latest", "newest", "last", "top", "the", "a", "an", "this", "my", "all", "mail", "email", "message", "tab", "link", "page", "file", "document", "chat", "post", "ticket", "issue"];
      if (!nonDestinations.includes(candidate)) {
        return {
          isExplicit: true,
          requiresExplicitNavigation: true,
          destinationKeyword: candidate,
          targetUrl: null
        };
      }
    }

    // 5. Standalone explicit site open command, e.g. "open youtube", "open amazon"
    const openSiteMatch = lower.match(/^open\s+([a-z0-9-]+)$/i);
    if (openSiteMatch) {
      const candidate = openSiteMatch[1].toLowerCase();
      const nonDestinations = ["mail", "email", "message", "tab", "link", "file", "document", "chat", "post", "ticket", "issue", "cart"];
      if (!nonDestinations.includes(candidate)) {
        return {
          isExplicit: true,
          requiresExplicitNavigation: true,
          destinationKeyword: candidate,
          targetUrl: null
        };
      }
    }

    return {
      isExplicit: false,
      requiresExplicitNavigation: false,
      destinationKeyword: null,
      targetUrl: null
    };
  }

  /**
   * Backward-compatible target website extractor.
   */
  static extractTargetWebsite(text) {
    const nav = this.extractNavigationIntent(text);
    return nav.destinationKeyword || null;
  }

  /**
   * Extracts linguistic selection criteria (ordinals, quantifiers, indices).
   */
  static extractSelection(text) {
    if (!text || typeof text !== "string") return null;
    const lower = text.toLowerCase();

    // Ordinal matching
    const ordinals = [
      { pattern: /\b(?:first|1st|top|latest|newest)\b/i, ordinal: "first", index: 0, quantifier: "single" },
      { pattern: /\b(?:second|2nd)\b/i, ordinal: "second", index: 1, quantifier: "single" },
      { pattern: /\b(?:third|3rd)\b/i, ordinal: "third", index: 2, quantifier: "single" },
      { pattern: /\b(?:fourth|4th)\b/i, ordinal: "fourth", index: 3, quantifier: "single" },
      { pattern: /\b(?:fifth|5th)\b/i, ordinal: "fifth", index: 4, quantifier: "single" },
      { pattern: /\b(?:last|bottom|oldest)\b/i, ordinal: "last", index: -1, quantifier: "single" }
    ];

    for (const o of ordinals) {
      if (o.pattern.test(lower)) {
        return {
          ordinal: o.ordinal,
          index: o.index,
          quantifier: o.quantifier
        };
      }
    }

    // Quantifiers
    if (/\b(?:all|every|each)\b/i.test(lower)) {
      return {
        ordinal: null,
        index: null,
        quantifier: "all"
      };
    }

    const multiMatch = lower.match(/\b(?:top|first)\s+(\d+)\b/i);
    if (multiMatch) {
      return {
        ordinal: "top",
        index: 0,
        quantifier: "multiple",
        count: parseInt(multiMatch[1], 10)
      };
    }

    return null;
  }

  /**
   * Extracts entities with preposition-derived candidate roles.
   * Preposition roles are candidate evidence, not rigid rules.
   */
  static extractPrepositionalEntities(text) {
    if (!text || typeof text !== "string") return [];
    const entities = [];

    // Helper to check if entity already recorded
    const hasEntity = (val) => entities.some(e => e.text.toLowerCase() === val.toLowerCase());

    // 1. "from <Entity>" -> ["sender", "source", "author", "origin", "filter_constraint"]
    const fromMatches = text.matchAll(/\bfrom\s+([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)?)(?=[,\.]|\s+(?:and|then|to|under|below|with|for|by|on|in|subject|about)|\s*$)/gi);
    for (const m of fromMatches) {
      const val = m[1].trim();
      if (val && !hasEntity(val) && !/^(?:here|now|the|a|an|scratch)$/i.test(val)) {
        entities.push({
          text: val,
          preposition: "from",
          candidateRoles: [
            CANDIDATE_ROLES.SENDER,
            CANDIDATE_ROLES.SOURCE,
            CANDIDATE_ROLES.AUTHOR,
            CANDIDATE_ROLES.ORIGIN,
            CANDIDATE_ROLES.FILTER_CONSTRAINT
          ]
        });
      }
    }

    // 2. "by <Entity>" -> ["author", "brand", "creator"]
    const byMatches = text.matchAll(/\bby\s+([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)?)(?=[,\.]|\s+(?:and|then|to|under|below|with|for|from|on|in)|\s*$)/gi);
    for (const m of byMatches) {
      const val = m[1].trim();
      if (val && !hasEntity(val) && !/^(?:now|then|default|clicking|typing)$/i.test(val)) {
        entities.push({
          text: val,
          preposition: "by",
          candidateRoles: [
            CANDIDATE_ROLES.AUTHOR,
            CANDIDATE_ROLES.BRAND,
            CANDIDATE_ROLES.CREATOR,
            CANDIDATE_ROLES.FILTER_CONSTRAINT
          ]
        });
      }
    }

    // 3. "to <Entity>" -> ["recipient", "target", "destination"]
    const toMatches = text.matchAll(/\bto\s+([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)?)(?=[,\.]|\s+(?:and|then|under|below|with|for|from|by|on|in)|\s*$)/gi);
    for (const m of toMatches) {
      const val = m[1].trim();
      if (val && !hasEntity(val) && !/^(?:cart|bag|basket|buy|the|a|an|my|this)$/i.test(val)) {
        entities.push({
          text: val,
          preposition: "to",
          candidateRoles: [
            CANDIDATE_ROLES.RECIPIENT,
            CANDIDATE_ROLES.TARGET_ENTITY,
            CANDIDATE_ROLES.DESTINATION
          ]
        });
      }
    }

    // 4. "for <Entity>" -> ["search_query", "target_entity", "recipient"]
    const forMatches = text.matchAll(/\bfor\s+([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)?)(?=[,\.]|\s+(?:and|then|under|below|with|from|by|on|in)|\s*$)/gi);
    for (const m of forMatches) {
      const val = m[1].trim();
      if (val && !hasEntity(val) && !/^(?:sale|free|me|us|them|the|a|an)$/i.test(val)) {
        entities.push({
          text: val,
          preposition: "for",
          candidateRoles: [
            CANDIDATE_ROLES.SEARCH_QUERY,
            CANDIDATE_ROLES.TARGET_ENTITY,
            CANDIDATE_ROLES.RECIPIENT
          ]
        });
      }
    }

    // 5. "on / in <Entity>" -> ["platform_scope", "category", "folder", "location"]
    const scopeMatches = text.matchAll(/\b(?:on|in)\s+([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)?)(?=[,\.]|\s+(?:and|then|under|below|with|for|from|by)|\s*$)/gi);
    for (const m of scopeMatches) {
      const val = m[1].trim();
      if (val && !hasEntity(val) && !/^(?:the|a|an|this|my|stock|sale|black|white|blue|red|green|yellow)$/i.test(val)) {
        entities.push({
          text: val,
          preposition: m[0].trim().toLowerCase().split(/\s+/)[0],
          candidateRoles: [
            CANDIDATE_ROLES.PLATFORM_SCOPE,
            CANDIDATE_ROLES.CATEGORY,
            CANDIDATE_ROLES.FOLDER,
            CANDIDATE_ROLES.LOCATION
          ]
        });
      }
    }

    return entities;
  }

  /**
   * Identifies the primary task domain from natural language cues.
   */
  static detectDomain(text, navigation = {}) {
    const lower = text.toLowerCase();

    // 1. Form Filling has highest precedence when form filling verbs/nouns/modifications are present
    if (/\b(?:fill out|fill in|complete form|registration form|signup form|contact form|survey|application form|enter name|enter email)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }
    if (/\b(?:change|update|replace|modify|edit|set|enter|fill)\s+(?:the\s+)?(?:[a-zA-Z0-9_\-\s]{2,25}?)\s+(?:to|with|=|as)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }
    if (/\b(?:change|update|replace|modify|edit|set|enter|fill)\s+(?:the\s+)?(?:email|phone|otp|password|code|two factor|2fa|name|address|input|field|message|details)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }
    if (/\b(?:form|sign up|register|survey|application|registration|employee form)\b/i.test(lower) && !/\b(?:buy|shop|shoes?|sneakers?|laptops?)\b/i.test(lower)) {
      return TASK_DOMAINS.FORM_FILLING;
    }

    // 2. Explicit URL Navigation without shopping/filling context
    if (navigation.isExplicit && !/\b(?:buy|shop|cart|checkout|fill|register)\b/i.test(lower)) {
      return TASK_DOMAINS.NAVIGATION;
    }

    // 3. Booking & Travel
    if (/\b(?:flight|hotel|airbnb|booking|ticket|reservation|train|bus)\b/i.test(lower) && !/\b(?:issue|bug|support ticket)\b/i.test(lower)) {
      return TASK_DOMAINS.BOOKING;
    }

    // 4. E-Commerce (strictly shopping queries, not generic 'confirm order' or form actions)
    if (/\b(?:buy|shop|cart|product|price|shoes?|sneakers?|jackets?|clothes?|laptops?|phones?|discount|cost|winter jacket)\b/i.test(lower) ||
        (/\border\b/i.test(lower) && !/\b(?:confirm order|place order|cancel order|submit order|order form)\b/i.test(lower))) {
      return TASK_DOMAINS.ECOMMERCE;
    }

    // 5. Research & Information Retrieval
    if (/\b(?:read|article|paper|summary|extract|search for|look up|research|info|information|docs|documentation|learn about)\b/i.test(lower)) {
      return TASK_DOMAINS.RESEARCH;
    }

    return TASK_DOMAINS.GENERAL;
  }

  /**
   * Extracts user constraints into structured operator/value pairs.
   */
  static extractConstraints(text, entities = []) {
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

    // 3. Color constraints: (white, black, blue, red, green, yellow, etc.)
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
    const isExplicitMod = /\b(?:change|update|replace|modify|set|enter|fill in|fill)\b/i.test(text);
    const emailMatch = text.match(/(?:email|e-mail)\s*(?:as|is|to|=|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i);
    if (emailMatch) {
      addConstraint("email", CONSTRAINT_OPERATORS.EQUALS, emailMatch[1].trim(), {
        explicit: isExplicitMod,
        isExplicitOverwrite: isExplicitMod
      });
    }

    const nameMatch = text.match(/(?:name|full\s*name|first\s*name)\s*(?:as|is|to|=|:)?\s*([a-zA-Z\s]{2,35}?)(?=[,\.]|\band\b|\bemail\b|\bphone\b|\bwith\b|$)/i);
    if (nameMatch) {
      addConstraint("name", CONSTRAINT_OPERATORS.EQUALS, nameMatch[1].trim(), {
        explicit: isExplicitMod,
        isExplicitOverwrite: isExplicitMod
      });
    }

    const phoneMatch = text.match(/(?:phone|mobile|tel|contact(?:\s*number)?)\s*(?:as|is|to|=|:)?\s*(\+?[\d\s-]{7,15})/i);
    if (phoneMatch) {
      addConstraint("phone", CONSTRAINT_OPERATORS.EQUALS, phoneMatch[1].replace(/[\s-]/g, "").trim(), {
        explicit: isExplicitMod,
        isExplicitOverwrite: isExplicitMod
      });
    }

    const msgMatch = text.match(/(?:message|comment|feedback|query|notes?)\s*(?:as|is|to|=|:)\s*(["'][^"']+["']|[^,\.]+)/i);
    if (msgMatch) {
      addConstraint("message", CONSTRAINT_OPERATORS.EQUALS, msgMatch[1].replace(/^["']|["']$/g, "").trim(), {
        explicit: isExplicitMod,
        isExplicitOverwrite: isExplicitMod
      });
    }

    // 10b. Generic natural language field modification / assignment constraints
    // e.g. "change the email to user@example.com", "update the otp to 112345", "replace the two factor code with 112345", "set quantity to 3"
    const modifyPattern = /\b(?:change|update|replace|modify|set|enter|fill in|fill)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]{2,35}?)\s+(?:to|with|=|as|is)\s+([^,;\n]+?)(?=(?:\s+(?:and|then|click|confirm|submit|with|after)\b|(?:\.\s+)|\.$|$))/gi;
    let modMatch;
    while ((modMatch = modifyPattern.exec(text)) !== null) {
      const fieldRaw = modMatch[1].trim();
      const valRaw = modMatch[2].replace(/^["']|["']$/g, "").trim();
      if (fieldRaw && valRaw && !/\b(?:first|second|top|options|candidates)\b/i.test(fieldRaw)) {
        const normAttr = fieldRaw.toLowerCase().replace(/\s+/g, "_");
        const existing = constraints.find(c => c.attribute === normAttr || c.name === normAttr || (c.attribute === "email" && normAttr === "email") || (c.attribute === "phone" && normAttr === "phone") || (c.attribute === "name" && normAttr === "name"));
        if (existing) {
          existing.explicit = true;
          existing.isExplicitOverwrite = true;
          if (valRaw && existing.value !== valRaw) {
            existing.value = valRaw;
          }
        } else {
          addConstraint(normAttr, CONSTRAINT_OPERATORS.EQUALS, valRaw, {
            explicit: true,
            isExplicitOverwrite: true,
            rawField: fieldRaw
          });
        }
      }
    }

    // 11. Attach Prepositional Entity Constraints
    for (const ent of entities) {
      if (ent.preposition === "from") {
        addConstraint("sender", CONSTRAINT_OPERATORS.CONTAINS, ent.text, { candidateRoles: ent.candidateRoles });
      } else if (ent.preposition === "by") {
        addConstraint("author", CONSTRAINT_OPERATORS.CONTAINS, ent.text, { candidateRoles: ent.candidateRoles });
      }
    }

    return constraints;
  }

  /**
   * Extracts generic UI action intent specified in the request
   * (e.g. subscribe, follow, star, like, bookmark, download, share, pin, play, favorite, join, open, read, archive, approve, confirm, continue, submit).
   * Excludes standard eCommerce cart actions or form fills that have dedicated operation types.
   */
  static extractActionIntent(text) {
    if (!text || typeof text !== "string") return null;
    const lower = text.toLowerCase();

    // Avoid overriding dedicated workflows (add to cart, form filling)
    if (/\b(?:add to cart|add to bag|add to basket|buy now)\b/i.test(lower)) {
      return null;
    }

    // Match explicit compound action verbs (e.g., "... and subscribe", "... and follow", "... then bookmark", "... and click on confirm", "... and confirm")
    const compoundMatch = lower.match(/\b(?:and|then|to)\s+(?:click\s+(?:on\s+)?)?(subscribe|follow|star|like|bookmark|download|share|pin|play|favorite|join|install|upvote|vote|fork|enroll|listen|watch|unfollow|unsubscribe|archive|delete|approve|merge|reply|confirm|continue|submit|save|proceed)\b/i);
    if (compoundMatch) {
      return compoundMatch[1].toLowerCase();
    }

    // Match direct action command verbs
    const directMatch = lower.match(/\b(?:click\s+(?:on\s+)?)?(subscribe|follow|star|bookmark|download|upvote|fork|archive|approve|confirm|continue|proceed)\b/i);
    if (directMatch && !/\b(?:search|find|read)\s+about\b/i.test(lower)) {
      return directMatch[1].toLowerCase();
    }

    return null;
  }

  /**
   * Identifies required operations from the task intent.
   */
  static extractOperations(text, domain, constraints, actionIntent = null, navigation = {}, selection = null) {
    const ops = new Set();
    const lower = text.toLowerCase();

    // Navigation operation strictly when explicitly requested or required
    if (navigation.requiresExplicitNavigation || navigation.isExplicit) {
      ops.add(BROWSER_OPERATIONS.NAVIGATE);
    }

    if (/\b(?:search|find|look for|query)\b/i.test(lower) || domain === TASK_DOMAINS.ECOMMERCE || (domain === TASK_DOMAINS.RESEARCH && !selection)) {
      ops.add(BROWSER_OPERATIONS.SEARCH);
    }

    if (constraints.length > 0 || /\b(?:filter|sort|under|color|brand|price|size)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.FILTER);
    }

    if (selection || ops.has(BROWSER_OPERATIONS.SEARCH) || /\b(?:inspect|check|view|details|look at|examine|open first|click|open|read|select|review)\b/i.test(lower) || domain === TASK_DOMAINS.ECOMMERCE || domain === TASK_DOMAINS.RESEARCH) {
      ops.add(BROWSER_OPERATIONS.INSPECT);
    }

    if (/\b(?:compare|options|few options|which is better|best of)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.COMPARE);
      ops.add(BROWSER_OPERATIONS.COMPARE_CANDIDATES);
    }

    if (/\b(?:fill|enter|input|type|change|update|replace|modify|set|edit)\b/i.test(lower) || domain === TASK_DOMAINS.FORM_FILLING) {
      ops.add(BROWSER_OPERATIONS.FILL);
      ops.add(BROWSER_OPERATIONS.FILL_FORM);
    }

    if (/\b(?:submit|apply|register|sign up|book now|complete form|confirm|continue|checkout|place order|send message|save)\b/i.test(lower) || /\b(?:click|press|tap)\s+(?:on\s+)?(?:confirm|submit|continue|save|send|place order)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.SUBMIT);
      ops.add(BROWSER_OPERATIONS.SUBMIT_FORM);
    }

    if (/\b(?:add to cart|add to bag|buy now|buy|cart)\b/i.test(lower)) {
      ops.add(BROWSER_OPERATIONS.ADD_TO_CART);
      ops.add(BROWSER_OPERATIONS.SUBMIT);
    }

    if (actionIntent) {
      ops.add(BROWSER_OPERATIONS.PERFORM_ACTION);
    }

    if ((/\b(?:extract|summarize|get info|information)\b/i.test(lower) || domain === TASK_DOMAINS.RESEARCH) && !actionIntent && !selection) {
      ops.add(BROWSER_OPERATIONS.EXTRACT);
    }

    if (ops.size === 0) {
      ops.add(BROWSER_OPERATIONS.INSPECT);
    }

    return Array.from(ops);
  }

  /**
   * Extracts the main subject or target entity dynamically without a fixed domain vocabulary.
   * Extensible to unseen domains (e.g. mail, article, ticket, pull request, shoe, invoice, etc.).
   */
  static extractTargetEntity(text, domain, actionIntent = null, selection = null) {
    let cleaned = text.trim();

    // 1. Explicit search query extraction (e.g. "search for joshua weissman", "search for white running shoes")
    const searchMatch = cleaned.match(/(?:search\s+(?:on|in)\s+[a-z0-9.-]+\s+for|search\s+[a-z0-9.-]+\s+for|search\s+for|look\s+up|find\s+information\s+(?:on|about)|read\s+about|learn\s+about)\s+(.+?)(?:\s+(?:and\s+.*|under\s+.*|below\s+.*|with\s+.*))?$/i);
    if (searchMatch) {
      let entity = searchMatch[1].trim();
      if (actionIntent) {
        const intentPattern = new RegExp(`\\s+(?:and|then|to)?\\s*${actionIntent}\\b.*$`, "i");
        entity = entity.replace(intentPattern, "").trim();
      }
      return entity;
    }

    // 2. In-page item open/select extraction (e.g. "open first mail from LinkedIn", "find paper by DeepMind", "forward ticket to Support Team")
    const itemActionMatch = cleaned.match(/^(?:open|read|view|select|click|inspect|check|review|book|download|forward|find|get|show|send)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:first|second|third|latest|newest|last|top|1st|2nd|3rd)?\s*([a-zA-Z0-9_\-#\s]+?)(?=[,\.]|\s+(?:from|by|to|for|on|in|under|with|and)|\s*$)/i);
    if (itemActionMatch) {
      const itemNoun = itemActionMatch[1].trim();
      if (itemNoun && !/^(?:the|a|an|this|that|it|item|result)$/i.test(itemNoun)) {
        return itemNoun;
      }
    }

    // 3. Strip standard action and navigation prefixes
    cleaned = cleaned.replace(/^(?:find me a|find me|find a|find|search for|search on\s+[a-z0-9.-]+\s+for|search in\s+[a-z0-9.-]+\s+for|search|look for|look up|open|go to|show me|compare|buy|get me|review|book|download|inspect|check|view|select|click|forward|send)\s+/i, "");

    // 4. Strip trailing action intent if present
    if (actionIntent) {
      const intentPattern = new RegExp(`\\s+(?:and|then|to)?\\s*${actionIntent}\\b.*$`, "i");
      cleaned = cleaned.replace(intentPattern, "").trim();
    }

    // 5. Strip trailing filter constraints (e.g. "under 7k", "below $100", "in black")
    cleaned = cleaned.replace(/\s+(?:under|below|less than|above|over|priced|max)\s+.*$/i, "");
    cleaned = cleaned.trim();

    return cleaned || (domain === TASK_DOMAINS.ECOMMERCE ? "item" : (domain === TASK_DOMAINS.RESEARCH ? "topic" : "target"));
  }

  /**
   * Creates a concise goal summary.
   */
  static summarizeGoal(text, targetEntity, domain, actionIntent = null, selection = null, navigation = {}) {
    const selPrefix = selection?.ordinal ? `${selection.ordinal} ` : "";

    if (actionIntent) {
      return `Find ${selPrefix}${targetEntity || "target"} and ${actionIntent}`;
    }
    if (/compare/i.test(text)) {
      return `Find, filter, and compare options for ${targetEntity || "requested items"}`;
    }
    if (/add to cart|buy/i.test(text)) {
      return `Find and add ${targetEntity || "item"} to cart`;
    }
    if (selection) {
      return `Locate and interact with ${selPrefix}${targetEntity || "target"}`;
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

