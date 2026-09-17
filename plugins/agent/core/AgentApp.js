import { ChatPanelView } from "../ui/ChatPanelView.js";
import { HttpChatTransport } from "../adapters/HttpChatTransport.js";
import { WebSpeechVoiceAdapter } from "../adapters/WebSpeechVoiceAdapter.js";
import { NullVoiceAdapter } from "../adapters/NullVoiceAdapter.js";
import { SvgMascotPresenter } from "../adapters/SvgMascotPresenter.js";
import { DomSiteNavigator } from "../adapters/DomSiteNavigator.js";
import { LocalGuide } from "../adapters/LocalGuide.js";

export class AgentApp {
  constructor({ config, mountNode }) {
    this.config = config;
    this.mountNode = mountNode;

    const host = typeof location !== "undefined" ? location.hostname : "";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const localPort = config.api?.localChatPort || 8787;
    const chatUrl = isLocal
      ? `http://${host}:${localPort}/api/chat`
      : config.api?.chatUrl || "/api/chat";

    this.transport = new HttpChatTransport(chatUrl);
    this.mascot = new SvgMascotPresenter(mountNode);
    this.navigator = new DomSiteNavigator();
    this.guide = new LocalGuide();
    this._greetedThisOpen = false;

    this.voiceEnabled = config.features?.voice !== false;
    if (this.voiceEnabled) {
      this.voiceAdapter = new WebSpeechVoiceAdapter({
        lang: config.voice?.lang || "en-IN"
      });
    } else {
      this.voiceAdapter = new NullVoiceAdapter();
    }

    this.voiceSpeakerKey = "netty-agent-speaker-on";
    // Default ON so LLM replies are spoken (user can mute with 🔈).
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
    // Greetings happen when the panel opens (LocalGuide), not on mount.
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
    // One greeting per open cycle; welcome-back uses sessionStorage inside LocalGuide.
    if (this._greetedThisOpen) return;
    this._greetedThisOpen = true;

    const greet = this.guide.greetingOnOpen();
    this._appendAssistantMessage(greet.text, null, { speak: true });
    const chips =
      greet.kind === "welcomeBack"
        ? this.guide.followUps({ panelId: this.navigator.getCurrentPanelId() })
        : [
            "Show casino games",
            "Show e-instant / casual games",
            "I want to book a meeting"
          ];
    this.view.setSuggestionChips(chips);
  }

  _setRobotState(state) {
    this.mascot.setState(state);
  }

  _loadOrCreateSessionId() {
    const key = "netty-agent-session-id";
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
    } catch (_) {
      /* ignore */
    }
    const sid = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    try {
      sessionStorage.setItem(key, sid);
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
    // Only honor server navigate when the user explicitly asked to open something.
    if (!allow) return null;
    if (!action || typeof action !== "object") return null;
    if (action.type === "openPanel" && action.panelId != null) {
      const id = Number(action.panelId);
      if (this.navigator.getCurrentPanelId() === id) return id; // already there
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

    const userMessage = { role: "user", content: text };
    this.view.addMessage(userMessage);
    this.view.setInputValue("");

    const currentPanelId = this.navigator.getCurrentPanelId();
    const intent = this.guide.matchIntent(text, { currentPanelId });
    let openedPanelId = null;
    const sectionIntent = !!(intent && intent.panelId);

    // Topic or show/open → bring that island section into view first.
    if (sectionIntent) {
      const nav = this.navigator.open(intent.panelId);
      if (nav.ok) {
        openedPanelId = intent.panelId;
        if (intent.localOnly) {
          this._appendAssistantMessage(intent.panel.blurb, null, { speak: true });
          this.view.setSuggestionChips(
            this.guide.followUps({ panelId: openedPanelId, lastUserText: text })
          );
          return;
        }
      }
    }

    this.view.setTyping(true);
    this._setRobotState("thinking");

    const viewContext = this.guide.viewContextFromDom();
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
      if (fromServer != null) openedPanelId = fromServer;

      const assistantContent = res.reply || "";
      const booking = res.booking || null;

      this.view.setTyping(false);
      if (assistantContent.trim()) {
        this._appendAssistantMessage(assistantContent, booking, { speak: true });
      } else {
        this._setRobotState("idle");
      }

      const panelId = openedPanelId || this.navigator.getCurrentPanelId();
      // After the answer, add a short local note about the page in view (no extra LLM tokens).
      if (panelId && sectionIntent) {
        const detail = this.guide.pageDetail(panelId);
        if (detail) {
          this._appendAssistantMessage(detail, null, { speak: false });
        }
      }
      this.view.setSuggestionChips(this.guide.followUps({ panelId, lastUserText: text }));
    } catch (err) {
      this.view.setTyping(false);
      this._setRobotState("idle");
      const msg = String(err?.message || err || "");
      let reply = "Sorry — I had trouble connecting. Please try again.";
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        reply =
          "Cannot reach the chat server. On your PC, run `node functions/local-server.js` in the project folder, then refresh this page.";
      } else if (/chat failed: 500/i.test(msg)) {
        reply =
          "The chat server hit an error (often calendar setup). Try a general question first, or check the terminal running local-server.js.";
      } else if (/chat failed: 404/i.test(msg)) {
        reply =
          "Chat API not found. If you are on the live site, deploy Firebase Functions. Locally, run `node functions/local-server.js`.";
      }
      this._appendAssistantMessage(reply, null, { speak: true });
      this.view.setSuggestionChips(this.guide.followUps({ lastUserText: text }));
      // eslint-disable-next-line no-console
      console.warn("chat error", err);
    }
  }

  _appendAssistantMessage(content, booking, { speak = true } = {}) {
    const msg = { role: "assistant", content };
    this.view.addMessage(msg, { booking });
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
