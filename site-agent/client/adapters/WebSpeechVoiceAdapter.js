export class WebSpeechVoiceAdapter {
  constructor({ lang } = {}) {
    this.lang = lang || "en-IN";
    this.supported = {
      stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      tts: !!window.speechSynthesis
    };
    this._recognition = null;
    this._listening = false;
    this._finalParts = [];
    this._interim = "";
    this._utterance = null;
    this._unlocked = false;
    this._resumeTimer = null;

    if (this.supported.tts) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener?.("voiceschanged", () => {
          window.speechSynthesis.getVoices();
        });
      } catch (_) {
        /* ignore */
      }
    }
  }

  /**
   * Call from a user gesture (click). Required by Chrome before later async speak() works reliably.
   */
  unlock() {
    if (!this.supported.tts || this._unlocked) return;
    try {
      window.speechSynthesis.cancel();
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      warm.rate = 2;
      warm.onend = () => {
        this._unlocked = true;
      };
      warm.onerror = () => {
        this._unlocked = true;
      };
      window.speechSynthesis.speak(warm);
      // Mark unlocked even if utterance is cancelled quickly
      this._unlocked = true;
      try {
        window.speechSynthesis.resume();
      } catch (_) {
        /* ignore */
      }
    } catch (_) {
      this._unlocked = true;
    }
  }

  startListening({ lang, onFinal, onInterim, onError } = {}) {
    if (!this.supported.stt) {
      onError?.("unsupported");
      return;
    }

    this.unlock();
    this.stopListening();

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.lang = lang || this.lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      this._recognition = rec;
      this._listening = true;
      this._finalParts = [];
      this._interim = "";

      let finished = false;
      const finish = (text) => {
        if (finished) return;
        finished = true;
        this._listening = false;
        const clean = String(text || "").trim();
        if (clean) onFinal?.(clean);
        else onError?.("empty");
      };

      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) this._finalParts.push(t);
          else interim += t;
        }
        this._interim = interim;
        const preview = (this._finalParts.join(" ") + " " + interim).trim();
        if (preview) onInterim?.(preview);
      };

      rec.onerror = (ev) => {
        this._listening = false;
        onError?.(ev?.error || "error");
      };

      rec.onend = () => {
        this._listening = false;
        const text = (this._finalParts.join(" ") || this._interim || "").trim();
        if (text) finish(text);
        else if (!finished) onError?.("ended");
      };

      rec.start();
    } catch (e) {
      this.stopListening();
      onError?.(String(e?.message || e));
    }
  }

  stopListening() {
    this._listening = false;
    try {
      this._recognition?.stop?.();
    } catch (_) {
      /* ignore */
    }
    try {
      this._recognition?.abort?.();
    } catch (_) {
      /* ignore */
    }
    this._recognition = null;
  }

  _pickVoice(lang) {
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) return null;
      const want = String(lang || this.lang).toLowerCase();
      return (
        voices.find((v) => (v.lang || "").toLowerCase() === want) ||
        voices.find((v) => /en-IN|en_IN/i.test(v.lang || "")) ||
        voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) ||
        voices[0]
      );
    } catch (_) {
      return null;
    }
  }

  _clearResumeHack() {
    if (this._resumeTimer) {
      clearInterval(this._resumeTimer);
      this._resumeTimer = null;
    }
  }

  speak(text, { onEnd, lang } = {}) {
    const clean = String(text || "").trim();
    if (!this.supported.tts || !clean) {
      onEnd?.();
      return;
    }

    this.unlock();
    this._clearResumeHack();

    try {
      window.speechSynthesis.cancel();
    } catch (_) {
      /* ignore */
    }

    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang || this.lang;
    utt.rate = 1.02;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    const voice = this._pickVoice(utt.lang);
    if (voice) {
      utt.voice = voice;
      // Keep lang in sync with chosen voice
      if (voice.lang) utt.lang = voice.lang;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this._clearResumeHack();
      onEnd?.();
    };

    utt.onend = finish;
    utt.onerror = finish;
    this._utterance = utt;

    // Chrome bug: synthesis silently pauses — keep resume() ticking while speaking
    this._resumeTimer = setInterval(() => {
      try {
        if (!window.speechSynthesis.speaking) {
          this._clearResumeHack();
          return;
        }
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (_) {
        /* ignore */
      }
    }, 250);

    const kick = () => {
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utt);
        // Second resume after speak (Chrome)
        setTimeout(() => {
          try {
            window.speechSynthesis.resume();
          } catch (_) {
            /* ignore */
          }
        }, 50);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("TTS speak failed", e);
        finish();
      }
    };

    // Allow cancel() to settle, then speak
    setTimeout(kick, 60);
  }

  cancel() {
    this.stopListening();
    this._clearResumeHack();
    try {
      window.speechSynthesis?.cancel?.();
    } catch (_) {
      /* ignore */
    }
  }
}
