export class NullVoiceAdapter {
  constructor() {
    this.supported = { stt: false, tts: false };
  }
  unlock() {}
  startListening() {}
  stopListening() {}
  speak(_text, { onEnd } = {}) {
    onEnd?.();
  }
  cancel() {}
}

