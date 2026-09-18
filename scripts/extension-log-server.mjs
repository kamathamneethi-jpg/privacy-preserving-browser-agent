import http from "node:http";

const PORT = 8765;
const HOST = "127.0.0.1";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m"
};

function formatJson(obj) {
  return JSON.stringify(obj, null, 2)
    .split("\n")
    .map(line => `    ${COLORS.dim}${line}${COLORS.reset}`)
    .join("\n");
}

const server = http.createServer((req, res) => {
  // Enable CORS for Chrome extension
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const time = new Date().toLocaleTimeString();
        const { stage, event, data } = payload;

        console.log(`\n${COLORS.cyan}[${time}] ${COLORS.bright}${stage.toUpperCase()}${COLORS.reset} ── ${COLORS.yellow}${event}${COLORS.reset}`);

        if (data) {
          if (typeof data === "string") {
            console.log(`  ${COLORS.dim}▸${COLORS.reset} ${data}`);
          } else if (typeof data === "object") {
            console.log(formatJson(data));
          }
        }
      } catch (err) {
        console.log(`\n${COLORS.red}[Log Parse Error]${COLORS.reset} ${body}`);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Privacy-Preserving Browser Agent Terminal Log Relay Active\n");
});

server.listen(PORT, HOST, () => {
  console.log(`\n${COLORS.bgGreen}${COLORS.bright} PRIVACY-PRESERVING BROWSER AGENT: LIVE TERMINAL MONITOR ${COLORS.reset}`);
  console.log(`${COLORS.green}✔ Listening for live extension activity on http://${HOST}:${PORT}${COLORS.reset}`);
  console.log(`${COLORS.dim}Now open Chrome, click the extension popup, type a task, and see all internal stages stream here in real time!${COLORS.reset}\n`);
});
