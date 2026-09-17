import { ChatPanelView } from "../ui/ChatPanelView.js";
import { HttpChatTransport } from "../adapters/HttpChatTransport.js";
import { WebSpeechVoiceAdapter } from "../adapters/WebSpeechVoiceAdapter.js";
import { NullVoiceAdapter } from "../adapters/NullVoiceAdapter.js";
import { SvgMascotPresenter } from "../adapters/SvgMascotPresenter.js";
import { createSiteNavigator } from "../adapters/createSiteNavigator.js";
import { ProfileSiteGuide } from "../adapters/ProfileSiteGuide.js";
import { NullSiteNavigator } from "../adapters/NullSiteNavigator.js";

/**
 * Application service — depends on abstractions (navigator, guide, transport, voice).
 * Host sites inject adapters; Netty island uses DomOpenPanelNavigator via site.profile.json.
 */
export class AgentApp {
  /**
   * @param {{
   *   config: object,
   *   siteProfile: object,
   *   mountNode: HTMLElement,
   *   navigator?: object,
   *   guide?: object,
   *   transport?: object,
   *   voiceAdapter?: object,
   *   mascot?: object
   * }} deps
   */
  constructor(deps) {
    const { config, siteProfile, mountNode } = deps;
    this.config = config;
    this.siteProfile = siteProfile || {};
    this.mountNode = mountNode;

    const host = typeof location !== "undefined" ? location.hostname : "";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const localPort = config.api?.localChatPort || 8787;
    const chatUrl = isLocal
      ? `http://${host}:${localPort}/api/chat`
      : config.api?.chatUrl || "/api/chat";

    this.transport = deps.transport || new HttpChatTransport(chatUrl);
    this.mascot = deps.mascot || new SvgMascotPresenter(mountNode);

    const navEnabled = config.features?.siteNavigation !== false;
    this.navigator =
      deps.navigator ||
      (navEnabled ? createSiteNavigator(this.siteProfile) : new NullSiteNavigator());

    const storage = config.storageKeys || {};
    this.guide =
      deps.guide ||
      new ProfileSiteGuide(this.siteProfile, { greetedKey: storage.greeted || "site-agent-panel-opened" });

    this._greetedThisOpen = false;
    this._sessionKey = storage.sessionId || "site-agent-session-id";
    this.voiceSpeakerKey = storage.speaker || "site-agent-speaker-on";

    this.voiceEnabled = config.features?.voice !== false;
    if (deps.voiceAdapter) {
      this.voiceAdapter = deps.voiceAdapter;
    } else if (this.voiceEnabled) {
      this.voiceAdapter = new WebSpeechVoiceAdapter({
        lang: config.voice?.lang || "en-IN"
      });
    } else {
      this.voiceAdapter = new NullVoiceAdapter();
    }

    this.speakerOn = true;
    try {
      const saved = localStorage.getItem(this.voiceSpeakerKey);
      if (saved === "0") this.speakerOn = false;
      else if (saved === "1") this.speakerOn = true;
      else if (config.voice?.autoSpeak === false) this.speakerOn = false;
    } catch (_) {
      /* ignore */
    }
    if (!this.voiceAdapter?.supported?.tts) this.speakerOn = false;

    this.sessionId = this._loadOrCreateSessionId();
    this.abortController = null;

    this.view = new ChatPanelView({
      config,
      mascot: this.mascot,
      voiceSupported: this.voiceAdapter.supported || { stt: false, tts: false },
      speakerOn: this.speakerOn,
      onSend: (text) => this._handleUserMessage(text),
      onToggleSpeaker: (nextVal) => this._handleToggleSpeaker(nextVal),
      onToggleVoiceMic: () => this._handleToggleMic(),
      onOpenChange: (open) => this._handleOpenChange(open),
      onSpeakMessage: (text) => this._speakNow(text)
    });
  }

  mount() {
    this.view.mount(this.mountNode);
    this.view.setSpeakerOn(this.speakerOn);
    this._setRobotState("idle");
  }

  destroy() {
    try {
      if (this.abortController) this.abortController.abort();
    } catch (_) {
      /* ignore */
    }
    this.voiceAdapter.cancel?.();
    this.view?.destroy?.();
    this.mountNode?.remove?.();
  }

  _handleOpenChange(open) {
    if (open) {
      this.voiceAdapter.unlock?.();
      this.view.setSpeakerOn(this.speakerOn);
      this._maybeGreetOnOpen();
      return;
    }
    this._greetedThisOpen = false;
    try {
      this.voiceAdapter.cancel?.();
    } catch (_) {
      /* ignore */
    }
    this.view.setMicActive(false);
    this.view.setMicHint("");
    this._setRobotState("idle");
  }

  _maybeGreetOnOpen() {
    if (this._greetedThisOpen) return;
    this._greetedThisOpen = true;

    const greet = this.guide.greetingOnOpen();
    this._appendAssistantMessage(greet.text, null, { speak: true });
    const chips =
      greet.kind === "welcomeBack"
        ? this.guide.followUps({ sectionId: this.navigator.getCurrentSectionId() })
        : this.config.ui?.starterPrompts || this.siteProfile.defaultFollowUps || [];
    this.view.setSuggestionChips(chips);
  }

  _setRobotState(state) {
    this.mascot.setState(state);
  }

  _loadOrCreateSessionId() {
    try {
      const existing = sessionStorage.getItem(this._sessionKey);
      if (existing) return existing;
    } catch (_) {
      /* ignore */
    }
    const sid = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    try {
      sessionStorage.setItem(this._sessionKey, sid);
    } catch (_) {
      /* ignore */
    }
    return sid;
  }

  _handleToggleSpeaker(nextVal) {
    this.speakerOn = !!nextVal;
    this.view.setSpeakerOn(this.speakerOn);
    this.voiceAdapter.unlock?.();
    try {
      localStorage.setItem(this.voiceSpeakerKey, this.speakerOn ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
    if (!this.speakerOn) {
      try {
        this.voiceAdapter.cancel?.();
      } catch (_) {
        /* ignore */
      }
      this._setRobotState("idle");
    } else {
      this._speakNow("Voice replies are on.");
    }
  }

  _speakNow(text) {
    if (!this.voiceAdapter?.supported?.tts) {
      this.view.setMicHint("Text-to-speech is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    this.voiceAdapter.unlock?.();
    const clean = this._stripTextForSpeech(text);
    if (!clean) return;
    this._setRobotState("talking");
    this.voiceAdapter.speak(clean, {
      onEnd: () => this._setRobotState("idle")
    });
  }

  _handleToggleMic() {
    if (!this.voiceAdapter?.supported?.stt) {
      this.view.setMicHint("Speech-to-text is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    this.voiceAdapter.unlock?.();

    if (this.view.isMicActive()) {
      this.voiceAdapter.stopListening();
      this.view.setMicActive(false);
      this._setRobotState("idle");
      const leftover = this.view.getInputValue();
      if (leftover) this._handleUserMessage(leftover);
      return;
    }

    try {
      window.speechSynthesis?.cancel?.();
    } catch (_) {
      /* ignore */
    }

    this.view.setMicActive(true);
    this._setRobotState("listening");

    this.voiceAdapter.startListening({
      lang: this.config.voice?.lang || "en-IN",
      onFinal: (transcript) => {
        this.view.setMicActive(false);
        this.view.setInputValue(transcript);
        this._setRobotState("thinking");
        this._handleUserMessage(transcript);
      },
      onInterim: (partial) => {
        this.view.setInputValue(partial);
      },
      onError: (reason) => {
        this.view.setMicActive(false);
        this._setRobotState("idle");
        if (reason === "no-speech") {
          this.view.setMicHint("Didn’t catch that — tap 🎙️ and try again.");
        } else if (reason === "not-allowed" || reason === "service-not-allowed") {
          this.view.setMicHint("Microphone permission blocked. Allow mic access in the browser.");
        } else if (reason === "unsupported") {
          this.view.setMicHint("Speech-to-text not supported here. Use Chrome/Edge.");
        } else if (reason !== "aborted" && reason !== "ended" && reason !== "empty") {
          this.view.setMicHint("Voice input failed. You can still type your message.");
        }
      }
    });
  }

  _applyNavigateAction(action, { allow = false } = {}) {
    if (!allow) return null;
    if (!action || typeof action !== "object") return null;
    if (action.type === "openPanel" && action.panelId != null) {
      const id = Number(action.panelId);
      if (this.navigator.getCurrentSectionId() === id) return id;
      const result = this.navigator.open(id);
      return result.ok ? id : null;
    }
    if (action.type === "closePanel") {
      this.navigator.close();
      return null;
    }
    return null;
  }

  async _handleUserMessage(rawText) {
    const text = (rawText || "").trim();
    if (!text) return;

    try {
      this.voiceAdapter.stopListening?.();
      window.speechSynthesis?.cancel?.();
    } catch (_) {
      /* ignore */
    }
    this.view.setMicActive(false);
    this.view.setMicHint("");
    this.view.setSuggestionChips([]);

    this.view.addMessage({ role: "user", content: text });
    this.view.setInputValue("");

    const currentSectionId = this.navigator.getCurrentSectionId();
    const intent = this.guide.matchIntent(text, { currentSectionId });
    let openedSectionId = null;
    const sectionIntent = !!(intent && intent.sectionId);

    if (sectionIntent) {
      const nav = this.navigator.open(intent.sectionId);
      if (nav.ok) {
        openedSectionId = intent.sectionId;
        if (intent.localOnly) {
          const blurb = intent.section?.blurb || intent.panel?.blurb || "";
          this._appendAssistantMessage(blurb, null, { speak: true });
          this.view.setSuggestionChips(
            this.guide.followUps({ sectionId: openedSectionId, lastUserText: text })
          );
          return;
        }
      }
    }

    this.view.setTyping(true);
    this._setRobotState("thinking");

    const viewContext = this.guide.viewContextFromDom(this.navigator);
    const messages = this.view.getTranscriptForBackend();

    this.abortController = new AbortController();
    try {
      const res = await this.transport.send(
        {
          sessionId: this.sessionId,
          messages,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewContext
        },
        { signal: this.abortController.signal }
      );

      const fromServer = this._applyNavigateAction(res.navigate, { allow: sectionIntent });
      if (fromServer != null) openedSectionId = fromServer;

      const assistantContent = res.reply || "";
      const booking = res.booking || null;

      this.view.setTyping(false);
      if (assistantContent.trim()) {
        this._appendAssistantMessage(assistantContent, booking, { speak: true });
      } else {
        this._setRobotState("idle");
      }

      const sectionId = openedSectionId || this.navigator.getCurrentSectionId();
      if (sectionId && sectionIntent) {
        const detail = this.guide.pageDetail(sectionId);
        if (detail) this._appendAssistantMessage(detail, null, { speak: false });
      }
      this.view.setSuggestionChips(this.guide.followUps({ sectionId, lastUserText: text }));
    } catch (err) {
      this.view.setTyping(false);
      this._setRobotState("idle");
      const msg = String(err?.message || err || "");
      let reply = "Sorry — I had trouble connecting. Please try again.";
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        reply =
          "Cannot reach the chat server. On your PC, run `node site-agent/server/local-server.js` (or your host’s local API), then refresh.";
      } else if (/chat failed: 500/i.test(msg)) {
        reply =
          "The chat server hit an error (often calendar setup). Check the terminal running the local API.";
      } else if (/chat failed: 404/i.test(msg)) {
        reply = "Chat API not found. Deploy the agent server or run the local API.";
      }
      this._appendAssistantMessage(reply, null, { speak: true });
      this.view.setSuggestionChips(this.guide.followUps({ lastUserText: text }));
      // eslint-disable-next-line no-console
      console.warn("chat error", err);
    }
  }

  _appendAssistantMessage(content, booking, { speak = true } = {}) {
    this.view.addMessage({ role: "assistant", content }, { booking });
    if (speak && this.speakerOn && this.voiceAdapter?.supported?.tts) {
      this._speakNow(content);
    } else {
      this._setRobotState("idle");
    }
  }

  _stripTextForSpeech(s) {
    return String(s || "")
      .replace(/https?:\/\/\S+/g, " link ")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_#>`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
  }
}
