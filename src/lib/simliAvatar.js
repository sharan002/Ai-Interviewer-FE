import { SimliClient, LogLevel } from 'simli-client';

const SIMLI_RATE = 16000;
const CHUNK_BYTES = 6000;

/** Converts a decoded AudioBuffer to the raw PCM16 / 16 kHz / mono bytes Simli expects. */
export async function toSimliPcm(buffer) {
  const frames = Math.max(1, Math.ceil(buffer.duration * SIMLI_RATE));
  const off = new OfflineAudioContext(1, frames, SIMLI_RATE);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination); // channels are down-mixed to mono by the destination
  src.start();
  const f32 = (await off.startRendering()).getChannelData(0);
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) out[i] = Math.max(-1, Math.min(1, f32[i])) * 0x7fff;
  return new Uint8Array(out.buffer);
}

/**
 * Thin wrapper around a Simli session: the interviewer's TTS audio goes in, a lip-synced
 * face comes out in `video`, and the audio plays from `audio`. One instance = one session.
 */
export class SimliAvatar {
  constructor(video, audio) {
    this.video = video;
    this.audio = audio;
    this.client = null;
    this.ready = false;
  }

  async start(sessionToken, onLost) {
    const client = new SimliClient(sessionToken, this.video, this.audio, null, LogLevel.ERROR);
    client.on('stop', () => {
      this.ready = false;
      onLost?.('session ended');
    });
    client.on('error', (m) => {
      this.ready = false;
      onLost?.(String(m));
    });
    this.client = client;
    await client.start(); // resolves on the first video frame
    this.ready = true;
  }

  /** Queues PCM16 audio for the avatar to speak. */
  send(pcm) {
    if (!this.ready) return;
    for (let i = 0; i < pcm.length; i += CHUNK_BYTES) this.client.sendAudioData(pcm.subarray(i, i + CHUNK_BYTES));
  }

  /** Drops anything the avatar hasn't spoken yet (Skip / end interview). */
  clear() {
    if (this.ready) this.client.ClearBuffer();
  }

  async stop() {
    this.ready = false;
    try {
      await this.client?.stop();
    } catch {
      /* already closed */
    }
    this.client = null;
  }
}
