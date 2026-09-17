# Secrets (local only — gitignored)

Put private credentials here. Nothing in this folder is deployed to Firebase Hosting.

| File | Purpose |
|------|---------|
| `google-calendar-sa.json` | Google service-account key for Calendar API |
| `deepseek.key` | DeepSeek API key (one line) |

## Local development

```bash
# Terminal 1 — chat API (loads secrets from this folder)
node functions/local-server.js

# Terminal 2 — static site
npx --yes serve .
```

On localhost the widget calls `http://127.0.0.1:8787/api/chat`.

## Production (Firebase)

```bash
firebase functions:secrets:set GOOGLE_CALENDAR_ID
# paste: sai.bhaskar277@gmail.com

Get-Content secrets/google-calendar-sa.json -Raw | firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_JSON

Get-Content secrets/deepseek.key -Raw | firebase functions:secrets:set DEEPSEEK_API_KEY

cd functions; npm install; cd ..
firebase deploy --only functions,hosting
```

## Calendar share reminder

Share `sai.bhaskar277@gmail.com` with the `client_email` **inside** `google-calendar-sa.json`
(permission: Make changes to events).
