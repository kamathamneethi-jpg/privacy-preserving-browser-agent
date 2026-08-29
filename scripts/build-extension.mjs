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
    buildInstance.onResolve({ filter: /^node:/ }, (args) => ({
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
    define: {
      "process.env.NODE_ENV": '"production"'
    }
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
    plugins: [nodeBuiltinsPlugin]
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
    plugins: [nodeBuiltinsPlugin]
  });

  console.log("✔ Extension build completed successfully: files generated in apps/extension/dist/");
}

buildExtension().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
