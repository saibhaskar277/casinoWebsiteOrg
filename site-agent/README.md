# site-agent

Portable website AI assistant: **chat UI + DeepSeek LLM + optional Google Calendar + optional site navigation**.

Copy this entire `site-agent/` folder into another website. An AI coding agent (Cursor / Claude) should read this README and wire the host site by **config + adapters**, not by rewriting the core.

---

## Folder map

```
site-agent/
  README.md                 ← you are here
  package.json              ← Node entry for the server package
  config/
    client.config.json      ← widget UI / API URLs / features
    server.config.json      ← LLM, calendar, CORS, brand name
    site.profile.json       ← sections, intents, greetings, navigator type
    knowledge.json          ← static facts for the LLM (swap or replace with RAG)
  client/                   ← browser widget (ES modules)
    bootstrap.js            ← load this from your HTML
    core/AgentApp.js        ← application service (SOLID)
    ui/                     ← chat panel view
    adapters/               ← swappable ports (navigator, voice, transport, guide)
    assets/                 ← CSS + mascot SVG
  server/                   ← Node chat API
    index.js                ← public exports
    local-server.js         ← `node site-agent/server/local-server.js`
    handleChatRequest.js
    orchestrator/           ← LLM + tools loop
    llm/                    ← DeepSeek client
    tools/                  ← Google Calendar tools
    knowledge/              ← StaticKnowledgeProvider (RAG hook)
  secrets/README.md         ← where to put API keys (do not commit keys)
```

---

## SOLID design (what to swap)

| Concern | Abstraction | Default | Swap when… |
|--------|-------------|---------|------------|
| Open a page/section | `SiteNavigator` | `DomOpenPanelNavigator` or `NullSiteNavigator` | Host site has no `openPanel`, uses routes, React router, etc. |
| Local greetings / intents | `ProfileSiteGuide` | Driven by `site.profile.json` | Different sections / copy |
| Chat HTTP | `HttpChatTransport` | POST `/api/chat` | Different API path |
| Voice | `WebSpeechVoiceAdapter` / `NullVoiceAdapter` | Browser Web Speech | Disable voice in config |
| Knowledge for LLM | `KnowledgeProvider` | `StaticKnowledgeProvider` + `knowledge.json` | You want **RAG** |
| Calendar | `calendarTools.js` | Google Calendar SA | Different calendar ID / disable booking |

**Navigation is intentionally middle-layer / swappable.**  
`AgentApp` never calls `window.openPanel` directly. It calls `navigator.open(sectionId)`.  
Set `site.profile.json → navigator.type` to `"null"` on sites without panels.

---

## Quick start on a new website

### 1. Copy the folder

```text
your-site/
  site-agent/     ← paste whole package
  secrets/        ← deepseek.key, google-calendar-sa.json (gitignored)
  index.html
```

### 2. Add secrets

| File | Content |
|------|---------|
| `secrets/deepseek.key` | DeepSeek API key (plain text) |
| `secrets/google-calendar-sa.json` | Google service-account JSON (optional if booking off) |

Or env: `DEEPSEEK_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`.

Share the Google Calendar with the service-account email (**Make changes to events**).

### 3. Edit configs (minimum)

**`config/client.config.json`**

- `branding.title`, `branding.mascotAsset`
- `ui.starterPrompts`
- `features.siteNavigation`: `false` if the site has no panels
- `api.chatUrl` / `localChatPort`

**`config/site.profile.json`**

- Rewrite `sections[]` (id, key, title, blurb, detail, patterns, followUps)
- Set navigator:

```json
"navigator": { "type": "null" }
```

Or keep island-style globals:

```json
"navigator": {
  "type": "domOpenPanel",
  "options": {
    "openGlobal": "openPanel",
    "closeGlobal": "closePanel",
    "panelElementId": "panel",
    "panelIdDataset": "panel"
  }
}
```

**`config/knowledge.json`** — facts for this product (contact, services, titles).  
**`config/server.config.json`** — `calendar.calendarId`, `corsOrigins`, `llm.*`, `brand.assistantName`.

### 4. Load the widget in HTML

```html
<script type="module" src="/site-agent/client/bootstrap.js"></script>
```

Serve `site-agent/` as static files (same origin as the page).

### 5. Run the API locally

```bash
node site-agent/server/local-server.js
```

Then open the site on `http://127.0.0.1:3000` (or any origin listed in `corsOrigins`).  
On localhost, the widget talks to `http://127.0.0.1:8787/api/chat`.

### 6. Production (Firebase example)

- Hosting: deploy `site-agent/` under the public root (or copy in your prepare script).
- Functions: depend on this package and export `handleChatRequest`:

```js
const { handleChatRequest } = require("site-agent");
// or: require("./path/to/site-agent/server")
```

Rewrite `/api/chat` → that function. Set secrets in the host platform.

---

## Custom navigator (other sites)

1. Create `client/adapters/MyRouterNavigator.js` implementing:

```js
open(sectionId) → { ok, sectionId?, error? }
close() → { ok, error? }
getCurrentSectionId() → id | null
```

2. Register it in `createSiteNavigator.js`:

```js
case "myRouter":
  return new MyRouterNavigator(options);
```

3. Set `site.profile.json`:

```json
"navigator": { "type": "myRouter", "options": { "...": "..." } }
```

No changes needed in `AgentApp`.

---

## Adding RAG later

1. Implement a class with `getFacts(viewContext)` that retrieves chunks and returns a compact string/object.
2. On server boot:

```js
const { setKnowledgeProvider, PassthroughKnowledgeProvider } = require("site-agent");
setKnowledgeProvider(new PassthroughKnowledgeProvider(async (ctx) => {
  // retrieve → return { co, docs: "..." } or a string
}));
```

Keep prompts short; inject only top-k chunks.

---

## Dependency injection (tests / hosts)

```js
import { AgentApp } from "./core/AgentApp.js";

new AgentApp({
  config,
  siteProfile,
  mountNode,
  navigator: myNavigator,  // optional override
  guide: myGuide,          // optional
  transport: myTransport,
  voiceAdapter: myVoice
});
```

---

## This Netty Brains repo

- Widget URL: `/site-agent/client/bootstrap.js`
- Local API: `node site-agent/server/local-server.js` (shim: `node functions/local-server.js`)
- Firebase Functions re-export from `site-agent` via `file:../site-agent`
- Legacy `/plugins/agent` redirects to this package

---

## Checklist for porting

- [ ] Copy `site-agent/`
- [ ] Add secrets / env keys
- [ ] Rewrite `site.profile.json` + `knowledge.json`
- [ ] Set navigator to `null` or a custom adapter
- [ ] Point HTML at `bootstrap.js`
- [ ] Serve static `site-agent/`
- [ ] Run / deploy chat API
- [ ] Update CORS origins
- [ ] (Optional) Plug RAG via `setKnowledgeProvider`
