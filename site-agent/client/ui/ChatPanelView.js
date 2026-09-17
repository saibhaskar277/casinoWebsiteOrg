export class ChatPanelView {
  constructor({
    config,
    mascot,
    onSend,
    onToggleSpeaker,
    onToggleVoiceMic,
    onOpenChange,
    onSpeakMessage,
    voiceSupported = { stt: false, tts: false },
    speakerOn = false
  }) {
    this.config = config;
    this.mascot = mascot;
    this.onSend = onSend;
    this.onToggleSpeaker = onToggleSpeaker;
    this.onToggleVoiceMic = onToggleVoiceMic;
    this.onOpenChange = onOpenChange;
    this.onSpeakMessage = onSpeakMessage;
    this.voiceSupported = voiceSupported;

    this.root = null;
    this.widget = null;
    this.textarea = null;
    this.typingEl = null;
    this.toggleBtn = null;
    this.micBtn = null;
    this.speakerBtn = null;
    this.micHint = null;
    this.suggestionsEl = null;
    this.startersEl = null;
    this.chipsRowEl = null;
    this.messagesEl = null;

    this._open = false;
    this._micActive = false;
    this._speakerOn = !!speakerOn;
    this._messages = [];
  }

  mount(mountNode) {
    this.root = document.createElement("div");
    this.root.className = "netty-agent-root";
    this.root.id = "netty-agent-root";

    const brandTitle = escapeHtml(this.config.branding?.title || "Assistant");
    const brandTitleAttr = escapeAttr(this.config.branding?.title || "Assistant");
    const mascotUrl = configAssetUrl(this.config.branding?.mascotAsset, this.config.basePath);
    const sttOk = !!this.voiceSupported.stt;
    const ttsOk = !!this.voiceSupported.tts;

    this.root.innerHTML = `
      <button class="netty-agent-toggle" type="button" aria-label="Open ${brandTitleAttr} assistant" aria-expanded="false">
        <div class="netty-agent-mascot netty-agent-bob" data-role="toggle-mascot" aria-hidden="true">
          <img src="${escapeAttr(mascotUrl)}" alt="">
        </div>
      </button>

      <div class="netty-agent-widget" role="dialog" aria-label="${brandTitleAttr} chat widget" aria-hidden="true">
        <div class="netty-agent-header">
          <div class="netty-agent-mascot netty-agent-bob" data-role="header-mascot" aria-hidden="true">
            <img src="${escapeAttr(mascotUrl)}" alt="">
          </div>
          <div class="netty-agent-header-text">
            <div class="netty-agent-title">${brandTitle}</div>
            <div class="netty-agent-subtitle" data-role="subtitle">Ask · speak · listen</div>
          </div>
          <div class="netty-agent-actions">
            <button class="netty-agent-btn" type="button" data-act="speaker" aria-label="Toggle read-aloud" title="${ttsOk ? "Read replies aloud (TTS)" : "Speech not supported in this browser"}" ${ttsOk ? "" : "disabled"}>
              ${this._speakerOn ? "🔊" : "🔈"}
            </button>
            <button class="netty-agent-btn" type="button" data-act="close" aria-label="Close chat">✕</button>
          </div>
        </div>

        <div class="netty-agent-body">
          <div class="netty-agent-messages" data-role="messages" aria-live="polite"></div>
          <div class="netty-agent-typing" data-role="typing" style="display:none;">
            <span>Netty is thinking</span>
            <span class="netty-agent-dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>

        <div class="netty-agent-footer">
          <div class="netty-agent-chips-row" data-role="chips-row">
            <div class="netty-agent-starter" data-role="starters"></div>
            <div class="netty-agent-suggestions" data-role="suggestions" hidden></div>
          </div>
          <div class="netty-agent-voice-status" data-role="mic-hint" hidden></div>
          <div class="netty-agent-inputrow">
            <button class="netty-agent-mic" type="button" data-act="mic" aria-label="Speak your message" title="${sttOk ? "Hold/tap to speak (STT → text → send)" : "Speech recognition not supported in this browser"}" ${sttOk ? "" : "disabled"}>
              🎙️
            </button>
            <textarea class="netty-agent-textarea" rows="1" placeholder="Type or tap 🎙️ to speak..."></textarea>
            <button class="netty-agent-send" type="button" data-act="send">Send</button>
          </div>
          <div class="netty-agent-privacy">
            ${escapeHtml(this.config.ui?.privacyNote || "Voice stays in your browser; chat goes to our assistant.")}
          </div>
        </div>
      </div>
    `;

    mountNode.appendChild(this.root);
    this.widget = this.root.querySelector(".netty-agent-widget");
    this.textarea = this.root.querySelector(".netty-agent-textarea");
    this.typingEl = this.root.querySelector('[data-role="typing"]');
    this.toggleBtn = this.root.querySelector(".netty-agent-toggle");
    this.micBtn = this.root.querySelector('[data-act="mic"]');
    this.speakerBtn = this.root.querySelector('[data-act="speaker"]');
    this.micHint = this.root.querySelector('[data-role="mic-hint"]');
    this.suggestionsEl = this.root.querySelector('[data-role="suggestions"]');
    this.startersEl = this.root.querySelector('[data-role="starters"]');
    this.chipsRowEl = this.root.querySelector('[data-role="chips-row"]');
    this.messagesEl = this.root.querySelector('[data-role="messages"]');

    const closeBtn = this.root.querySelector('[data-act="close"]');
    const sendBtn = this.root.querySelector('[data-act="send"]');
    const startersEl = this.startersEl;

    const starters = this.config.ui?.starterPrompts || [];
    if (starters.length && startersEl) {
      starters.forEach((s) => {
        const chip = document.createElement("button");
        chip.className = "netty-agent-chip";
        chip.type = "button";
        chip.textContent = s;
        chip.addEventListener("click", () => {
          this.onSend?.(s);
        });
        startersEl.appendChild(chip);
      });
    }
    this._syncChipsRow();

    this.textarea.addEventListener("input", () => {
      this.textarea.style.height = "auto";
      const next = Math.min(90, Math.max(38, this.textarea.scrollHeight));
      this.textarea.style.height = next + "px";
    });

    // Toggle open ↔ close on robot button
    this.toggleBtn.addEventListener("click", () => {
      this._setOpen(!this._open);
    });
    closeBtn.addEventListener("click", () => this._setOpen(false));
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._setOpen(false);
    });

    this.micBtn.addEventListener("click", () => {
      if (!this.voiceSupported.stt) return;
      this.onToggleVoiceMic?.();
    });

    this.speakerBtn.addEventListener("click", () => {
      if (!this.voiceSupported.tts) return;
      this.setSpeakerOn(!this._speakerOn);
      this.onToggleSpeaker?.(this._speakerOn);
    });
    this.setSpeakerOn(this._speakerOn);

    const send = () => {
      const text = this.textarea.value || "";
      this.textarea.value = "";
      try {
        this.textarea.style.height = "38px";
      } catch (_) {
        /* ignore */
      }
      this.onSend?.(text);
    };
    sendBtn.addEventListener("click", send);
    this.textarea.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "NumpadEnter") {
        e.preventDefault();
        send();
      }
    });
  }

  isOpen() {
    return !!this._open;
  }

  setInputValue(val) {
    if (!this.textarea) return;
    this.textarea.value = val || "";
    try {
      this.textarea.style.height = "38px";
    } catch (_) {
      /* ignore */
    }
  }

  getInputValue() {
    return (this.textarea?.value || "").trim();
  }

  isMicActive() {
    return !!this._micActive;
  }

  setMicActive(v) {
    this._micActive = !!v;
    if (this.micBtn) {
      this.micBtn.classList.toggle("is-listening", this._micActive);
      this.micBtn.textContent = this._micActive ? "🛑" : "🎙️";
      this.micBtn.setAttribute("aria-pressed", this._micActive ? "true" : "false");
    }
    if (this.micHint) {
      if (this._micActive) {
        this.micHint.hidden = false;
        this.micHint.textContent = "Listening… speak now. Tap 🛑 to stop.";
      } else {
        this.micHint.hidden = true;
        this.micHint.textContent = "";
      }
    }
  }

  setMicHint(text) {
    if (!this.micHint) return;
    if (text) {
      this.micHint.hidden = false;
      this.micHint.textContent = text;
    } else {
      this.micHint.hidden = true;
      this.micHint.textContent = "";
    }
  }

  /** Dynamic follow-up chips (local intelligence). Click sends immediately. */
  setSuggestionChips(prompts) {
    if (!this.suggestionsEl) return;
    this.suggestionsEl.innerHTML = "";
    const list = Array.isArray(prompts) ? prompts.filter(Boolean).slice(0, 5) : [];
    if (!list.length) {
      this.suggestionsEl.hidden = true;
      this._syncChipsRow();
      return;
    }
    this.suggestionsEl.hidden = false;
    // Prefer follow-ups over static starters once conversation is going
    if (this.startersEl) this.startersEl.hidden = true;
    list.forEach((s) => {
      const chip = document.createElement("button");
      chip.className = "netty-agent-chip netty-agent-chip-suggest";
      chip.type = "button";
      chip.textContent = s;
      chip.addEventListener("click", () => {
        this.onSend?.(s);
      });
      this.suggestionsEl.appendChild(chip);
    });
    this._syncChipsRow();
  }

  _syncChipsRow() {
    if (!this.chipsRowEl) return;
    const startersVisible = this.startersEl && !this.startersEl.hidden && this.startersEl.childElementCount > 0;
    const suggestsVisible = this.suggestionsEl && !this.suggestionsEl.hidden && this.suggestionsEl.childElementCount > 0;
    this.chipsRowEl.hidden = !(startersVisible || suggestsVisible);
  }

  _scrollMessagesToBottom() {
    const el = this.messagesEl;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  setSpeakerOn(on) {
    this._speakerOn = !!on;
    if (this.speakerBtn) {
      this.speakerBtn.textContent = this._speakerOn ? "🔊" : "🔈";
      this.speakerBtn.classList.toggle("is-on", this._speakerOn);
    }
    const sub = this.root?.querySelector?.('[data-role="subtitle"]');
    if (sub) {
      sub.textContent = this._speakerOn
        ? "Reading replies aloud 🔊"
        : "Tap 🔊 to hear replies";
    }
  }

  addMessage(message, opts = {}) {
    this._messages.push({ ...message, booking: opts.booking || null });
    const messagesEl = this.messagesEl || this.root.querySelector('[data-role="messages"]');
    if (!messagesEl) return;

    const msgEl = document.createElement("div");
    msgEl.className = "netty-agent-msg " + (message.role === "user" ? "user" : "assistant");

    const bubble = document.createElement("div");
    bubble.className = "netty-agent-bubble";
    bubble.innerHTML = escapeToSafeHtml(message.content || "");

    if (message.role === "assistant" && this.voiceSupported.tts) {
      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "netty-agent-speak-msg";
      speakBtn.title = "Read this reply aloud";
      speakBtn.textContent = "🔊 Play";
      speakBtn.addEventListener("click", () => {
        this.onSpeakMessage?.(message.content || "");
      });
      bubble.appendChild(speakBtn);
    }

    if (opts.booking?.eventUrl) {
      const when = bookingSummary(opts.booking);
      const wrap = document.createElement("div");
      const link = document.createElement("a");
      link.href = opts.booking.eventUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "netty-agent-cal-link";
      link.textContent = `Add to calendar${when ? " • " + when : ""}`;
      wrap.appendChild(link);
      bubble.appendChild(wrap);
    }

    msgEl.appendChild(bubble);
    messagesEl.appendChild(msgEl);
    this._scrollMessagesToBottom();
  }

  setTyping(isTyping) {
    if (!this.typingEl) return;
    this.typingEl.style.display = isTyping ? "flex" : "none";
    if (isTyping) this._scrollMessagesToBottom();
  }

  getTranscriptForBackend() {
    return this._messages
      .slice(-4)
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .filter(
        (m) =>
          !/^Sorry — I had trouble connecting|^Cannot reach the chat server/i.test(m.content)
      )
      .map((m) => {
        let content = String(m.content);
        if (content.length > 700) content = content.slice(0, 700) + "…";
        return { role: m.role, content };
      });
  }

  _setOpen(open) {
    if (!this.widget) return;
    const wasOpen = this._open;
    this._open = !!open;
    this.widget.classList.toggle("open", this._open);
    this.widget.setAttribute("aria-hidden", this._open ? "false" : "true");
    this.root.classList.toggle("is-open", this._open);
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute("aria-expanded", this._open ? "true" : "false");
      this.toggleBtn.setAttribute(
        "aria-label",
        this._open
          ? `Close ${this.config.branding?.title || "assistant"}`
          : `Open ${this.config.branding?.title || "assistant"}`
      );
      this.toggleBtn.classList.toggle("is-open", this._open);
    }
    // Reset greet flag when closing so next open can welcome-back.
    if (!this._open && wasOpen && this.onOpenChange) {
      /* AgentApp tracks greet-per-open via its own flag */
    }
    this.onOpenChange?.(this._open);
    if (this._open) {
      setTimeout(() => this.textarea?.focus?.(), 0);
    }
  }

  destroy() {
    try {
      this.root?.remove?.();
    } catch (_) {
      /* ignore */
    }
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("\n", "");
}

function escapeToSafeHtml(s) {
  return escapeHtml(s).replaceAll("\n", "<br>");
}

function bookingSummary(booking) {
  try {
    const d = new Date(booking.startISO);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (_) {
    return "";
  }
}

function configAssetUrl(path, basePath) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const root = (basePath || "/site-agent/client").replace(/\/$/, "");
  if (path.startsWith("./")) return root + "/" + path.slice(2);
  if (path.startsWith("/")) return path;
  return root + "/" + path;
}
