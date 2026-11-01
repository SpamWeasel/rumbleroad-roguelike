import { musicBus } from "./audio";

/**
 * Little chiptune loops, synthesized on the fly: a pulse-wave lead, a triangle bass and noise
 * drums. Each track is a few bars written as 16 steps per bar.
 * In a melody bar: a note name ("E5", "F#4"), "." for silence, "-" to hold the last note.
 * Drums: k kick, s snare, h hi-hat, "." nothing.
 */
export type TrackId = "title" | "town" | "street" | "boss" | "arena";

interface Track {
  bpm: number;
  /** One chord root per bar (for the bass), as a note name. */
  roots: string[];
  /** Bass rhythm over one bar: R root, O root an octave up, F fifth, "." rest. */
  bass: string;
  lead: string[];
  drums: string;
  /** Lead loudness. */
  vol?: number;
}

const TRACKS: Record<TrackId, Track> = {
  title: {
    bpm: 112,
    roots: ["G2", "E2", "C2", "D2"],
    bass: "R . . . F . . . O . . . F . . .",
    lead: [
      "B4 . D5 . G5 - - - F#5 . G5 . A5 - - -",
      "G5 - - - E5 - - - B4 . E5 . G5 - - -",
      "E5 . G5 . C6 - - - B5 . A5 . G5 . E5 .",
      "F#5 - - - A5 - - - D5 - - - - - . .",
    ],
    drums: "k . . . s . . . k . k . s . . h",
    vol: 0.05,
  },
  town: {
    bpm: 132,
    roots: ["C3", "A2", "F2", "G2", "C3", "A2", "F2", "G2"],
    bass: "R . O . F . O . R . O . F . O .",
    lead: [
      "E5 . G5 . C6 . G5 . A5 . G5 . E5 - . .",
      "C5 . E5 . A5 . E5 . G5 . E5 . C5 - . .",
      "F5 . A5 . C6 . A5 . G5 . F5 . E5 . D5 .",
      "D5 - . . G5 - . . B4 . D5 . G5 - - -",
      "E5 . G5 . C6 . D6 . E6 . D6 . C6 - . .",
      "A5 . C6 . A5 . E5 . G5 . A5 . G5 . E5 .",
      "F5 - . . A5 - . . G5 . F5 . E5 . F5 .",
      "G5 - . . D5 - . . G5 . B5 . C6 - - -",
    ],
    drums: "k . h . s . h . k . h k s . h .",
  },
  street: {
    bpm: 140,
    roots: ["A2", "A2", "F2", "G2", "A2", "A2", "F2", "E2"],
    bass: "R . R O R . R O R . R O F . O .",
    lead: [
      "A4 . . C5 . . E5 . D5 . C5 . B4 . A4 .",
      ". . E5 . . . A5 . G5 . E5 . D5 . E5 .",
      "F5 . . E5 . . C5 . A4 . C5 . D5 - . .",
      "D5 . . C5 . . B4 . G4 . B4 . D5 . G5 .",
      "A5 . . G5 . . E5 . A5 . . G5 . . E5 .",
      "C5 . D5 . E5 - . . G5 . E5 . D5 . C5 .",
      "F5 - - . E5 - - . D5 - - . C5 - - .",
      "B4 - - . E5 - - . G#5 - - . B5 - . .",
    ],
    drums: "k . h . s . h k k . h . s . h h",
    vol: 0.045,
  },
  boss: {
    bpm: 160,
    roots: ["E2", "F2", "E2", "D2", "E2", "F2", "G2", "B1"],
    bass: "R R O R R R O R R R O R F F O F",
    lead: [
      "E5 . E5 . G5 . E5 . B5 . A5 . G5 . F#5 .",
      "F5 . F5 . A5 . F5 . C6 . B5 . A5 . G5 .",
      "E5 . G5 . B5 . E6 . D6 . B5 . G5 . B5 .",
      "D6 - - . C6 - - . B5 - - . A5 - - .",
      "E6 . D6 . B5 . E6 . D6 . B5 . A5 . B5 .",
      "F5 . A5 . C6 . F6 . E6 . C6 . A5 . C6 .",
      "G5 . B5 . D6 . G6 . F#6 . D6 . B5 . G5 .",
      "F#5 - - - D#5 - - - B4 - - - - - . .",
    ],
    drums: "k . h k s . h . k k h . s . s s",
    vol: 0.045,
  },
  arena: {
    bpm: 150,
    roots: ["D2", "D2", "A#1", "C2"],
    bass: "R . O R . R O . R . O R . F O .",
    lead: [
      "D5 . F5 . . A5 . . G5 . F5 . D5 - . .",
      ". . F5 . A5 . C6 . A5 . . G5 . F5 . .",
      "D5 . A#4 . D5 . F5 . A#5 . A5 . F5 . D5 .",
      "E5 . G5 . C6 - . . A5 . G5 . E5 - . .",
    ],
    drums: "k . h . s . h k . k h . s . h .",
  },
};

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) return -1;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

const freq = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Step {
  note: number;
  /** Steps it lasts. */
  len: number;
}

/** A melody bar -> notes per step (null where nothing starts). */
function parseBar(bar: string): (Step | null)[] {
  const tokens = bar.trim().split(/\s+/);
  const out: (Step | null)[] = tokens.map(() => null);
  let last: Step | null = null;
  tokens.forEach((tok, i) => {
    if (tok === "-") {
      if (last) last.len++;
      return;
    }
    if (tok === ".") {
      last = null;
      return;
    }
    const n = midi(tok);
    if (n < 0) return;
    last = { note: n, len: 1 };
    out[i] = last;
  });
  return out;
}

let pulse: PeriodicWave | null = null;
let noiseBuf: AudioBuffer | null = null;

function pulseWave(ctx: AudioContext): PeriodicWave {
  if (pulse) return pulse;
  // A 25% pulse: the classic thin, buzzy chip lead.
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  pulse = ctx.createPeriodicWave(real, imag);
  return pulse;
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

class Player {
  private track: TrackId | null = null;
  private parsed: { lead: (Step | null)[][]; bass: string[]; drums: string[] } | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  play(id: TrackId | null): void {
    if (id === this.track) return;
    this.track = id;
    this.step = 0;
    this.nextTime = 0;
    if (!id) {
      this.stopTimer();
      return;
    }
    const t = TRACKS[id];
    this.parsed = {
      lead: t.lead.map(parseBar),
      bass: t.bass.trim().split(/\s+/),
      drums: t.drums.trim().split(/\s+/),
    };
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 30);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Queues up the notes due in the next fraction of a second. */
  private schedule(): void {
    const bus = musicBus();
    if (!bus || !this.track || !this.parsed) {
      this.nextTime = 0;
      return;
    }
    const { ctx, out } = bus;
    if (ctx.state !== "running") return;
    const t = TRACKS[this.track];
    const stepDur = 60 / t.bpm / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(ctx, out, t, stepDur, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private playStep(ctx: AudioContext, out: GainNode, t: Track, dur: number, at: number): void {
    const p = this.parsed;
    if (!p) return;
    const bars = p.lead.length;
    const bar = Math.floor(this.step / 16) % bars;
    const s = this.step % 16;
    const lead = p.lead[bar][s];
    if (lead)
      this.voice(ctx, out, freq(lead.note), at, lead.len * dur * 0.92, "lead", t.vol ?? 0.05);
    const root = midi(t.roots[Math.floor(this.step / 16) % t.roots.length]);
    const b = p.bass[s];
    if (b && b !== ".") {
      const n = b === "O" ? root + 12 : b === "F" ? root + 7 : root;
      this.voice(ctx, out, freq(n), at, dur * 0.9, "bass", 0.14);
    }
    const d = p.drums[s];
    if (d === "k") this.kick(ctx, out, at);
    else if (d === "s") this.hit(ctx, out, at, 0.12, 1800, 0.11, "bandpass");
    else if (d === "h") this.hit(ctx, out, at, 0.03, 7000, 0.04, "highpass");
  }

  private voice(
    ctx: AudioContext,
    out: GainNode,
    f: number,
    at: number,
    len: number,
    kind: "lead" | "bass",
    vol: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === "lead") o.setPeriodicWave(pulseWave(ctx));
    else o.type = "triangle";
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.setValueAtTime(vol * 0.8, at + Math.max(0.01, len - 0.03));
    g.gain.linearRampToValueAtTime(0, at + len);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  private kick(ctx: AudioContext, out: GainNode, at: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(40, at + 0.1);
    g.gain.setValueAtTime(0.35, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.13);
  }

  private hit(
    ctx: AudioContext,
    out: GainNode,
    at: number,
    len: number,
    cutoff: number,
    vol: number,
    type: BiquadFilterType,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    src.connect(f).connect(g).connect(out);
    src.start(at);
    src.stop(at + len + 0.01);
  }
}

export const music = new Player();
