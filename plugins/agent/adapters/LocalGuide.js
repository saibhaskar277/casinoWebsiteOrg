/**
 * Local (no-LLM) site guide: greetings, intent→panel, follow-up chips.
 */
export const SITE_PANELS = {
  1: {
    id: 1,
    key: "casino",
    title: "Casino Games",
    blurb:
      "Here’s our Casino Games section — slots and custom builds for Web, Mobile, and EGMs, with strong math and certification focus.",
    detail:
      "On this page: casino slots & custom builds for Web, Mobile, and EGMs — math, RTP, and certification-ready."
  },
  2: {
    id: 2,
    key: "casual",
    title: "Casual & Hyper-Casual",
    blurb:
      "Here’s Casual & Hyper-Casual — quick-to-learn games built for retention, plus our e-instant style titles.",
    detail:
      "On this page: casual / hyper-casual and e-instant titles — fast to learn, built for retention and sessions."
  },
  3: {
    id: 3,
    key: "team",
    title: "About Our Team",
    blurb: "Here’s the crew behind Netty Brains — a small studio focused on craft, math, and player trust.",
    detail: "On this page: the Netty Brains crew — a small studio focused on craft, math, and player trust."
  },
  4: {
    id: 4,
    key: "tech",
    title: "Technology & Services",
    blurb:
      "Here’s our Technology & Services — Unity/HTML5, RGS & math, integrations, compliance, and LiveOps support.",
    detail:
      "On this page: Unity/HTML5, RGS & math, integrations, compliance, and LiveOps support."
  },
  5: {
    id: 5,
    key: "portfolio",
    title: "Portfolio & Clients",
    blurb: "Here’s our Portfolio — selected casino, casual, and e-instant work.",
    detail: "On this page: selected portfolio work across casino, casual, and e-instant."
  }
};

const INTENT_RULES = [
  {
    panelId: 1,
    patterns: [/casino/i, /slot/i, /\brtp\b/i, /egli|egm/i, /real[\s-]?money/i]
  },
  {
    panelId: 2,
    patterns: [
      /casual/i,
      /hyper[\s-]?casual/i,
      /e[\s-]?instant/i,
      /hypercasual/i,
      /arcade/i,
      /bubble shoot/i,
      /archery/i
    ]
  },
  {
    panelId: 3,
    patterns: [/team/i, /about (the )?crew/i, /founder/i, /pavan|shrikanth/i]
  },
  {
    panelId: 4,
    patterns: [/tech(nology)?/i, /stack/i, /\bservices?\b/i, /unity/i, /integration/i, /compliance/i]
  },
  {
    panelId: 5,
    patterns: [/portfolio/i, /clients?/i, /case stud/i, /selected work/i]
  }
];

const OPEN_VERBS =
  /\b(show|open|see|view|take me|go to|display|look at|switch to|bring up)\b/i;

const BOOKING_ONLY = /\b(book|booking|meeting|calendar|schedule|availability|slot)\b/i;

export class LocalGuide {
  constructor() {
    this._openedKey = "netty-agent-panel-opened";
  }

  greetingOnOpen() {
    let opened = false;
    try {
      opened = sessionStorage.getItem(this._openedKey) === "1";
    } catch (_) {
      /* ignore */
    }
    if (!opened) {
      try {
        sessionStorage.setItem(this._openedKey, "1");
      } catch (_) {
        /* ignore */
      }
      return {
        kind: "hello",
        text: "Hi! I’m Netty Brains’ guide. Ask about our games, tech, or book a meeting — or tap a suggestion below."
      };
    }
    return {
      kind: "welcomeBack",
      text: "Welcome back! Want to pick up where we left off — casino games, e-instant / casual, or book a meeting?"
    };
  }

  /**
   * Match a site section. Opens for topic questions and explicit show/open.
   * @param {string} text
   * @param {{ currentPanelId?: number|null }} [opts]
   */
  matchIntent(text, opts = {}) {
    const t = String(text || "").trim();
    if (!t) return null;

    // Booking flow should not yank the island panels around.
    if (BOOKING_ONLY.test(t) && !OPEN_VERBS.test(t) && !INTENT_RULES.some((r) => r.patterns.some((p) => p.test(t)))) {
      return null;
    }
    if (BOOKING_ONLY.test(t) && !/(casino|casual|e-?instant|team|tech|portfolio|slot)/i.test(t)) {
      return null;
    }

    const wantsOpen = OPEN_VERBS.test(t);
    const isQuestion = /\b(what|how|why|tell|explain|difference|about|which|who|where)\b|\?/i.test(t);
    const currentId = Number(opts.currentPanelId) || null;

    for (const rule of INTENT_RULES) {
      if (!rule.patterns.some((p) => p.test(t))) continue;
      const alreadyOpen = currentId === rule.panelId;
      return {
        panelId: rule.panelId,
        panel: SITE_PANELS[rule.panelId],
        // Open (or bring back) whenever this section is relevant.
        shouldOpen: true,
        alreadyOpen,
        // Pure "show/open X" → local blurb only. Questions → LLM after open.
        localOnly: wantsOpen && !isQuestion
      };
    }
    return null;
  }

  pageDetail(panelId) {
    const meta = SITE_PANELS[Number(panelId)];
    return meta?.detail || meta?.blurb || "";
  }

  followUps({ panelId, lastUserText } = {}) {
    const id = Number(panelId) || 0;
    const t = String(lastUserText || "").toLowerCase();

    if (id === 1 || /casino|slot/.test(t)) {
      return [
        "What’s different about e-instant?",
        "Tell me about your math / RTP",
        "Show casual games",
        "I want to book a meeting"
      ];
    }
    if (id === 2 || /casual|e-?instant|hyper/.test(t)) {
      return [
        "What’s different about e-instant?",
        "Tell me about casino math / RTP",
        "Show casino games",
        "Book a meeting"
      ];
    }
    if (id === 3) {
      return ["Tell me about your tech stack", "Show casino games", "Book a meeting"];
    }
    if (id === 4) {
      return ["Tell me about casino games", "Show casual games", "Book a meeting"];
    }
    if (id === 5) {
      return ["Tell me about casino games", "Show casual games", "Book a meeting"];
    }

    return [
      "Show casino games",
      "Show e-instant / casual games",
      "Tell me about your technology",
      "Book a meeting"
    ];
  }

  viewContextFromDom() {
    const panel = document.getElementById("panel");
    const open = !!(panel && panel.classList.contains("open"));
    const id = open ? Number(panel.dataset.panel || 0) : 0;
    const meta = SITE_PANELS[id] || null;
    return {
      panelOpen: open,
      panelId: id || null,
      panelTitle: meta?.title || (open ? `Panel ${id}` : "Island home (no panel open)"),
      panelKey: meta?.key || "home"
    };
  }
}
