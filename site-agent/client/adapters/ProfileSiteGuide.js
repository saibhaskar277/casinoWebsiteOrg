/**
 * Config-driven local guide (no LLM): greetings, section intents, follow-ups.
 * Site-specific content lives in config/site.profile.json — swap that file for a new site.
 */
const OPEN_VERBS =
  /\b(show|open|see|view|take me|go to|display|look at|switch to|bring up)\b/i;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePatterns(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => {
      try {
        return new RegExp(escapeRegex(p), "i");
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

export class ProfileSiteGuide {
  /**
   * @param {object} siteProfile
   * @param {{ greetedKey?: string }} [options]
   */
  constructor(siteProfile, options = {}) {
    this.profile = siteProfile || {};
    this._openedKey = options.greetedKey || "site-agent-panel-opened";
    this.sections = Array.isArray(this.profile.sections) ? this.profile.sections : [];
    this._byId = new Map(this.sections.map((s) => [Number(s.id), s]));
    this._rules = this.sections.map((s) => ({
      section: s,
      patterns: compilePatterns(s.patterns)
    }));
    this._bookingSkip = compilePatterns(this.profile.bookingSkipPatterns || []);
  }

  getSection(id) {
    return this._byId.get(Number(id)) || null;
  }

  greetingOnOpen() {
    let opened = false;
    try {
      opened = sessionStorage.getItem(this._openedKey) === "1";
    } catch (_) {
      /* ignore */
    }
    const g = this.profile.greetings || {};
    if (!opened) {
      try {
        sessionStorage.setItem(this._openedKey, "1");
      } catch (_) {
        /* ignore */
      }
      return {
        kind: "hello",
        text: g.hello || "Hi! Ask me anything, or tap a suggestion below."
      };
    }
    return {
      kind: "welcomeBack",
      text: g.welcomeBack || "Welcome back! How can I help?"
    };
  }

  matchIntent(text, opts = {}) {
    const t = String(text || "").trim();
    if (!t) return null;

    const bookingHit = this._bookingSkip.some((p) => p.test(t));
    const sectionHit = this._rules.some((r) => r.patterns.some((p) => p.test(t)));
    if (bookingHit && !OPEN_VERBS.test(t) && !sectionHit) return null;
    if (bookingHit && !sectionHit) return null;

    const wantsOpen = OPEN_VERBS.test(t);
    const isQuestion = /\b(what|how|why|tell|explain|difference|about|which|who|where)\b|\?/i.test(t);
    const currentId = Number(opts.currentPanelId ?? opts.currentSectionId) || null;

    for (const rule of this._rules) {
      if (!rule.patterns.some((p) => p.test(t))) continue;
      const section = rule.section;
      const alreadyOpen = currentId === Number(section.id);
      return {
        panelId: section.id,
        sectionId: section.id,
        panel: section,
        section,
        shouldOpen: true,
        alreadyOpen,
        localOnly: wantsOpen && !isQuestion
      };
    }
    return null;
  }

  pageDetail(sectionId) {
    const s = this.getSection(sectionId);
    return s?.detail || s?.blurb || "";
  }

  followUps({ panelId, sectionId, lastUserText } = {}) {
    const id = Number(sectionId ?? panelId) || 0;
    const section = this.getSection(id);
    if (section?.followUps?.length) return [...section.followUps];
    return [...(this.profile.defaultFollowUps || [])];
  }

  viewContextFromDom(navigator) {
    const id =
      typeof navigator?.getCurrentSectionId === "function"
        ? navigator.getCurrentSectionId()
        : null;
    const section = id != null ? this.getSection(id) : null;
    const open = id != null;
    return {
      panelOpen: open,
      panelId: open ? Number(id) : null,
      panelTitle: section?.title || (open ? `Section ${id}` : "Home (no section open)"),
      panelKey: section?.key || "home"
    };
  }
}
