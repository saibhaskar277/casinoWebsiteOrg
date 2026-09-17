const { chatOrchestrator } = require("./orchestrator/chatOrchestrator");

function json(res, status, obj) {
  res.status(status).set("Content-Type", "application/json").send(JSON.stringify(obj));
}

function sanitizeViewContext(raw) {
  if (!raw || typeof raw !== "object") return null;
  const panelId = raw.panelId == null || raw.panelId === "" ? null : Number(raw.panelId);
  return {
    panelOpen: !!raw.panelOpen,
    panelId: Number.isFinite(panelId) ? panelId : null,
    panelTitle: String(raw.panelTitle || "").slice(0, 80),
    panelKey: String(raw.panelKey || "").slice(0, 40)
  };
}

async function handleChatRequest(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    const body = req.body || {};
    const sessionId = String(body.sessionId || "");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const timezone = String(body.timezone || "Asia/Kolkata");
    const viewContext = sanitizeViewContext(body.viewContext);

    if (!sessionId || messages.length === 0) {
      return json(res, 400, { error: "Missing sessionId or messages" });
    }

    const result = await chatOrchestrator({ messages, timezone, viewContext });
    return json(res, 200, result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("handleChatRequest error", err);
    return json(res, 500, { error: "Internal error" });
  }
}

module.exports = { handleChatRequest };
