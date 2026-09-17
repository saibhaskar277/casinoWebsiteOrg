# Netty Brains — Treasure Island

Static WebGL landing page (`index.html` + `island-scene.js`).

## Live URL

Firebase Hosting:

`https://nettybrainswebsite.web.app/`

The GitHub Pages URL redirects there:

`https://saibhaskar277.github.io/casinoWebsiteOrg/`

## Local preview

Serve the repo root (not a subfolder) so asset paths resolve:

```bash
# Terminal 1 — AI chat API (uses secrets/deepseek.key + google-calendar-sa.json)
node site-agent/server/local-server.js
# (shim still works: node functions/local-server.js)

# Terminal 2 — website
npx --yes serve .
```

Then open the URL it prints (usually `http://localhost:3000`). On localhost the chat widget calls `http://127.0.0.1:8787/api/chat`.

## Deploy

### Firebase (live site)

From the repo root (requires `firebase login`):

```bash
node scripts/prepare-hosting.mjs
firebase deploy --only hosting
```

Pushes to `main` also deploy via [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml). Add a GitHub secret named `FIREBASE_SERVICE_ACCOUNT_NETTYBRAINSWEBSITE` (service account JSON from Firebase → Project settings → Service accounts).

### GitHub Pages

Pushes to `main` publish a redirect page so old `github.io` links still work.

## Custom domain (later)

1. Firebase console → **Hosting** → **Add custom domain**.
2. Point DNS as Firebase instructs (usually A/AAAA or CNAME records).
3. Wait for SSL to provision.

## AI assistant (portable `site-agent/`)

All chat + calendar + optional navigation lives in **[`site-agent/`](site-agent/)**.  
Read **[`site-agent/README.md`](site-agent/README.md)** to port it to another website (config + adapters, SOLID).

Frontend:
- Widget: [`site-agent/client/`](site-agent/client/) (`/site-agent/client/bootstrap.js`)
- Site sections / navigator: [`site-agent/config/site.profile.json`](site-agent/config/site.profile.json)
- Client flags: [`site-agent/config/client.config.json`](site-agent/config/client.config.json)

Backend:
- Server package: [`site-agent/server/`](site-agent/server/)
- Firebase Functions re-export via `site-agent` (`file:../site-agent`)

### Enable / disable
Edit [`site-agent/config/client.config.json`](site-agent/config/client.config.json):
- `"enabled": true` mounts the widget
- `"enabled": false` leaves the island landing page unchanged

### Local secrets folder
Service-account JSON lives at (gitignored):

`secrets/google-calendar-sa.json`

Calendar ID is configured in:

`site-agent/config/server.config.json` → `calendar.calendarId`

**Important:** share your Google Calendar with the `client_email` **inside** that JSON key (not a different service-account name). Permission: **Make changes to events**.

### Required secrets (Firebase Functions — production)
```bash
# Calendar ID
firebase functions:secrets:set GOOGLE_CALENDAR_ID
# paste: sai.bhaskar277@gmail.com

# Service account JSON (whole file)
Get-Content secrets/google-calendar-sa.json -Raw | firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_JSON

# DeepSeek (paste when ready)
firebase functions:secrets:set DEEPSEEK_API_KEY
```

Then:

```bash
cd functions && npm install
cd ..
firebase deploy --only functions,hosting
```

Optional tuning:
- `BUSINESS_START_HOUR` (default `10`)
- `BUSINESS_END_HOUR` (default `18`)
- `MEETING_DURATION_MINUTES` (default `30`)

### Google Calendar setup (service account)
1. Enable **Google Calendar API** in Google Cloud Console.
2. Create a **service account**, download JSON key → save as `secrets/google-calendar-sa.json`.
3. Share calendar `sai.bhaskar277@gmail.com` with that key’s `client_email` (“Make changes to events”).

### Voice (STT/TTS) note
Voice uses the browser's Web Speech APIs (local browser functionality for TTS; STT quality depends on the browser).
