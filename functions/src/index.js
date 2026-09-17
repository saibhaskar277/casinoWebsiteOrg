const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { handleChatRequest } = require("site-agent");
const serverConfig = require("site-agent/config/server.config.json");

const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");
const googleServiceAccountJson = defineSecret("GOOGLE_SERVICE_ACCOUNT_JSON");
const googleCalendarId = defineSecret("GOOGLE_CALENDAR_ID");

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = serverConfig.corsOrigins || [];
  if (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin || "*");
  } else if (!origin) {
    res.set("Access-Control-Allow-Origin", "*");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
}

function bindSecretEnv(name, secretParam) {
  if (process.env[name]) return;
  try {
    const v = secretParam.value();
    if (v) process.env[name] = v;
  } catch (_) {
    // Local / emulator without secrets bound — calendar can use secrets/*.json fallback
  }
}

// Exposes: POST /api/chat (via firebase.json rewrite).
exports.chat = onRequest(
  {
    secrets: [deepseekApiKey, googleServiceAccountJson, googleCalendarId],
    cors: false,
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    bindSecretEnv("DEEPSEEK_API_KEY", deepseekApiKey);
    bindSecretEnv("GOOGLE_SERVICE_ACCOUNT_JSON", googleServiceAccountJson);
    bindSecretEnv("GOOGLE_CALENDAR_ID", googleCalendarId);

    if (!process.env.GOOGLE_CALENDAR_ID) {
      process.env.GOOGLE_CALENDAR_ID = serverConfig?.calendar?.calendarId || "";
    }

    return handleChatRequest(req, res);
  }
);
