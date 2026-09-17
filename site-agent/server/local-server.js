/**
 * Local chat API for development (no Firebase emulator required).
 *
 * From host repo root:
 *   node site-agent/server/local-server.js
 *
 * Or via shim:
 *   node functions/local-server.js
 */
const http = require("http");
const path = require("path");
const { handleChatRequest } = require("./handleChatRequest");
const { loadDeepseekApiKey, loadGoogleServiceAccountJson } = require("./secretsLoader");
const serverConfig = require("../config/server.config.json");

const PORT = Number(process.env.AGENT_LOCAL_PORT || 8787);

process.env.DEEPSEEK_API_KEY = loadDeepseekApiKey() || "";
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = loadGoogleServiceAccountJson() || "";
process.env.GOOGLE_CALENDAR_ID =
  process.env.GOOGLE_CALENDAR_ID || serverConfig?.calendar?.calendarId || "";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/api/chat" && url.pathname !== "/chat") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readBody(req);
    const fakeReq = { method: "POST", body, headers: req.headers };
    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      set(k, v) {
        res.setHeader(k, v);
        return this;
      },
      send(payload) {
        res.writeHead(this.statusCode, { "Content-Type": "application/json" });
        res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      }
    };
    await handleChatRequest(fakeReq, fakeRes);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const hasKey = !!process.env.DEEPSEEK_API_KEY;
  const hasSa = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  console.log(`site-agent local API on http://127.0.0.1:${PORT}/api/chat`);
  console.log(`package root: ${path.resolve(__dirname, "..")}`);
  console.log(`DeepSeek key: ${hasKey ? "loaded" : "MISSING"}`);
  console.log(`Google SA: ${hasSa ? "loaded" : "MISSING"}`);
  console.log(`Calendar ID: ${process.env.GOOGLE_CALENDAR_ID || "(missing)"}`);
});
