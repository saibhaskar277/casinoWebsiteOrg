const { google } = require("googleapis");
const { DateTime } = require("luxon");
const { loadGoogleServiceAccountJson } = require("../secretsLoader");

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

const serverConfig = (() => {
  try {
    return require("../../config/server.config.json");
  } catch (_) {
    return {};
  }
})();

function loadServiceAccount() {
  const jsonRaw = loadGoogleServiceAccountJson();
  if (!jsonRaw) {
    throw new Error(
      "Missing Google service account. Set GOOGLE_SERVICE_ACCOUNT_JSON or place secrets/google-calendar-sa.json"
    );
  }
  return typeof jsonRaw === "string" ? JSON.parse(jsonRaw) : jsonRaw;
}

function getCalendarId() {
  return (
    process.env.GOOGLE_CALENDAR_ID ||
    serverConfig?.calendar?.calendarId ||
    ""
  );
}

function getCalendarClient() {
  const sa = loadServiceAccount();
  const calendarId = getCalendarId();
  if (!calendarId) {
    throw new Error("Missing GOOGLE_CALENDAR_ID / site-agent/config/server.config.json calendar.calendarId");
  }

  const auth = new google.auth.JWT(sa.client_email, undefined, sa.private_key, [CALENDAR_SCOPE]);
  const calendar = google.calendar({ version: "v3", auth });
  return { calendar, calendarId };
}

function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function roundUpToNextHalfHour(dt) {
  const minute = dt.minute;
  const rounded = minute < 30 ? 30 : 60;
  if (rounded === 60) return dt.plus({ hours: 1 }).set({ minute: 0, second: 0, millisecond: 0 });
  return dt.set({ minute: 30, second: 0, millisecond: 0 });
}

async function checkAvailability({ startDate, endDate, timezone }) {
  const { calendar, calendarId } = getCalendarClient();

  const tz = timezone || serverConfig?.calendar?.timezone || "Asia/Kolkata";
  const start = DateTime.fromISO(String(startDate), { zone: tz });
  const end = DateTime.fromISO(String(endDate), { zone: tz });

  if (!start.isValid || !end.isValid) {
    return { slots: [], error: "Invalid startDate/endDate" };
  }
  if (end <= start) {
    return { slots: [] };
  }

  const businessStartHour = Number(
    process.env.BUSINESS_START_HOUR || serverConfig?.calendar?.businessStartHour || 10
  );
  const businessEndHour = Number(
    process.env.BUSINESS_END_HOUR || serverConfig?.calendar?.businessEndHour || 18
  );
  const stepMinutes = Number(
    process.env.MEETING_DURATION_MINUTES || serverConfig?.calendar?.meetingDurationMinutes || 30
  );

  const timeMin = start.toUTC().toISO();
  const timeMax = end.toUTC().toISO();

  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    }
  });

  const calBusy = freebusyRes.data?.calendars?.[calendarId] || {};
  if (Array.isArray(calBusy.errors) && calBusy.errors.length) {
    const reason = calBusy.errors.map((e) => e.reason || e.message).join(", ");
    return {
      slots: [],
      error: `Calendar not accessible (${reason}). Share calendar ${calendarId} with service account ${loadServiceAccount().client_email} as "Make changes to events".`
    };
  }

  const busy = calBusy.busy || [];

  const busyIntervals = busy
    .map((b) => ({
      start: DateTime.fromISO(b.start).toUTC(),
      end: DateTime.fromISO(b.end).toUTC()
    }))
    .filter((i) => i.start.isValid && i.end.isValid);

  let cursor = start;
  if (cursor.minute !== 0 && cursor.minute !== 30) cursor = roundUpToNextHalfHour(cursor);
  cursor = cursor.set({ second: 0, millisecond: 0 });

  const maxSlots = Number(
    process.env.MAX_SLOTS_RETURNED || serverConfig?.calendar?.maxSlotsReturned || 5
  );

  const slots = [];
  while (cursor < end && slots.length < maxSlots) {
    const weekday = cursor.weekday;
    const isWeekday = weekday >= 1 && weekday <= 5;
    const isInHours = cursor.hour >= businessStartHour && cursor.hour < businessEndHour;
    const slotEnd = cursor.plus({ minutes: stepMinutes });
    const slotEndHourOk =
      slotEnd.hour < businessEndHour || (slotEnd.hour === businessEndHour && slotEnd.minute === 0);

    if (isWeekday && isInHours && slotEndHourOk) {
      const slotStartUtc = cursor.toUTC();
      const slotEndUtc = slotEnd.toUTC();

      const isOverlapping = busyIntervals.some((bi) =>
        intervalsOverlap(
          slotStartUtc.toMillis(),
          slotEndUtc.toMillis(),
          bi.start.toMillis(),
          bi.end.toMillis()
        )
      );

      if (!isOverlapping) {
        slots.push({
          startISO: cursor.toISO(),
          endISO: slotEnd.toISO()
        });
      }
    }

    cursor = cursor.plus({ minutes: stepMinutes });
  }

  return { slots };
}

async function createMeeting({ visitorName, visitorEmail, topic, startISO, durationMinutes }) {
  const { calendar, calendarId } = getCalendarClient();
  const sa = loadServiceAccount();

  const email = String(visitorEmail || "").trim();
  const name = String(visitorName || "").trim();
  const tpc = String(topic || "").trim();

  if (!name || !emailLooksValid(email) || !tpc) {
    throw new Error("Missing or invalid visitorName / visitorEmail / topic");
  }
  const dur = Number(
    durationMinutes ||
      process.env.MEETING_DURATION_MINUTES ||
      serverConfig?.calendar?.meetingDurationMinutes ||
      30
  );
  if (!Number.isFinite(dur) || dur <= 0) throw new Error("Invalid durationMinutes");

  // Prefer Asia/Kolkata when the client sends a bare local-looking ISO without zone.
  let start = DateTime.fromISO(String(startISO), { setZone: true });
  if (!start.isValid) {
    start = DateTime.fromISO(String(startISO), { zone: serverConfig?.calendar?.timezone || "Asia/Kolkata" });
  }
  if (!start.isValid) throw new Error("Invalid startISO");
  const end = start.plus({ minutes: dur });

  const check = await checkAvailability({
    startDate: start.toISO(),
    endDate: end.toISO(),
    timezone: start.zoneName || serverConfig?.calendar?.timezone || "Asia/Kolkata"
  });
  if (check?.error) {
    throw new Error(check.error);
  }
  if (check?.slots?.length === 0) {
    throw new Error("Selected slot is no longer available");
  }

  const event = {
    summary: `Netty Brains meeting — ${tpc}`,
    description: `Visitor: ${name} (${email})\nTopic: ${tpc}\n\nNote: Guest invite email is listed here. Service-account bookings cannot auto-invite Gmail attendees without Google Workspace Domain-Wide Delegation.`,
    start: {
      dateTime: start.toISO(),
      timeZone: start.zoneName || "Asia/Kolkata"
    },
    end: {
      dateTime: end.toISO(),
      timeZone: end.zoneName || "Asia/Kolkata"
    }
  };

  // Personal Gmail + service accounts cannot add attendees (needs Workspace DWD).
  // Keep guest details in the description so the host still has contact info.
  let insertRes;
  try {
    insertRes = await calendar.events.insert({
      calendarId,
      requestBody: event
    });
  } catch (err) {
    const code = err?.code || err?.status;
    const msg = String(err?.message || err);
    if (code === 404) {
      throw new Error(
        `Calendar not found for service account. Share ${calendarId} with ${sa.client_email} (Make changes to events), then retry.`
      );
    }
    if (/Domain-Wide Delegation|attendees/i.test(msg)) {
      throw new Error(
        "Google blocked attendee invites for this service account. Event was not created — retry without invites."
      );
    }
    throw err;
  }

  const htmlLink = insertRes.data?.htmlLink || null;
  return {
    eventUrl: htmlLink,
    startISO: start.toISO(),
    endISO: end.toISO(),
    visitorEmail: email,
    visitorName: name,
    inviteNote:
      "Event created on host calendar. Auto-invite to guest requires Google Workspace Domain-Wide Delegation; guest email is in the event description."
  };
}

module.exports = { checkAvailability, createMeeting, getCalendarId };
