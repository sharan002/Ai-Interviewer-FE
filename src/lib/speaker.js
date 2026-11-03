import { api } from '../api.js';

/** Splits text into sentence-sized pieces; the first is kept short so audio starts sooner. */
export function chunkText(text, firstMax = 150, max = 280) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const limit = chunks.length === 0 ? firstMax : max;
    if (cur && cur.length + 1 + s.length > limit) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * Speaks text through Sarvam TTS (via the backend), exposing a live loudness value in
 * `level.current` (0..1) that drives the avatar's mouth. Falls back to the browser's
 * built-in voice if Sarvam is unavailable.
 */
export class TtsPlayer {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.level = { current: 0 };
    this.speaker = 'priya';
    this.token = 0;
    this.meterToken = 0;
    this.simulating = false;
    this.currentSrc = null;
    this.onFallback = null; // (errorMessage) => void, called once per player
    this.fallbackNotified = false;
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.connect(this.ctx.destination);
      this.meterBuf = new Uint8Array(this.analyser.fftSize);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  stop() {
    this.token += 1;
    this.simulating = false;
    try {
      this.currentSrc?.stop();
    } catch {
      /* not started */
    }
    this.currentSrc = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Resolves when speech finished or was interrupted by stop(). */
  async speak(text) {
    await this.unlock();
    this.stop();
    const my = this.token;
    const chunks = chunkText(text);

    // Request every chunk up front so later ones are ready by the time earlier ones finish.
    const pending = chunks.map((c) =>
      api
        .tts(c, this.speaker)
        .then((ab) => this.ctx.decodeAudioData(ab))
        .catch((error) => ({ error })),
    );

    this.startMeter(my);
    try {
      for (let i = 0; i < chunks.length; i++) {
        const result = await pending[i];
        if (my !== this.token) return;
        if (result && result.error) {
          if (!this.fallbackNotified) {
            this.fallbackNotified = true;
            this.onFallback?.(result.error.message);
          }
          await this.speakWithBrowser(chunks[i], my);
        } else {
          await this.playBuffer(result);
        }
        if (my !== this.token) return;
      }
    } finally {
      if (this.meterToken === my) this.meterToken = 0;
      if (my === this.token) this.level.current = 0;
    }
  }

  playBuffer(buffer) {
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser);
      src.onended = () => resolve();
      this.currentSrc = src;
      src.start();
    });
  }

  speakWithBrowser(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-IN';
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang === 'en-IN') || voices.find((x) => x.lang.startsWith('en'));
      if (v) u.voice = v;
      const done = () => {
        this.simulating = false;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      this.simulating = true;
      window.speechSynthesis.speak(u);
    });
  }

  startMeter(my) {
    this.meterToken = my;
    const tick = () => {
      if (this.meterToken !== my) return;
      let target;
      if (this.simulating) {
        target = 0.25 + Math.abs(Math.sin(performance.now() / 85)) * 0.5 * (0.6 + Math.random() * 0.4);
      } else {
        this.analyser.getByteTimeDomainData(this.meterBuf);
        let sum = 0;
        for (let i = 0; i < this.meterBuf.length; i++) {
          const v = (this.meterBuf[i] - 128) / 128;
          sum += v * v;
        }
        target = Math.min(1, Math.sqrt(sum / this.meterBuf.length) * 5);
      }
      this.level.current += (target - this.level.current) * 0.5;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  destroy() {
    this.stop();
    this.meterToken = 0;
    try {
      this.ctx?.close();
    } catch {
      /* already closed */
    }
  }
}
