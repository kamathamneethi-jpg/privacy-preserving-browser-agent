import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixtureFile = path.resolve(rootDir, "tests/fixtures/interactive-test-page.html");

const PORT = 3000;
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  const demoTargetFile = path.resolve(rootDir, "tests/fixtures/demo-target-page.html");

  if (url.pathname === "/demo" || url.pathname === "/demo-target") {
    if (fs.existsSync(demoTargetFile)) {
      const content = fs.readFileSync(demoTargetFile, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Demo target fixture not found.");
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/interactive") {
    if (fs.existsSync(fixtureFile)) {
      const content = fs.readFileSync(fixtureFile, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Fixture not found.");
    }
    return;
  }

  if (url.pathname === "/submit" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Form Submitted Successfully</title></head>
        <body>
          <h1>Form Submission Received</h1>
          <p id="submission-status">SUCCESS</p>
          <pre id="submitted-data">${body}</pre>
        </body>
        </html>
      `);
    });
    return;
  }

  if (url.pathname.startsWith("/extension/")) {
    const relPath = url.pathname.replace("/extension/", "");
    const filePath = path.resolve(rootDir, "apps/extension", relPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`Local test fixture server running at http://${HOST}:${PORT}`);
});
