/**
 * One-shot calendar access check + optional meeting create.
 * Usage: node functions/scripts/test-calendar-booking.js
 */
const path = require("path");
process.chdir(path.join(__dirname, "..", ".."));

const { checkAvailability, createMeeting } = require("../src/agent/tools/calendarTools");
const sa = require("../../secrets/google-calendar-sa.json");

async function main() {
  console.log("Service account:", sa.client_email);
  console.log("Target calendar: sai.bhaskar277@gmail.com");
  console.log("");

  const avail = await checkAvailability({
    startDate: "2026-09-17T14:00:00+05:30",
    endDate: "2026-09-17T16:00:00+05:30",
    timezone: "Asia/Kolkata"
  });
  console.log("Availability:", JSON.stringify(avail, null, 2));

  if (avail.error) {
    console.log("\nFIX REQUIRED:");
    console.log("1. Open https://calendar.google.com while logged in as sai.bhaskar277@gmail.com");
    console.log("2. Settings (gear) → Settings for my calendars → sai.bhaskar277@gmail.com");
    console.log("3. Share with specific people → Add people:");
    console.log("   " + sa.client_email);
    console.log('4. Permission: "Make changes to events" → Send');
    console.log("5. Re-run this script.");
    process.exit(2);
  }

  const meeting = await createMeeting({
    visitorName: "Mat",
    visitorEmail: "saibhaskarbgs@gmail.com",
    topic: "AI project discussion",
    startISO: "2026-09-17T15:00:00+05:30",
    durationMinutes: 30
  });
  console.log("\nMeeting created:");
  console.log(JSON.stringify(meeting, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
