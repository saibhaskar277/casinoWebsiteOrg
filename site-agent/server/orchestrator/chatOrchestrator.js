const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const { deepseekChat } = require("../llm/deepseekClient");
const { checkAvailability, createMeeting } = require("../tools/calendarTools");
const { loadDeepseekApiKey } = require("../secretsLoader");
const { StaticKnowledgeProvider } = require("../knowledge/StaticKnowledgeProvider");
const serverConfig = require("../../config/server.config.json");

const knowledgePath = path.join(__dirname, "..", "..", "config", "knowledge.json");
let knowledgeProvider = new StaticKnowledgeProvider({
  co: "Assistant knowledge missing; offer contact or booking."
});
try {
  const raw = fs.readFileSync(knowledgePath, "utf8");
  knowledgeProvider = new StaticKnowledgeProvider(JSON.parse(raw));
} catch (_) {
  /* keep fallback */
}

/** Optional: host apps can replace the knowledge provider (e.g. RAG). */
function setKnowledgeProvider(provider) {
  if (provider && typeof provider.getFacts === "function") {
    knowledgeProvider = provider;
  }
}

const MAX_TOOL_ROUNDS_DEFAULT = 3;
const DEFAULT_TZ = "Asia/Kolkata";

function llmOpts() {
  const llm = serverConfig?.llm || {};
  return {
    model: process.env.DEEPSEEK_MODEL || llm.model || "deepseek-flash",
    maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || llm.maxTokens || 280),
    temperature: Number(llm.temperature ?? 0.55),
    historyMessages: Number(llm.historyMessages || 4),
    maxToolRounds: Number(llm.maxToolRounds || MAX_TOOL_ROUNDS_DEFAULT),
    maxMessageChars: Number(llm.maxMessageChars || 700)
  };
}

function buildSystemPrompt(timezone, viewContext) {
  const clock = getClock(timezone);
  const vc = viewContext && typeof viewContext === "object" ? viewContext : null;
  const view =
    vc?.panelOpen && vc.panelTitle
      ? `VIEW:${vc.panelTitle} (${vc.panelKey || "?"})`
      : "VIEW:home";
  const facts = knowledgeProvider.getFacts(vc);
  const name = serverConfig?.brand?.assistantName || "Website guide";

  return [
    `${name}. FACTS only. 1–3 short sentences. Vary wording; never copy a prior reply.`,
    `CLK ${clock.tz} now=${clock.nowLabel} today=${clock.todayISO} tomorrow=${clock.tomorrowISO}. Relative dates use these.`,
    view,
    `FACTS:${typeof facts === "string" ? facts : JSON.stringify(facts)}`,
    "BOOK: tools only; need name+email+topic+slot; never say booked without eventUrl.",
    "NAV: answer using VIEW; do not ask the user to open a panel. Client may already show the section. Unknown→offer email/book."
  ].join("\n");
}

function normalizeIncomingMessages(messages, maxChars, historyLimit) {
  const limit = historyLimit || 6;
  const max = maxChars || 1200;
  return messages
    .filter((m) => m && typeof m.content === "string")
    .slice(-limit)
    .map((m) => {
      let content = String(m.content).trim();
      if (content.length > max) content = content.slice(0, max) + "…";
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content
      };
    });
}

function toolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "checkAvailability",
        description: "Free 30-min slots for date range.",
        parameters: {
          type: "object",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
            timezone: { type: "string" }
          },
          required: ["startDate", "endDate", "timezone"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "createMeeting",
        description: "Book only after name+email+topic+confirmed slot.",
        parameters: {
          type: "object",
          properties: {
            visitorName: { type: "string" },
            visitorEmail: { type: "string" },
            topic: { type: "string" },
            startISO: { type: "string" },
            durationMinutes: { type: "number" }
          },
          required: ["visitorName", "visitorEmail", "topic", "startISO", "durationMinutes"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "openSitePanel",
        description: "Open UI panel: 1 Casino, 2 Casual/e-instant, 3 Team, 4 Tech, 5 Portfolio.",
        parameters: {
          type: "object",
          properties: {
            panelId: { type: "integer", minimum: 1, maximum: 5 }
          },
          required: ["panelId"]
        }
      }
    }
  ];
}

function compactToolResult(name, result) {
  if (!result || typeof result !== "object") return result;
  if (name === "checkAvailability") {
    const slots = Array.isArray(result.slots) ? result.slots.slice(0, 5) : [];
    const out = { slots };
    if (result.error) out.error = result.error;
    return out;
  }
  if (name === "createMeeting") {
    const out = {};
    if (result.eventUrl) out.eventUrl = result.eventUrl;
    if (result.startISO) out.startISO = result.startISO;
    if (result.endISO) out.endISO = result.endISO;
    if (result.error) out.error = result.error;
    if (result.hint) out.hint = result.hint;
    return out;
  }
  if (name === "openSitePanel") {
    return {
      ok: !!result?.ok,
      panelId: result?.panelId,
      panelTitle: result?.panelTitle,
      error: result?.error
    };
  }
  return result;
}

function getClock(timezone) {
  const tz = timezone || serverConfig?.calendar?.timezone || DEFAULT_TZ;
  const now = DateTime.now().setZone(tz);
  const tomorrow = now.plus({ days: 1 });
  return {
    tz,
    now,
    tomorrow,
    todayISO: now.toISODate(),
    tomorrowISO: tomorrow.toISODate(),
    todayLabel: now.toFormat("cccc, d LLLL yyyy"),
    tomorrowLabel: tomorrow.toFormat("cccc, d LLLL yyyy"),
    nowLabel: now.toFormat("cccc, d LLLL yyyy, HH:mm ZZZZ")
  };
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i].content) {
      return String(messages[i].content);
    }
  }
  return "";
}

function parseDt(value, tz) {
  if (!value) return null;
  let dt = DateTime.fromISO(String(value), { setZone: true });
  if (!dt.isValid) dt = DateTime.fromISO(String(value), { zone: tz });
  return dt.isValid ? dt : null;
}

/**
 * Fix LLM date mistakes (e.g. "tomorrow" → January) using the real clock + user wording.
 */
function correctToolArgs(name, args, timezone, userText) {
  const clock = getClock(timezone);
  const text = String(userText || "").toLowerCase();
  const out = { ...args, timezone: args.timezone || clock.tz };
  const wantsTomorrow = /\btomorrow\b|\btmrw\b|\btomm?orrow\b/.test(text);
  const wantsToday = /\btoday\b/.test(text);
  const wantsDayAfter = /day after tomorrow|overmorrow/.test(text);

  const forceDate = wantsDayAfter
    ? clock.now.plus({ days: 2 })
    : wantsTomorrow
      ? clock.tomorrow
      : wantsToday
        ? clock.now
        : null;

  if (name === "checkAvailability") {
    let start = parseDt(out.startDate, clock.tz) || clock.now;
    let end = parseDt(out.endDate, clock.tz) || start.plus({ days: 2 });

    if (forceDate) {
      // Search the forced day (full business window)
      start = forceDate.startOf("day");
      end = forceDate.endOf("day");
    } else {
      // If model picked a date more than 2 days in the past, snap to today
      if (start < clock.now.minus({ days: 2 })) {
        start = clock.now;
        end = clock.now.plus({ days: 3 });
      }
    }

    // Guard absurd far-future (> 120 days)
    if (start > clock.now.plus({ days: 120 })) {
      start = clock.now;
      end = clock.now.plus({ days: 3 });
    }

    out.startDate = start.toISO();
    out.endDate = end.toISO();
    out.timezone = clock.tz;
    out._resolved = {
      today: clock.todayLabel,
      tomorrow: clock.tomorrowLabel,
      searchStart: out.startDate,
      searchEnd: out.endDate
    };
    return out;
  }

  if (name === "createMeeting") {
    let start = parseDt(out.startISO, clock.tz);
    if (!start) {
      out._dateError = `Invalid startISO "${out.startISO}". Today is ${clock.todayLabel} (${clock.tz}).`;
      return out;
    }

    if (forceDate) {
      start = forceDate.set({
        hour: start.hour,
        minute: start.minute,
        second: 0,
        millisecond: 0
      });
    }

    // If model booked a past date (or wrong month like January when we're in Sep), reject unless forced relative
    if (!forceDate) {
      if (start < clock.now.minus({ hours: 1 })) {
        out._dateError =
          `The proposed time ${start.toFormat("d LLLL yyyy HH:mm")} is in the past. ` +
          `Today is ${clock.todayLabel}. Ask the user to confirm a future date (e.g. tomorrow = ${clock.tomorrowLabel}).`;
        return out;
      }
      // Same calendar day-of-month but wrong month more than 14 days away from a relative-looking request
      const driftDays = Math.abs(start.diff(clock.now, "days").days);
      if (driftDays > 60 && !/\b20\d{2}\b|\bjan|\bfeb|\bmar|\bapr|\bmay|\bjun|\bjul|\baug|\bsep|\boct|\bnov|\bdec/i.test(text)) {
        out._dateError =
          `Date ${start.toFormat("d LLLL yyyy")} looks wrong vs today (${clock.todayLabel}). ` +
          `If the user meant tomorrow, use ${clock.tomorrowLabel}. Confirm with the user before booking.`;
        return out;
      }
    }

    out.startISO = start.setZone(clock.tz).toISO();
    out.timezone = clock.tz;
    out._resolved = {
      today: clock.todayLabel,
      tomorrow: clock.tomorrowLabel,
      startISO: out.startISO,
      human: start.setZone(clock.tz).toFormat("cccc, d LLLL yyyy, HH:mm ZZZZ")
    };
    return out;
  }

  return out;
}

async function runTool(name, args, timezone) {
  if (name === "checkAvailability") {
    return checkAvailability({
      ...args,
      timezone: args.timezone || timezone
    });
  }
  if (name === "createMeeting") {
    return createMeeting({
      ...args,
      durationMinutes: args.durationMinutes || 30
    });
  }
  if (name === "openSitePanel") {
    const panelId = Number(args?.panelId);
    const titles = {
      1: "Casino Games",
      2: "Casual & Hyper-Casual / e-instant",
      3: "About Our Team",
      4: "Technology & Services",
      5: "Portfolio & Clients"
    };
    if (!Number.isFinite(panelId) || panelId < 1 || panelId > 5) {
      return { ok: false, error: "panelId must be 1–5" };
    }
    return { ok: true, panelId, panelTitle: titles[panelId] };
  }
  return { error: `Unknown tool: ${name}` };
}

function looksLikeFakeBookingClaim(text) {
  return /booked|scheduled|confirmed|added to (your |the )?calendar|meeting is set|you're all set|i('ve| have) arranged/i.test(
    String(text || "")
  );
}

async function chatOrchestrator({ messages, timezone, viewContext }) {
  const apiKey = loadDeepseekApiKey();
  if (!apiKey) {
    return { reply: "Server is not configured yet for AI. Please try again later." };
  }

  const tz = timezone || serverConfig?.calendar?.timezone || DEFAULT_TZ;
  const opts = llmOpts();

  const systemPrompt = buildSystemPrompt(tz, viewContext);
  const normalized = normalizeIncomingMessages(
    messages,
    opts.maxMessageChars,
    opts.historyMessages
  );
  const userText = lastUserText(normalized);
  const convo = [{ role: "system", content: systemPrompt }, ...normalized];
  const tools = toolDefinitions();

  let booking = null;
  let navigate = null;
  let lastCreateError = null;
  let createAttempted = false;

  for (let round = 0; round < opts.maxToolRounds; round++) {
    let response;
    try {
      response = await deepseekChat({
        apiKey,
        model: opts.model,
        messages: convo,
        tools,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (/402|Insufficient Balance/i.test(msg)) {
        return {
          reply:
            "DeepSeek reports insufficient balance on this API key. Please top up the DeepSeek account, then try again."
        };
      }
      if (/401|Unauthorized|invalid.*key/i.test(msg)) {
        return { reply: "DeepSeek API key looks invalid. Please check secrets/deepseek.key." };
      }
      throw err;
    }

    const assistantMessage = response?.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls || [];

    if (!toolCalls.length) {
      let reply = assistantMessage?.content || "";

      if (!booking && looksLikeFakeBookingClaim(reply)) {
        if (createAttempted && lastCreateError) {
          reply =
            `I could not complete the calendar booking.\n\n${lastCreateError}\n\n` +
            "Please try again, or email ajit.r@nettybrain.com.";
        } else {
          reply =
            "I have not created a calendar event yet. Please confirm your name, email, topic, " +
            "and preferred date/time (IST), and I will call the booking tool to place it on the calendar.";
        }
      }

      if (booking?.eventUrl) {
        const when = booking.startISO
          ? DateTime.fromISO(booking.startISO).setZone(tz).toFormat("cccc, d LLLL yyyy, HH:mm ZZZZ")
          : "";
        const link = booking.eventUrl;
        reply = `Your meeting is booked for ${when}.\n\nCalendar link: ${link}`;
      }

      return { reply, booking, navigate };
    }

    convo.push({
      role: "assistant",
      content: assistantMessage?.content || "",
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const name = toolCall?.function?.name;
      const rawArgs = toolCall?.function?.arguments || "{}";
      const id = toolCall?.id;

      let args = {};
      try {
        args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      } catch (_) {
        args = {};
      }

      const corrected =
        name === "openSitePanel" ? args : correctToolArgs(name, args, tz, userText);
      // eslint-disable-next-line no-console
      console.log(`[agent] tool ${name} raw=`, JSON.stringify(args));
      // eslint-disable-next-line no-console
      console.log(`[agent] tool ${name} fixed=`, JSON.stringify(corrected));

      let toolResult;
      try {
        if (corrected._dateError) {
          toolResult = { error: corrected._dateError };
          if (name === "createMeeting") {
            createAttempted = true;
            lastCreateError = corrected._dateError;
          }
        } else {
          toolResult = await runTool(name, corrected, tz);
          if (name === "openSitePanel" && toolResult?.ok) {
            navigate = { type: "openPanel", panelId: toolResult.panelId };
          }
          if (name === "createMeeting") {
            createAttempted = true;
            if (toolResult?.eventUrl) {
              booking = {
                eventUrl: toolResult.eventUrl,
                startISO: toolResult.startISO,
                endISO: toolResult.endISO
              };
              lastCreateError = null;
              // eslint-disable-next-line no-console
              console.log("[agent] booking OK", booking.startISO, booking.eventUrl);
            } else if (toolResult?.error) {
              lastCreateError = toolResult.error;
            }
          }
          if (name === "checkAvailability" && toolResult?.error) {
            // eslint-disable-next-line no-console
            console.warn("[agent] availability error", toolResult.error);
          }
        }
      } catch (toolErr) {
        const errMsg = String(toolErr?.message || toolErr);
        if (name === "createMeeting") {
          createAttempted = true;
          lastCreateError = errMsg;
        }
        toolResult = {
          error: errMsg,
          hint:
            /404|notFound|Not Found|Share calendar/i.test(errMsg)
              ? "Share the Google Calendar with the service account (Make changes to events)."
              : "Check calendar secrets and sharing."
        };
        // eslint-disable-next-line no-console
        console.warn(`[agent] tool ${name} failed`, errMsg);
      }

      convo.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(compactToolResult(name, toolResult))
      });
    }
  }

  if (booking?.eventUrl) {
    const when = DateTime.fromISO(booking.startISO).setZone(tz).toFormat("cccc, d LLLL yyyy, HH:mm ZZZZ");
    return {
      reply: `Your meeting is booked.\n\nWhen: ${when}\nCalendar: ${booking.eventUrl}`,
      booking,
      navigate
    };
  }
  return {
    reply:
      lastCreateError
        ? `I could not finish booking: ${lastCreateError}`
        : "I need a bit more detail (name, email, topic, and a confirmed time) to place this on the calendar.",
    booking,
    navigate
  };
}

module.exports = { chatOrchestrator, getClock, correctToolArgs, setKnowledgeProvider };
