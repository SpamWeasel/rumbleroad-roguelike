import { C, type Color } from "../colors";
import type { Stats } from "../types";

/**
 * Partners: one fighter per gym will team up with you for a fee. A partner follows you around,
 * fights alongside you and grows as you do (their stats are a share of yours). Only one at a
 * time. If they're knocked out they limp home and rejoin you in the next town. While you have a
 * partner they take a cut of the cash the gangs drop.
 */
export interface PartnerDef {
  id: string;
  name: string;
  title: string;
  color: Color;
  /** The gym where they hang out. */
  gym: string;
  price: number;
  /** Share of your base stats they fight with. */
  share: Stats;
  /** Their signature move: extra damage, knock-back, stun. */
  move: { name: string; power: number; knock: number; stun: number };
  hello: string;
  pitch: string;
}

export const PARTNER_GLYPH = "☻";
/** Share of knocked-out gang members' cash your partner keeps. */
export const PARTNER_CUT = 0.1;

export const PARTNERS: Record<string, PartnerDef> = {
  ruby: {
    id: "ruby",
    name: "Ruby Kincaid",
    title: "Street Kicker",
    color: C.pink,
    gym: "ironside",
    price: 100,
    share: {
      punch: 0.6,
      kick: 0.9,
      strength: 0.65,
      agility: 0.85,
      defense: 0.65,
      guts: 0.75,
      stamina: 0.75,
    },
    move: { name: "Whirlwind Kick", power: 1.5, knock: 2, stun: 0 },
    hello: '"About time somebody stood up to the Rats. I\'m in."',
    pitch:
      "Ruby grew up two doors down from you. Quick feet, quicker temper. She's been waiting for someone to start the fight.",
  },
  otis: {
    id: "otis",
    name: "Big Otis",
    title: "Dockworker",
    color: C.amber,
    gym: "riptide",
    price: 350,
    share: {
      punch: 0.8,
      kick: 0.5,
      strength: 0.9,
      agility: 0.5,
      defense: 0.9,
      guts: 0.75,
      stamina: 0.95,
    },
    move: { name: "Shoulder Charge", power: 1.6, knock: 3, stun: 0 },
    hello: '"The Vipers cut my shifts. Let\'s go cut their numbers."',
    pitch:
      "Otis loads freight by hand because the forklift is too slow. Slow on his feet, but nobody pushes him around.",
  },
  lena: {
    id: "lena",
    name: "Lena Stroud",
    title: "Dojo Prodigy",
    color: C.cyan,
    gym: "dojo",
    price: 800,
    share: {
      punch: 0.8,
      kick: 0.8,
      strength: 0.7,
      agility: 0.9,
      defense: 0.75,
      guts: 0.85,
      stamina: 0.8,
    },
    move: { name: "Iron Palm", power: 1.4, knock: 1, stun: 2 },
    hello: '"Sensei says I need real fights. You look like real fights."',
    pitch:
      "The sensei's best student, bored of sparring. Precise, calm, and a little scary. Her palm strikes leave foes seeing stars.",
  },
};

PARTNERS.felix = {
  id: "felix",
  name: "Felix Duarte",
  title: "Gentleman Boxer",
  color: C.gold,
  gym: "summit",
  price: 1600,
  share: {
    punch: 0.9,
    kick: 0.7,
    strength: 0.85,
    agility: 0.85,
    defense: 0.9,
    guts: 0.85,
    stamina: 0.9,
  },
  move: { name: "Sunday Punch", power: 1.8, knock: 2, stun: 1 },
  hello: '"Ashgate used to be a nice neighborhood. Shall we make it one again?"',
  pitch:
    "A former amateur champion who now teaches rich kids to box. Pressed slacks, perfect manners, and a right hand like a dropped piano.",
};

export const PARTNER_BY_GYM: Record<string, string> = Object.fromEntries(
  Object.values(PARTNERS).map((p) => [p.gym, p.id]),
);
