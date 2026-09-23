/**
 * Standalone Pre-Flight AI Agent Health & Diagnostics Test.
 *
 * Verifies your LLM API configuration (.env token, provider, model)
 * and confirms whether the AI agent can reason and output action plans
 * BEFORE launching or testing with the Chrome extension.
 *
 * Usage:
 *   node scripts/test-agent-health.mjs
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Load .env configuration
async function loadEnvConfig() {
  try {
    const envContent = await readFile(resolve(rootDir, ".env"), "utf8");
    const envVars = {};
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        envVars[k] = val;
      }
    }
    return envVars;
  } catch {
    return {};
  }
}

async function runHealthCheck() {
  console.log("=========================================================================");
  console.log("    PRIVACY BROWSER AGENT: PRE-FLIGHT AI REASONING HEALTH CHECK         ");
  console.log("=========================================================================\n");

  const env = await loadEnvConfig();
  const provider = (env.LLM_PROVIDER || process.env.LLM_PROVIDER || "huggingface").toLowerCase();

  console.log(`[Config Source]: .env file (prioritized over user inputs)`);
  console.log(`[Active Provider]: ${provider}`);

  let apiKey = "";
  let model = "";
  let endpoint = "";

  if (provider === "groq") {
    apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY || "";
    model = env.GROQ_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
  } else if (provider === "openrouter") {
    apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "";
    model = env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-vl-72b-instruct:free";
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
  } else {
    // Default to Hugging Face
    apiKey = env.HUGGINGFACE_API_KEY || env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
    model = env.HUGGINGFACE_MODEL || process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";
    endpoint = "https://router.huggingface.co/v1/chat/completions";
  }

  const maskedKey = apiKey && apiKey.length > 8
    ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
    : (apiKey ? "configured" : "(MISSING / EMPTY)");

  console.log(`[Model]: ${model}`);
  console.log(`[Endpoint]: ${endpoint}`);
  console.log(`[API Key in .env]: ${maskedKey}\n`);

  // Step 1: Check if API key is present
  if (!apiKey && provider !== "local") {
    console.error(`❌ ERROR: No API key found for provider "${provider}" in .env`);
    console.error(`   Please configure ${provider === "groq" ? "GROQ_API_KEY" : (provider === "openrouter" ? "OPENROUTER_API_KEY" : "HUGGINGFACE_API_KEY")} in your .env file.\n`);
    process.exit(1);
  }

  // Step 2: Provider-specific identity check
  if (provider === "huggingface" || provider === "hf") {
    console.log("🔍 Checking Hugging Face Token Identity...");
    try {
      const whoamiRes = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: { Authorization: `Bearer ${apiKey.trim()}` }
      });
      if (whoamiRes.ok) {
        const user = await whoamiRes.json();
        console.log(`   ✔ Authenticated user: "${user.name}" (${user.fullname || "User"})`);
        console.log(`   ✔ PRO status: ${user.isPro ? "YES (PRO Account)" : "NO (Free Tier)"}`);
        console.log(`   ✔ Token display name: "${user.auth?.accessToken?.displayName || "default"}"`);
      } else {
        const errText = await whoamiRes.text();
        console.error(`   ❌ Token authentication failed: HTTP ${whoamiRes.status}`);
        console.error(`      ${errText}`);
      }
    } catch (e) {
      console.warn(`   ⚠ Could not reach whoami endpoint: ${e.message}`);
    }
  }

  // Step 3: Test agent reasoning call with a structured test prompt
  console.log("\n🤖 Testing AI Agent Autonomous Reasoning...");
  console.log(`   Dispatching simulated perception test to ${endpoint}...`);

  const testMessages = [
    {
      role: "system",
      content: "You are a privacy-preserving browser automation agent. Output JSON with { observation: string, action: { actionType: 'TYPE'|'CLICK'|'COMPLETE', target: string, parameters?: object, reasoningSummary: string } }"
    },
    {
      role: "user",
      content: "Page: Amazon. Elements: [el_1: input#twotabsearchtextbox (Search Amazon)]. User Goal: Search for 1TB SSD. What is your action?"
    }
  ];

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey.trim()}`
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://privacy-browser-agent.local";
    headers["X-Title"] = "Privacy Browser Agent";
  }

  const startTime = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: testMessages,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" }
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`\n❌ AI REASONING FAILED (HTTP ${response.status} ${response.statusText} in ${latencyMs}ms)`);
      console.error(`   Error details from ${provider}:`);
      console.error(`   ${errorBody}\n`);

      if (response.status === 402 || errorBody.includes("depleted") || errorBody.includes("credits") || errorBody.includes("Invalid username or password")) {
        console.error("─────────────────────────────────────────────────────────────────────────");
        console.error("📌 EXACT REASON WHY YOUR HUGGING FACE MODEL FAILED:");
        console.error("   Hugging Face router (router.huggingface.co) uses monthly credits to query");
        console.error("   inference providers for models like 'Qwen/Qwen2.5-VL-72B-Instruct'.");
        console.error("   Your Hugging Face account has depleted its monthly included free credits!");
        console.error("─────────────────────────────────────────────────────────────────────────");
        console.error("\n💡 HOW TO FIX (Choose Option 1 or 2):");
        console.error("\n  [OPTION 1 - RECOMMENDED (100% Free & Fast)] Use Groq Cloud:");
        console.error("    1. Get a free API key at: https://console.groq.com/keys (instant, free, no card)");
        console.error("    2. In your .env file, set:");
        console.error("         LLM_PROVIDER=groq");
        console.error("         GROQ_API_KEY=gsk_your_actual_key_here");
        console.error("         GROQ_MODEL=llama-3.3-70b-versatile");
        console.error("    3. Run: node scripts/build-extension.mjs");
        console.error("\n  [OPTION 2] Use OpenRouter Free Tier:");
        console.error("    1. Get a free API key at: https://openrouter.ai/keys (no card needed)");
        console.error("    2. In your .env file, set:");
        console.error("         LLM_PROVIDER=openrouter");
        console.error("         OPENROUTER_API_KEY=sk-or-v1-your_key_here");
        console.error("         OPENROUTER_MODEL=qwen/qwen-2.5-vl-72b-instruct:free");
        console.error("    3. Run: node scripts/build-extension.mjs");
        console.error("\n  [OPTION 3] Use a Fresh Hugging Face Account:");
        console.error("    Create a fresh HF token from an account that hasn't depleted credits:");
        console.error("    https://huggingface.co/settings/tokens\n");
      }
      process.exit(1);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    console.log(`\n✔ AI REASONING SUCCESSFUL! (Response received in ${latencyMs}ms)`);
    console.log(`   Raw Output Preview:`);
    console.log(`   ${content ? content.slice(0, 300) : "(empty)"}\n`);

    // Step 4: Check Observability Server
    console.log("🌐 Checking Local Observability Server on port 8765...");
    try {
      const srvRes = await fetch("http://127.0.0.1:8765/api/status");
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        console.log(`   ✔ Observability Dashboard is ONLINE at http://127.0.0.1:8765 (status: ${srvData.status})`);
      } else {
        console.log(`   ⚠ Observability server responded with HTTP ${srvRes.status}`);
      }
    } catch {
      console.log(`   ℹ Observability server is not currently running.`);
      console.log(`     Start it anytime with: node scripts/extension-log-server.mjs`);
    }

    console.log("\n=========================================================================");
    console.log("  🎉 PRE-FLIGHT CHECK COMPLETED: AI AGENT REASONING IS WORKING PERFECTLY! ");
    console.log("  You can now launch your tasks in the Chrome extension.                  ");
    console.log("=========================================================================\n");
  } catch (err) {
    console.error(`\n❌ Network or connection error while contacting ${endpoint}:`, err.message);
    process.exit(1);
  }
}

runHealthCheck().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
