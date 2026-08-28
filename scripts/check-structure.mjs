import { access } from "node:fs/promises";
import { resolve } from "node:path";

const requiredPaths = [
  "README.md",
  ".gitignore",
  ".env.example",
  "apps/extension/README.md",
  "apps/extension/src",
  "apps/extension/public",
  "packages/privacy-core/README.md",
  "packages/privacy-core/src",
  "packages/shared-types/README.md",
  "packages/shared-types/src",
  "services/reasoning-backend/README.md",
  "services/reasoning-backend/src",
  "docs/architecture.md",
  "tests/README.md"
];

const missing = [];
for (const path of requiredPaths) {
  try {
    await access(resolve(path));
  } catch {
    missing.push(path);
  }
}

if (missing.length) {
  console.error(`Missing required project paths:\n${missing.map((path) => `- ${path}`).join("\n")}`);
  process.exit(1);
}

console.log(`Project structure verified: ${requiredPaths.length} required paths found.`);
