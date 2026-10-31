import type { StatBonus } from "../types";

/**
 * Special moves learned at gyms. Each costs guts to use. `aim` says how the move is aimed:
 * - "dir": pick a direction (an adjacent enemy is picked for you when there is only one),
 * - "around": hits everyone nearby, no aiming.
 */
export interface Technique {
  id: string;
  name: string;
  desc: string;
  guts: number;
  price: number;
  needs: StatBonus;
  aim: "dir" | "around";
  /** Which stat mostly powers it (for the shop text). */
  power: "punch" | "kick" | "strength" | "guts";
}

export const TECHNIQUES: Record<string, Technique> = {
  haymaker: {
    id: "haymaker",
    name: "Haymaker",
    desc: "A huge looping punch that sends a foe flying 2 squares.",
    guts: 4,
    price: 60,
    needs: { punch: 8 },
    aim: "dir",
    power: "punch",
  },
  uppercut: {
    id: "uppercut",
    name: "Uppercut",
    desc: "Rising punch that leaves the target stunned for 2 turns.",
    guts: 4,
    price: 80,
    needs: { punch: 10 },
    aim: "dir",
    power: "punch",
  },
  flurry: {
    id: "flurry",
    name: "Jab Flurry",
    desc: "Three quick jabs. Each one can land on its own.",
    guts: 5,
    price: 100,
    needs: { agility: 10 },
    aim: "dir",
    power: "punch",
  },
  headbutt: {
    id: "headbutt",
    name: "Headbutt",
    desc: "Strength and guts in one crack. Stuns for 3 turns, but it hurts you a little too.",
    guts: 3,
    price: 70,
    needs: { guts: 10 },
    aim: "dir",
    power: "guts",
  },
  flykick: {
    id: "flykick",
    name: "Flying Kick",
    desc: "Leap up to 3 squares and kick the first foe in your path off their feet.",
    guts: 6,
    price: 180,
    needs: { kick: 18 },
    aim: "dir",
    power: "kick",
  },
  sweep: {
    id: "sweep",
    name: "Leg Sweep",
    desc: "Spin low and knock down everyone next to you for 2 turns.",
    guts: 5,
    price: 160,
    needs: { kick: 15, agility: 15 },
    aim: "around",
    power: "kick",
  },
  spinkick: {
    id: "spinkick",
    name: "Spin Kick",
    desc: "A full-turn kick that hits and knocks back everyone next to you.",
    guts: 6,
    price: 220,
    needs: { kick: 20 },
    aim: "around",
    power: "kick",
  },
  charge: {
    id: "charge",
    name: "Shoulder Charge",
    desc: "Dash up to 4 squares and drive the first foe you meet into whatever is behind them.",
    guts: 7,
    price: 240,
    needs: { strength: 20 },
    aim: "dir",
    power: "strength",
  },
  toss: {
    id: "toss",
    name: "Grab & Toss",
    desc: "Grab a foe and hurl them over your shoulder, crushing anyone they land on.",
    guts: 8,
    price: 400,
    needs: { strength: 30 },
    aim: "dir",
    power: "strength",
  },
  palm: {
    id: "palm",
    name: "Iron Palm",
    desc: "A shockwave strike that hits the next 3 squares in a line.",
    guts: 9,
    price: 450,
    needs: { punch: 30, guts: 25 },
    aim: "dir",
    power: "punch",
  },
  cyclone: {
    id: "cyclone",
    name: "Cyclone Kick",
    desc: "A whirling storm of kicks that hits everything within 2 squares.",
    guts: 12,
    price: 600,
    needs: { kick: 35, agility: 30 },
    aim: "around",
    power: "kick",
  },
  hundred: {
    id: "hundred",
    name: "Hundred Fists",
    desc: "Master Hu's secret. Six blinding punches, the last one sends them flying.",
    guts: 15,
    price: 900,
    needs: { punch: 40, agility: 35, guts: 35 },
    aim: "dir",
    power: "punch",
  },
};
