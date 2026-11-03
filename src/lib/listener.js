import { encodeWav } from './wav.js';

const TARGET_RATE = 16000;

/**
 * Listens to the microphone and slices the audio into speech segments using a simple
 * energy-based voice activity detector.
 *
 * - `onSegment({ blob, seconds })`  a stretch of speech ended (short pause, ~0.9s)
 * - `onTurnEnd()`                   the candidate has been quiet long enough to be "done" (~2.2s)
 * - `onLevel(rms)`                  every audio block, for level meters (fires even when not listening)
 *
 * Segments are capped at ~25s because Sarvam's REST speech-to-text is meant for short clips.
 */
export class VoiceListener {
  constructor(stream, handlers = {}, opts = {}) {
    this.stream = stream;
    this.h = handlers;
    this.o = {
      minThreshold: 0.012,
      segmentGapMs: 900,
      turnEndMs: 2200,
      maxSegmentSec: 25,
      minSpeechMs: 350,
      preRollMs: 400,
      ...opts,
    };
    this.active = false;
    this.noise = 0.004;
    this.resetState();
  }

  resetState() {
    this.speaking = false;
    this.seg = [];
    this.segMs = 0;
    this.silenceMs = 0;
    this.loudMs = 0;
    this.preRoll = [];
    this.hadSpeechInTurn = false;
    this.turnSilenceMs = 0;
    this.acc = 0;
    this.accN = 0;
    this.accPos = 0;
    this.lastActivityAt = performance.now();
  }

  async init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.audioWorklet.addModule('/pcm-worklet.js');
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});

    const source = this.ctx.createMediaStreamSource(new MediaStream(this.stream.getAudioTracks()));
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture');
    this.node.port.onmessage = (e) => this.onBlock(e.data);

    // Some browsers only pull audio through a node that reaches the destination; keep it silent.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    source.connect(this.node);
    this.node.connect(mute);
    mute.connect(this.ctx.destination);
  }

  /** Begin a fresh listening turn. */
  start() {
    this.resetState();
    this.active = true;
  }

  stop() {
    this.active = false;
    this.resetState();
  }

  /** Milliseconds since the candidate last made noise (or since listening started). */
  get silentMs() {
    return performance.now() - this.lastActivityAt;
  }

  /** Force-end the current turn (e.g. "Send answer" button). */
  finish() {
    if (!this.active) return;
    if (this.speaking) this.endSegment(true);
    this.hadSpeechInTurn = false;
    this.h.onTurnEnd?.();
  }

  destroy() {
    this.active = false;
    try {
      this.node?.disconnect();
      this.ctx?.close();
    } catch {
      /* already closed */
    }
  }

  downsample(input) {
    const ratio = this.ctx.sampleRate / TARGET_RATE;
    const out = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.accN += 1;
      this.accPos += 1;
      if (this.accPos >= ratio) {
        out.push(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
        this.accPos -= ratio;
      }
    }
    return Float32Array.from(out);
  }

  onBlock(block) {
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    this.h.onLevel?.(rms);
    if (!this.active) return;

    const blockMs = (block.length / this.ctx.sampleRate) * 1000;
    const down = this.downsample(block);
    const threshold = Math.max(this.o.minThreshold, this.noise * 3);

    if (!this.speaking) {
      const loud = rms > threshold;
      if (!loud) this.noise += (rms - this.noise) * 0.03; // track ambient noise

      this.preRoll.push(down);
      const maxBlocks = Math.ceil(this.o.preRollMs / blockMs);
      while (this.preRoll.length > maxBlocks) this.preRoll.shift();

      this.loudMs = loud ? this.loudMs + blockMs : 0;
      if (this.loudMs >= 120) {
        this.speaking = true;
        this.seg = [...this.preRoll];
        this.segMs = this.seg.length * blockMs;
        this.silenceMs = 0;
        this.preRoll = [];
        this.lastActivityAt = performance.now();
        this.h.onSpeechStart?.();
      } else if (this.hadSpeechInTurn) {
        this.turnSilenceMs += blockMs;
        if (this.turnSilenceMs >= this.o.turnEndMs) {
          this.hadSpeechInTurn = false;
          this.h.onTurnEnd?.();
        }
      }
      return;
    }

    // Currently inside a speech segment (hysteresis: lower bar to stay "speaking").
    const loud = rms > threshold * 0.6;
    this.seg.push(down);
    this.segMs += blockMs;
    if (loud) {
      this.silenceMs = 0;
      this.lastActivityAt = performance.now();
    } else {
      this.silenceMs += blockMs;
    }

    if (this.silenceMs >= this.o.segmentGapMs) {
      this.endSegment(true);
    } else if (this.segMs >= this.o.maxSegmentSec * 1000) {
      this.endSegment(false); // too long for one STT call: cut and keep going
    }
  }

  endSegment(wentQuiet) {
    const speechMs = this.segMs - this.silenceMs;
    const seg = this.seg;
    this.seg = [];
    this.segMs = 0;
    const trailingSilence = this.silenceMs;
    this.silenceMs = 0;
    this.loudMs = 0;

    if (wentQuiet) {
      this.speaking = false;
      this.turnSilenceMs = trailingSilence;
    }

    if (speechMs < this.o.minSpeechMs) return; // a click or cough, not an answer

    let total = 0;
    for (const s of seg) total += s.length;
    const merged = new Float32Array(total);
    let off = 0;
    for (const s of seg) {
      merged.set(s, off);
      off += s.length;
    }

    this.hadSpeechInTurn = true;
    this.h.onSegment?.({ blob: encodeWav(merged, TARGET_RATE), seconds: speechMs / 1000 });
  }
}
