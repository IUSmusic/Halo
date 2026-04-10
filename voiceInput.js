export class VoiceInputManager {
  constructor({ onText, onCommand, onStatus } = {}) {
    this.onText = onText || (() => {});
    this.onCommand = onCommand || (() => {});
    this.onStatus = onStatus || (() => {});
    this.recognition = null;
    this.enabled = false;
    this.lastCommitted = "";
    this.lastRecognized = "";
    this.supported = false;
    this.init();
  }

  init() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    this.supported = true;
    this.recognition = new Recognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalText = event.results[i][0].transcript.trim();
          this.lastRecognized = finalText;
          this.handlePhrase(finalText);
        }
      }
      this.onStatus(transcript.trim() || this.lastRecognized || "Listening…");
    };

    this.recognition.onerror = (event) => {
      this.onStatus(`Voice error: ${event.error}`);
    };

    this.recognition.onend = () => {
      if (this.enabled) {
        try {
          this.recognition.start();
        } catch (_) {}
      }
    };
  }

  start() {
    if (!this.supported || !this.recognition || this.enabled) return false;
    this.enabled = true;
    try {
      this.recognition.start();
      this.onStatus("Voice listening…");
      return true;
    } catch (_) {
      this.enabled = false;
      return false;
    }
  }

  stop() {
    this.enabled = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }
    this.onStatus("Voice idle");
  }

  toggle() {
    return this.enabled ? (this.stop(), false) : this.start();
  }

  commitLast() {
    if (!this.lastRecognized) return;
    this.handlePhrase(this.lastRecognized);
  }

  undoLast() {
    if (!this.lastCommitted) return "";
    const last = this.lastCommitted;
    this.lastCommitted = "";
    return last;
  }

  handlePhrase(text) {
    if (!text) return;
    const normalized = text.trim();
    const lower = normalized.toLowerCase();

    const commandHandlers = [
      [/^type\s+(.+)/i, (match) => ({ type: "text", value: match[1] })],
      [/^insert\s+(.+)/i, (match) => ({ type: "text", value: match[1] })],
      [/^press\s+enter$/i, () => ({ type: "command", command: "ENTER" })],
      [/^press\s+space$/i, () => ({ type: "command", command: "SPACE" })],
      [/^press\s+backspace$/i, () => ({ type: "command", command: "BACKSPACE" })],
      [/^backspace$/i, () => ({ type: "command", command: "BACKSPACE" })],
      [/^undo$/i, () => ({ type: "command", command: "UNDO_VOICE" })],
      [/^caps\s+on$/i, () => ({ type: "command", command: "CAPS_ON" })],
      [/^caps\s+off$/i, () => ({ type: "command", command: "CAPS_OFF" })],
      [/^shift$/i, () => ({ type: "command", command: "SHIFT" })],
      [/^symbols?$/i, () => ({ type: "command", command: "SYM" })],
      [/^voice\s+off$/i, () => ({ type: "command", command: "VOICE_OFF" })],
    ];

    for (const [pattern, handler] of commandHandlers) {
      const match = lower.match(pattern);
      if (!match) continue;
      const action = handler(match);
      if (action.type === "text") {
        this.lastCommitted = action.value;
        this.onText(action.value, { source: "voice" });
      } else {
        this.onCommand(action.command, { source: "voice" });
      }
      this.onStatus(normalized);
      return;
    }

    this.lastCommitted = normalized;
    this.onText(normalized, { source: "voice" });
    this.onStatus(normalized);
  }
}
