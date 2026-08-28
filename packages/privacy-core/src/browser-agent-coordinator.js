/**
 * End-to-End Browser Agent Coordinator (Step 17).
 * Connects and orchestrates the existing frozen Step 1–16 modules without duplicating security logic.
 *
 * Architecture & Flow:
 * User Task & Page State
 *        ↓ (Step 3–6: Perception & Multi-signal PII Detection)
 * Task Relevance & Privacy Policy Evaluation (Steps 7–8)
 *        ↓ (Step 11: Sanitization Boundary)
 * Sanitized Reasoning Payload
 *        ↓ (Step 16: Secure Communication Client)
 * Remote Reasoning Provider (Step 15 Backend / Mock)
 *        ↓ (Step 16: Response Security Validation)
 * Action Proposal
 *        ↓ (Step 14: Browser Action Engine - Policy, Vault, Target Validation)
 * Local Browser Execution Output (ActionRuntime)
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Zero Duplicate Logic: Delegates perception, policy, vault, sanitization, transport, and action execution to existing modules.
 * 2. Step 14 Absolute Execution Authority: Every action proposal MUST be validated and executed via BrowserActionEngine.
 * 3. Remote Privacy Boundary: Raw PII, vault secrets, raw DOM, screenshots, and OCR buffers NEVER cross the remote boundary.
 */

import {
  E2E_WORKFLOW_STATUS,
  SECURE_COMMUNICATION_STATUS,
  ACTION_RESULTS
} from "../../shared-types/src/privacy-contracts.js";
import { detectPiiMultiSignal } from "./detection.js";
import { analyzeTaskIntent } from "./context-analyzer.js";
import { decidePrivacyPolicy } from "./policy.js";
import { buildSanitizedReasoningPayload } from "./sanitized-context-builder.js";
import { secureCommunicationClient } from "./secure-communication-client.js";
import { browserActionEngine } from "./browser-action-engine.js";
import { BenchmarkUtility } from "./benchmark-utility.js";

export class BrowserAgentCoordinator {
  constructor(customConfig = {}) {
    this.config = customConfig;
    this.status = E2E_WORKFLOW_STATUS.UNINITIALIZED;
    this.commClient = customConfig.commClient || secureCommunicationClient;
    this.actionEngine = customConfig.actionEngine || browserActionEngine;
    this.benchmark = customConfig.benchmark || new BenchmarkUtility();
  }

  /**
   * Initializes the coordinator lifecycle.
   *
   * @returns {object} { ok: boolean, state: string }
   */
  initialize() {
    this.status = E2E_WORKFLOW_STATUS.UNINITIALIZED;
    if (this.commClient.getClientStatus() !== SECURE_COMMUNICATION_STATUS.READY) {
      this.commClient.initialize();
    }
    if (this.actionEngine.status !== "READY") {
      this.actionEngine.initialize();
    }
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }

  /**
   * Runs an end-to-end browser agent task safely across all 16 pipeline stages.
   *
   * @param {object} taskRequest - { userTask: string, taskIntent?: string }
   * @param {object} pageStateOptions - { domTree?: object, text?: string, url?: string, nodes?: array }
   * @returns {Promise<object>} End-to-end execution result and benchmark metrics
   */
  async runEndToEndTask(taskRequest = {}, pageStateOptions = {}) {
    this.benchmark.startBenchmark();
    const userTask = taskRequest.userTask || "Perform browser task";

    try {
      // --- STAGE 1: PERCEIVE & DETECT PII (Steps 3–6) ---
      this.status = E2E_WORKFLOW_STATUS.PERCEIVING;
      const perceiveStart = Date.now();

      const pageText = pageStateOptions.text || "";
      const piiMatches = detectPiiMultiSignal(pageText);

      this.benchmark.recordStepLatency("perceptionMs", Date.now() - perceiveStart);
      this.benchmark.recordStepLatency("detectionMs", Date.now() - perceiveStart);

      // --- STAGE 2: SANITIZATION & PAYLOAD GENERATION (Steps 7–11) ---
      this.status = E2E_WORKFLOW_STATUS.SANITIZING;
      const sanitizeStart = Date.now();

      const taskIntentResult = analyzeTaskIntent(userTask);
      const taskIntent = taskRequest.taskIntent || taskIntentResult.taskIntent || "GENERAL_NAVIGATION";

      const sanitizedResult = buildSanitizedReasoningPayload({
        domTree: pageStateOptions.domTree || { tagName: "body", children: [] },
        text: pageText,
        taskIntent,
        detectedPii: piiMatches
      });

      this.benchmark.recordStepLatency("sanitizationMs", Date.now() - sanitizeStart);

      if (!sanitizedResult.ok || !sanitizedResult.payload) {
        this.status = E2E_WORKFLOW_STATUS.DENIED;
        this.benchmark.recordPrivacyViolation();
        return Object.freeze({
          ok: false,
          status: E2E_WORKFLOW_STATUS.DENIED,
          error: sanitizedResult.error || "Sanitization boundary failed to generate safe payload.",
          metrics: this.benchmark.endBenchmark()
        });
      }

      // --- STAGE 3: SECURE TRANSPORT & REMOTE REASONING (Steps 15–16) ---
      this.status = E2E_WORKFLOW_STATUS.REASONING;
      const transportStart = Date.now();

      const commResult = await this.commClient.sendSanitizedPayload(sanitizedResult.payload);

      this.benchmark.recordStepLatency("transportMs", Date.now() - transportStart);
      this.benchmark.recordStepLatency("reasoningMs", Date.now() - transportStart);

      if (!commResult.ok || commResult.status !== SECURE_COMMUNICATION_STATUS.COMPLETED) {
        this.status = E2E_WORKFLOW_STATUS.DENIED;
        this.benchmark.recordDeniedAction();
        return Object.freeze({
          ok: false,
          status: E2E_WORKFLOW_STATUS.DENIED,
          error: commResult.error || "Secure communication transport failed.",
          metrics: this.benchmark.endBenchmark()
        });
      }

      // --- STAGE 4: ACTION VALIDATION & STEP 14 BROWSER EXECUTION AUTHORITY (Step 14) ---
      this.status = E2E_WORKFLOW_STATUS.VALIDATING;
      const actionStart = Date.now();

      const recommendedActions = commResult.recommendedActions || [];
      const executionResults = [];

      this.status = E2E_WORKFLOW_STATUS.EXECUTING;

      for (const actionProposal of recommendedActions) {
        // EVERY action proposal MUST be validated and executed through Step 14 BrowserActionEngine!
        const actionResult = this.actionEngine.executeAction(actionProposal, {
          pageState: { nodes: pageStateOptions.nodes || [{ id: actionProposal.target?.id }] },
          policyItem: pageStateOptions.policyItem,
          vaultSecret: pageStateOptions.vaultSecret
        });

        if (actionResult.ok && actionResult.status === ACTION_RESULTS.COMPLETED) {
          this.benchmark.recordSuccessfulAction();
        } else {
          this.benchmark.recordDeniedAction();
        }

        executionResults.push(actionResult);
      }

      this.benchmark.recordStepLatency("actionExecutionMs", Date.now() - actionStart);
      this.status = E2E_WORKFLOW_STATUS.COMPLETED;

      return Object.freeze({
        ok: true,
        status: E2E_WORKFLOW_STATUS.COMPLETED,
        taskIntent,
        recommendedActionsCount: recommendedActions.length,
        executionResults: Object.freeze(executionResults),
        metrics: this.benchmark.endBenchmark()
      });
    } catch (err) {
      this.status = E2E_WORKFLOW_STATUS.ERROR;
      this.benchmark.recordDeniedAction();
      return Object.freeze({
        ok: false,
        status: E2E_WORKFLOW_STATUS.ERROR,
        error: err.message || "Unhandled exception in end-to-end task coordinator.",
        metrics: this.benchmark.endBenchmark()
      });
    }
  }
}

/**
 * Factory function for creating a BrowserAgentCoordinator instance.
 *
 * @param {object} [config={}]
 * @returns {BrowserAgentCoordinator}
 */
export function createBrowserAgentCoordinator(config = {}) {
  const coordinator = new BrowserAgentCoordinator(config);
  coordinator.initialize();
  return coordinator;
}

// Default singleton instance
export const browserAgentCoordinator = createBrowserAgentCoordinator();
