import type { SoundId } from "../../game/types";

/** Small synthesized sound effects; nothing is loaded from disk. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = false;
/** 0-1. */
let volume = 0.7;
let musicVolume = 0.5;

export function setVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
  if (master) master.gain.value = volume;
}

export function setMusicVolume(value: number): void {
  musicVolume = Math.max(0, Math.min(1, value));
  if (musicGain) musicGain.gain.value = musicVolume * 0.5;
}

/** The shared audio context and the music bus, or null when audio is off or unavailable. */
export function musicBus(): { ctx: AudioContext; out: GainNode } | null {
  if (muted || musicVolume <= 0) return null;
  const a = context();
  return a && musicGain ? { ctx: a, out: musicGain } : null;
}

function context(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolume * 0.5;
      musicGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}
export function isMuted(): boolean {
  return muted;
}

function audio(): AudioContext | null {
  if (muted) return null;
  const a = context();
  return a && volume > 0 ? a : null;
}

function tone(
  freq: number,
  to: number,
  dur: number,
  type: OscillatorType,
  vol = 0.12,
  delay = 0,
): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master as GainNode);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, cutoff: number, vol = 0.2, delay = 0, high = false): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = high ? "highpass" : "lowpass";
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = vol;
  src
    .connect(f)
    .connect(g)
    .connect(master as GainNode);
  src.start(t);
}

export function play(id: SoundId): void {
  switch (id) {
    case "punch":
      noise(0.09, 900, 0.35);
      tone(180, 70, 0.08, "sine", 0.2);
      break;
    case "kick":
      noise(0.12, 600, 0.35);
      tone(130, 45, 0.14, "sine", 0.28);
      break;
    case "miss":
      noise(0.12, 2500, 0.12, 0, true);
      break;
    case "hurt":
      tone(220, 90, 0.16, "square", 0.08);
      noise(0.08, 800, 0.25);
      break;
    case "ko":
      tone(400, 60, 0.4, "triangle", 0.14);
      break;
    case "coin":
      tone(988, 988, 0.06, "square", 0.05);
      tone(1319, 1319, 0.12, "square", 0.05, 0.06);
      break;
    case "buy":
      tone(660, 660, 0.08, "triangle", 0.1);
      tone(880, 880, 0.12, "triangle", 0.1, 0.08);
      break;
    case "eat":
      noise(0.05, 3000, 0.15);
      noise(0.05, 3000, 0.15, 0.09);
      noise(0.05, 3000, 0.15, 0.18);
      break;
    case "slam":
      noise(0.25, 400, 0.5);
      tone(90, 30, 0.25, "sine", 0.3);
      break;
    case "splash":
      noise(0.5, 1800, 0.3);
      break;
    case "special":
      tone(220, 880, 0.18, "sawtooth", 0.06);
      break;
    case "throw":
      noise(0.18, 1500, 0.12, 0, true);
      break;
    case "deny":
      tone(110, 100, 0.18, "square", 0.07);
      break;
    case "door":
      tone(500, 300, 0.05, "square", 0.04);
      break;
    case "guard":
      tone(300, 300, 0.05, "triangle", 0.08);
      break;
    case "levelup":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, "square", 0.05, i * 0.07));
      break;
  }
}
