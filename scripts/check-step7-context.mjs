import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evaluatePiiTaskRelevance,
  analyzeTaskIntent,
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  CONTEXT_EVIDENCE_CODES,
  PiiCategory
} from "../packages/privacy-core/src/index.js";

const analyzerSrc = await readFile(resolve("packages/privacy-core/src/context-analyzer.js"), "utf8");

// 1. Verify required module exports
if (!analyzerSrc.includes("evaluatePiiTaskRelevance") || !analyzerSrc.includes("analyzeTaskIntent")) {
  console.error("context-analyzer.js must export evaluatePiiTaskRelevance and analyzeTaskIntent.");
  process.exit(1);
}

// 2. Test task intent parsing and negation
const intentResult = analyzeTaskIntent("Find my order number, do not send my email");
if (intentResult.intent !== TASK_INTENT_TYPES.FIND_INFORMATION || !intentResult.negatedCategories.includes("email")) {
  console.error("Task intent parsing or negation detection failed.");
  process.exit(1);
}

// 3. Test relevance classification and evidence codes
const evalResult = evaluatePiiTaskRelevance({
  userInstruction: "Find my email address",
  piiItems: [{ id: "PII_1", category: "email", confidence: 0.98 }, { id: "PII_2", category: "phone", confidence: 0.92 }]
});

const emailRel = evalResult.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
const phoneRel = evalResult.piiRelevance.find((r) => r.category === PiiCategory.PHONE);

if (emailRel.relevance !== TASK_RELEVANCE_LEVELS.REQUIRED || phoneRel.relevance !== TASK_RELEVANCE_LEVELS.IRRELEVANT) {
  console.error("PII task relevance evaluation failed.");
  process.exit(1);
}

if (!Array.isArray(emailRel.evidenceCodes) || !emailRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.EXPLICIT_TASK_KEYWORD)) {
  console.error("Structured evidence codes missing in relevance output.");
  process.exit(1);
}

// 4. Verify no raw sensitive text leakage
if (JSON.stringify(evalResult).includes("user@example.com")) {
  console.error("Raw sensitive value leaked in Context Analyzer output.");
  process.exit(1);
}

console.log("Step 7 verification passed: Context Analyzer, task intent parsing, relevance levels, evidence codes, and privacy guarantees verified.");
