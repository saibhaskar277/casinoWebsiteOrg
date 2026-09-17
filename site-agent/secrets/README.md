# Secrets (do not commit real keys)

Place these next to your host project (recommended path: `<repo>/secrets/`):

| File | Purpose |
|------|---------|
| `deepseek.key` | DeepSeek API key (plain text) |
| `google-calendar-sa.json` | Google Calendar service-account JSON |

Or set env vars:

- `DEEPSEEK_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_CALENDAR_ID`

See `../README.md` for full setup.
