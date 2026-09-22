import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GoalParser,
  TaskPlanner,
  GoalCompletionChecker,
  ExecutionStateManager,
  CANDIDATE_ROLES,
  BROWSER_OPERATIONS,
  TASK_DOMAINS
} from "../packages/privacy-core/src/index.js";

import { extractNavigationUrl, deriveGeneralizedFallbackAction } from "../apps/extension/src/popup.js";

describe("Generalized Intent & Context-Aware Architecture Test Suite", () => {

  // ==========================================================================
  // Category 1: Entity vs Destination Distinction
  // ==========================================================================
  describe("Category 1: Entity vs Destination Distinction", () => {
    it("1.1: 'open first mail from LinkedIn' treats LinkedIn as sender ENTITY, not destination URL", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");

      assert.equal(goal.navigation.requiresExplicitNavigation, false, "Must NOT require explicit navigation");
      assert.equal(goal.navigation.isExplicit, false, "Must NOT be explicit navigation");
      assert.equal(goal.targetWebsite, null, "Target website must be null");
      assert.equal(goal.targetEntity, "mail", "Target entity must be 'mail'");
      assert.equal(goal.selection?.ordinal, "first", "Ordinal must be 'first'");
      assert.equal(goal.selection?.index, 0, "Index must be 0");

      const linkedInEntity = goal.entities.find(e => e.text.toLowerCase() === "linkedin");
      assert.ok(linkedInEntity, "LinkedIn entity must be extracted");
      assert.ok(linkedInEntity.candidateRoles.includes(CANDIDATE_ROLES.SENDER), "Must include sender candidate role");
      assert.ok(linkedInEntity.candidateRoles.includes(CANDIDATE_ROLES.FILTER_CONSTRAINT), "Must include filter constraint candidate role");
    });

    it("1.2: 'read message from Alice on Slack' extracts Alice as sender and Slack as scope", () => {
      const goal = GoalParser.parse("read message from Alice on Slack");

      assert.equal(goal.navigation.requiresExplicitNavigation, false);
      assert.equal(goal.targetEntity, "message");

      const alice = goal.entities.find(e => e.text.toLowerCase() === "alice");
      assert.ok(alice, "Alice entity must be extracted");
      assert.ok(alice.candidateRoles.includes(CANDIDATE_ROLES.SENDER));

      const slack = goal.entities.find(e => e.text.toLowerCase() === "slack");
      assert.ok(slack, "Slack entity must be extracted");
      assert.ok(slack.candidateRoles.includes(CANDIDATE_ROLES.PLATFORM_SCOPE));
    });

    it("1.3: 'find paper by DeepMind' extracts DeepMind as author/creator, NOT destination", () => {
      const goal = GoalParser.parse("find paper by DeepMind");

      assert.equal(goal.navigation.requiresExplicitNavigation, false);
      assert.equal(goal.targetEntity, "paper");

      const deepmind = goal.entities.find(e => e.text.toLowerCase() === "deepmind");
      assert.ok(deepmind, "DeepMind entity must be extracted");
      assert.ok(deepmind.candidateRoles.includes(CANDIDATE_ROLES.AUTHOR));
      assert.ok(deepmind.candidateRoles.includes(CANDIDATE_ROLES.CREATOR));
    });

    it("1.4: 'forward ticket to Support Team' extracts Support Team as recipient", () => {
      const goal = GoalParser.parse("forward ticket to Support Team");

      assert.equal(goal.navigation.requiresExplicitNavigation, false);
      assert.equal(goal.targetEntity, "ticket");

      const support = goal.entities.find(e => e.text.toLowerCase() === "support team");
      assert.ok(support, "Support Team entity must be extracted");
      assert.ok(support.candidateRoles.includes(CANDIDATE_ROLES.RECIPIENT));
    });
  });

  // ==========================================================================
  // Category 2: Prepositional Candidate Role Evidence
  // ==========================================================================
  describe("Category 2: Prepositional Candidate Role Evidence", () => {
    it("2.1: 'from' extracts sender, source, author, origin candidate roles", () => {
      const entities = GoalParser.extractPrepositionalEntities("check invoice from Acme Corp");
      const acme = entities.find(e => e.text.toLowerCase() === "acme corp");
      assert.ok(acme);
      assert.ok(acme.candidateRoles.includes("sender"));
      assert.ok(acme.candidateRoles.includes("source"));
      assert.ok(acme.candidateRoles.includes("author"));
      assert.ok(acme.candidateRoles.includes("origin"));
    });

    it("2.2: 'by' extracts author, brand, creator candidate roles", () => {
      const entities = GoalParser.extractPrepositionalEntities("inspect shoes by Nike");
      const nike = entities.find(e => e.text.toLowerCase() === "nike");
      assert.ok(nike);
      assert.ok(nike.candidateRoles.includes("brand"));
      assert.ok(nike.candidateRoles.includes("author"));
      assert.ok(nike.candidateRoles.includes("creator"));
    });

    it("2.3: 'to' extracts recipient, target candidate roles", () => {
      const entities = GoalParser.extractPrepositionalEntities("send reminder to Engineering Lead");
      const lead = entities.find(e => e.text.toLowerCase() === "engineering lead");
      assert.ok(lead);
      assert.ok(lead.candidateRoles.includes("recipient"));
      assert.ok(lead.candidateRoles.includes("target_entity"));
    });

    it("2.4: 'on' / 'in' extracts platform_scope, category, folder, location candidate roles", () => {
      const entities = GoalParser.extractPrepositionalEntities("review items in Inbox");
      const inbox = entities.find(e => e.text.toLowerCase() === "inbox");
      assert.ok(inbox);
      assert.ok(inbox.candidateRoles.includes("folder") || inbox.candidateRoles.includes("category") || inbox.candidateRoles.includes("platform_scope"));
    });
  });

  // ==========================================================================
  // Category 3: Linguistic Ordinals, Quantifiers, and Selection Indices
  // ==========================================================================
  describe("Category 3: Linguistic Ordinals, Quantifiers, and Selection Indices", () => {
    it("3.1: Extracts 'first', '1st', 'top', 'latest', 'newest' with index 0", () => {
      const g1 = GoalParser.parse("open first email");
      assert.equal(g1.selection?.ordinal, "first");
      assert.equal(g1.selection?.index, 0);

      const g2 = GoalParser.parse("click 1st search result");
      assert.equal(g2.selection?.ordinal, "first");
      assert.equal(g2.selection?.index, 0);

      const g3 = GoalParser.parse("view latest update");
      assert.equal(g3.selection?.ordinal, "first");
      assert.equal(g3.selection?.index, 0);
    });

    it("3.2: Extracts 'second', '2nd' with index 1", () => {
      const g1 = GoalParser.parse("inspect second row");
      assert.equal(g1.selection?.ordinal, "second");
      assert.equal(g1.selection?.index, 1);

      const g2 = GoalParser.parse("select 2nd item");
      assert.equal(g2.selection?.ordinal, "second");
      assert.equal(g2.selection?.index, 1);
    });

    it("3.3: Extracts 'third', '3rd' with index 2", () => {
      const g = GoalParser.parse("click third result");
      assert.equal(g.selection?.ordinal, "third");
      assert.equal(g.selection?.index, 2);
    });

    it("3.4: Extracts 'last', 'bottom', 'oldest' with index -1", () => {
      const g1 = GoalParser.parse("open last document");
      assert.equal(g1.selection?.ordinal, "last");
      assert.equal(g1.selection?.index, -1);

      const g2 = GoalParser.parse("view oldest log");
      assert.equal(g2.selection?.ordinal, "last");
      assert.equal(g2.selection?.index, -1);
    });

    it("3.5: Extracts 'all', 'every' with quantifier 'all'", () => {
      const g = GoalParser.parse("select all checkboxes");
      assert.equal(g.selection?.quantifier, "all");
    });
  });

  // ==========================================================================
  // Category 4: Open-Ended Domain & Target Vocabulary Extensibility
  // ==========================================================================
  describe("Category 4: Open-Ended Domain & Target Vocabulary Extensibility", () => {
    it("4.1: Extracts unseen target entity 'invoice'", () => {
      const goal = GoalParser.parse("open invoice #1042");
      assert.equal(goal.targetEntity, "invoice #1042");
    });

    it("4.2: Extracts unseen target entity 'pull request'", () => {
      const goal = GoalParser.parse("inspect pull request #89");
      assert.equal(goal.targetEntity, "pull request #89");
    });

    it("4.3: Extracts unseen target entity 'patient record'", () => {
      const goal = GoalParser.parse("review patient record for John Doe");
      assert.equal(goal.targetEntity, "patient record");
    });

    it("4.4: Extracts unseen target entity 'flight'", () => {
      const goal = GoalParser.parse("book flight to London");
      assert.equal(goal.targetEntity, "flight");
    });

    it("4.5: Extracts unseen target entity 'resume' with actionIntent 'download'", () => {
      const goal = GoalParser.parse("download resume from Candidate Alex");
      assert.equal(goal.targetEntity, "resume");
      assert.equal(goal.actionIntent, "download");
    });
  });

  // ==========================================================================
  // Category 5: Context-Aware & Current-Page-First Planning
  // ==========================================================================
  describe("Category 5: Context-Aware & Current-Page-First Planning", () => {
    it("5.1: When active page is external web app, 'open first mail from LinkedIn' plans WITHOUT navigate task", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const currentBrowserContext = {
        url: "https://mail.google.com/mail/u/0/#inbox",
        title: "Inbox (24) - Mail",
        isInternalPage: false
      };

      const planner = new TaskPlanner(goal, currentBrowserContext);
      const taskTypes = planner.tasks.map(t => t.type);

      assert.ok(!taskTypes.includes("navigate"), "Must NOT include navigate task when already on web application");
      assert.ok(taskTypes.includes("select_candidate"), "Must include select_candidate task directly");
      assert.ok(taskTypes.includes("verify_goal"), "Must conclude with verify_goal");
    });

    it("5.2: When starting on chrome://newtab internal tab, planning includes navigate task", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const currentBrowserContext = {
        url: "chrome://newtab",
        title: "New Tab",
        isInternalPage: true
      };

      const planner = new TaskPlanner(goal, currentBrowserContext);
      const taskTypes = planner.tasks.map(t => t.type);

      assert.ok(taskTypes.includes("navigate"), "Must include navigate task when starting on internal new tab");
    });
  });

  // ==========================================================================
  // Category 6: Explicit Navigation Honored
  // ==========================================================================
  describe("Category 6: Explicit Navigation Honored", () => {
    it("6.1: 'go to https://example.org/dashboard' honors explicit navigation", () => {
      const goal = GoalParser.parse("go to https://example.org/dashboard");
      assert.equal(goal.navigation.requiresExplicitNavigation, true);
      assert.equal(goal.navigation.isExplicit, true);
      assert.equal(goal.navigation.targetUrl, "https://example.org/dashboard");

      const navUrl = extractNavigationUrl("go to https://example.org/dashboard", "https://mail.google.com", goal);
      assert.equal(navUrl, "https://example.org/dashboard");
    });

    it("6.2: 'open youtube and search for cooking videos' honors explicit platform navigation", () => {
      const goal = GoalParser.parse("open youtube and search for cooking videos");
      assert.equal(goal.navigation.requiresExplicitNavigation, true);
      assert.equal(goal.navigation.destinationKeyword, "youtube");

      const navUrl = extractNavigationUrl("open youtube and search for cooking videos", "https://example.org", goal);
      assert.equal(navUrl, "https://www.youtube.com");
    });

    it("6.3: 'go to amazon.in and search for shoes under 7k' honors explicit store navigation", () => {
      const goal = GoalParser.parse("go to amazon.in and search for shoes under 7k");
      assert.equal(goal.navigation.requiresExplicitNavigation, true);

      const navUrl = extractNavigationUrl("go to amazon.in and search for shoes under 7k", "https://google.com", goal);
      assert.ok(navUrl && navUrl.includes("amazon.in"));
    });

    it("6.4: 'open first mail from LinkedIn' on active page returns null from extractNavigationUrl (never redirects!)", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const navUrl = extractNavigationUrl("open first mail from LinkedIn", "https://mail.google.com/mail/u/0/#inbox", goal);
      assert.equal(navUrl, null, "Must NOT navigate away from active page");
    });
  });

  // ==========================================================================
  // Category 7: Generic Action Fallback & Target Resolution
  // ==========================================================================
  describe("Category 7: Generic Action Fallback & Target Resolution", () => {
    it("7.1: Resolves candidate matching sender constraint 'LinkedIn' and ordinal 'first'", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const planner = new TaskPlanner(goal, { url: "https://mail.google.com", isInternalPage: false });
      const stateManager = new ExecutionStateManager({ goal });

      const mockInteractiveElements = [
        { elementId: "el_1", tag: "tr", text: "Google Security Alert - New login from Windows", ariaLabel: "Google Security Alert" },
        { elementId: "el_2", tag: "tr", text: "LinkedIn - You appeared in 14 searches this week", ariaLabel: "LinkedIn Notification" },
        { elementId: "el_3", tag: "tr", text: "LinkedIn - Shahrukh sent you a direct message", ariaLabel: "LinkedIn Message" },
        { elementId: "el_4", tag: "tr", text: "GitHub - New star on repository privacy-agent", ariaLabel: "GitHub Notification" }
      ];

      const action = deriveGeneralizedFallbackAction({
        currentTask: planner.getCurrentTask(),
        goal,
        interactiveElements: mockInteractiveElements,
        stateManager,
        stepNum: 1
      });

      assert.ok(action, "Fallback action must be generated");
      assert.equal(action.actionType, "CLICK");
      assert.equal(action.target, "el_2", "Must select the 1st LinkedIn email (el_2)");
    });

    it("7.2: Resolves candidate matching sender constraint 'LinkedIn' and ordinal 'second'", () => {
      const goal = GoalParser.parse("open second mail from LinkedIn");
      const planner = new TaskPlanner(goal, { url: "https://mail.google.com", isInternalPage: false });
      const stateManager = new ExecutionStateManager({ goal });

      const mockInteractiveElements = [
        { elementId: "el_1", tag: "tr", text: "Google Security Alert - New login", ariaLabel: "Google" },
        { elementId: "el_2", tag: "tr", text: "LinkedIn - You appeared in searches", ariaLabel: "LinkedIn 1" },
        { elementId: "el_3", tag: "tr", text: "LinkedIn - Shahrukh sent message", ariaLabel: "LinkedIn 2" },
        { elementId: "el_4", tag: "tr", text: "GitHub - New star", ariaLabel: "GitHub" }
      ];

      const action = deriveGeneralizedFallbackAction({
        currentTask: planner.getCurrentTask(),
        goal,
        interactiveElements: mockInteractiveElements,
        stateManager,
        stepNum: 1
      });

      assert.ok(action);
      assert.equal(action.actionType, "CLICK");
      assert.equal(action.target, "el_3", "Must select the 2nd LinkedIn email (el_3)");
    });
  });

  // ==========================================================================
  // Category 8: Intent-Based Goal Completion Verification
  // ==========================================================================
  describe("Category 8: Intent-Based Goal Completion Verification", () => {
    it("8.1: Goal is not complete before candidate selection executed", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const planner = new TaskPlanner(goal, { url: "https://mail.google.com", isInternalPage: false });
      const stateManager = new ExecutionStateManager({ goal });

      const checkInitial = GoalCompletionChecker.check({ goal, stateManager, planner, actionHistory: [] });
      assert.equal(checkInitial.isSatisfied, false, "Initial state not complete");
    });

    it("8.2: Goal is completed once candidate selection executed on matching item", () => {
      const goal = GoalParser.parse("open first mail from LinkedIn");
      const planner = new TaskPlanner(goal, { url: "https://mail.google.com", isInternalPage: false });
      const stateManager = new ExecutionStateManager({ goal });

      // Execute candidate selection
      planner.completeCurrentTask("Selected first mail from LinkedIn");
      stateManager.recordActionOutcome({
        actionType: "CLICK",
        target: "el_2",
        ok: true,
        reason: "Selected first mail from LinkedIn"
      });

      // Complete final verify task
      planner.completeCurrentTask("Goal verified");

      const checkFinal = GoalCompletionChecker.check({
        goal,
        stateManager,
        planner,
        actionHistory: ["Step 1: [CLICK] on el_2 (select_candidate) — Selected first mail from LinkedIn"]
      });

      assert.equal(checkFinal.isSatisfied, true, "Goal should be satisfied once selection executes");
    });
  });

});
