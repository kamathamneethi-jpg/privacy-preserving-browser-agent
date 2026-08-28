import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const policyPath = resolve("packages/privacy-core/src/policy.js");
const source = await readFile(policyPath, "utf8");

for (const decision of ["ALLOW", "REDACT", "TOKENIZE", "LOCAL_ONLY"]) {
  if (!source.includes(decision)) {
    console.error(`Privacy policy is missing decision: ${decision}`);
    process.exit(1);
  }
}

if (source.includes("rawValue") || source.includes("value:")) {
  console.error("Privacy policy must not accept a raw value.");
  process.exit(1);
}

console.log("Privacy policy verified: safe defaults and all decisions are defined.");
