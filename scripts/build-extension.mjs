/**
 * Build script for Privacy-Preserving Browser Agent Chrome Extension.
 * Uses esbuild to bundle client-side privacy-core and extension scripts into browser-compatible distribution files.
 */

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const extensionDir = resolve(rootDir, "apps/extension");
const distDir = resolve(extensionDir, "dist");

/**
 * esbuild plugin providing browser-safe stubs for node: built-ins if encountered.
 */
const nodeBuiltinsPlugin = {
  name: "node-builtins-stub",
  setup(buildInstance) {
    buildInstance.onResolve({ filter: /^(node:)?(fs|path|url|crypto|stream|util|buffer|events|os)/ }, (args) => ({
      path: args.path,
      namespace: "node-stub"
    }));

    buildInstance.onLoad({ filter: /.*/, namespace: "node-stub" }, () => ({
      contents: `
        export const readFile = async () => "";
        export const access = async () => {};
        export const resolve = (...args) => args.join("/");
        export const dirname = (p) => p;
        export const fileURLToPath = (u) => u;
        export default {};
      `,
      loader: "js"
    }));
  }
};

import fs from "node:fs";

function loadEnvConfig() {
  const envPath = resolve(rootDir, ".env");
  const envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val;
      }
    }
  }
  return envVars;
}

const env = loadEnvConfig();
const envDefines = {
  "process.env.NODE_ENV": '"production"',
  "process.env.HUGGINGFACE_API_KEY": JSON.stringify(env.HUGGINGFACE_API_KEY || env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || ""),
  "process.env.HF_TOKEN": JSON.stringify(env.HF_TOKEN || env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ""),
  "process.env.HUGGINGFACE_MODEL": JSON.stringify(env.HUGGINGFACE_MODEL || process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct"),
  "process.env.GROQ_API_KEY": JSON.stringify(env.GROQ_API_KEY || process.env.GROQ_API_KEY || ""),
  "process.env.GROQ_MODEL": JSON.stringify(env.GROQ_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
  "process.env.OPENROUTER_API_KEY": JSON.stringify(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ""),
  "process.env.OPENROUTER_MODEL": JSON.stringify(env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-vl-72b-instruct:free"),
  "process.env.LLM_PROVIDER": JSON.stringify(env.LLM_PROVIDER || process.env.LLM_PROVIDER || "huggingface"),
  "process.env.SECURE_TRANSPORT_MODE": JSON.stringify(env.SECURE_TRANSPORT_MODE || process.env.SECURE_TRANSPORT_MODE || "GROQ_TRANSPORT")
};

async function buildExtension() {
  console.log("Building Privacy-Preserving Browser Agent Chrome Extension...");

  // 1. Ensure dist directory exists
  await mkdir(distDir, { recursive: true });

  // 2. Bundle @privacy-agent/privacy-core for browser extension
  console.log("-> Bundling @privacy-agent/privacy-core for browser runtime...");
  await build({
    entryPoints: [resolve(rootDir, "packages/privacy-core/src/index.js")],
    bundle: true,
    format: "iife",
    globalName: "PrivacyCore",
    outfile: resolve(distDir, "privacy-core.bundle.js"),
    platform: "browser",
    target: ["chrome110", "es2022"],
    plugins: [nodeBuiltinsPlugin],
    define: envDefines
  });

  // 3. Bundle Content Scripts (Perception + Semantics + OCR + ActionRuntime)
  console.log("-> Bundling content action runtime & perception scripts...");
  await build({
    entryPoints: [resolve(extensionDir, "src/action-runtime.js")],
    bundle: true,
    format: "iife",
    outfile: resolve(distDir, "content-action-runtime.bundle.js"),
    platform: "browser",
    target: ["chrome110", "es2022"],
    plugins: [nodeBuiltinsPlugin],
    define: envDefines
  });

  // 4. Bundle Extension Popup UI Script
  console.log("-> Bundling popup UI script...");
  await build({
    entryPoints: [resolve(extensionDir, "src/popup.js")],
    bundle: true,
    format: "iife",
    outfile: resolve(distDir, "popup.bundle.js"),
    platform: "browser",
    target: ["chrome110", "es2022"],
    plugins: [nodeBuiltinsPlugin],
    define: envDefines
  });

  // 5. Copy static demo fixtures to extension and dist directories
  console.log("-> Copying static test fixtures to extension bundle...");
  const extFixturesDir = resolve(extensionDir, "fixtures");
  const distFixturesDir = resolve(distDir, "fixtures");
  await mkdir(extFixturesDir, { recursive: true });
  await mkdir(distFixturesDir, { recursive: true });

  const fixtureImgSrc = resolve(rootDir, "tests/fixtures/pii-image-demo.png");
  if (fs.existsSync(fixtureImgSrc)) {
    fs.copyFileSync(fixtureImgSrc, resolve(extFixturesDir, "pii-image-demo.png"));
    fs.copyFileSync(fixtureImgSrc, resolve(distFixturesDir, "pii-image-demo.png"));
  }

  console.log("✔ Extension build completed successfully: files generated in apps/extension/dist/");
}

buildExtension().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
