/**
 * Local demo server for Privacy-Preserving Browser Agent Image PII Redaction Pipeline.
 * Serves the live test fixture page, extension popup, and verification workflow.
 */

import http from "node:http";
import fs from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const PORT = 8085;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;

  // Custom route shortcuts
  if (pathname === "/" || pathname === "/demo") {
    pathname = "/tests/fixtures/demo-target-page.html";
  } else if (pathname === "/popup") {
    pathname = "/apps/extension/popup.html";
  }

  // Rewrite /fixtures/... or /dist/... or /src/... when requested relative to popup
  let filePath;
  if (pathname.startsWith("/fixtures/")) {
    filePath = resolve(rootDir, "tests" + pathname);
  } else if (pathname.startsWith("/src/") || pathname.startsWith("/dist/")) {
    filePath = resolve(rootDir, "apps/extension" + pathname);
  } else {
    filePath = resolve(rootDir, "." + pathname);
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`404 Not Found: ${pathname}`);
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

server.listen(PORT, () => {
  console.log(`Demo server active at http://localhost:${PORT}`);
  console.log(`- Demo Page: http://localhost:${PORT}/demo`);
  console.log(`- Extension Popup: http://localhost:${PORT}/popup`);
});
