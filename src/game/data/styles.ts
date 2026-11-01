import type { Stats } from "../types";

/**
 * Fighting styles, picked when you start a new game. Each spreads the same 36 points across the
 * six fighting stats a different way and comes with one small perk (handled in game.ts).
 */
export type StyleId =
  | "allround"
  | "boxer"
  | "kicker"
  | "brawler"
  | "hustler"
  | "wrestler"
  | "runner";

export interface StyleDef {
  id: StyleId;
  name: string;
  blurb: string;
  perk: string;
  base: Stats;
  cash: number;
  pockets: string[];
  /** Achievement that unlocks this style (data/achievements.ts); none = always open. */
  unlock?: string;
}

export const STYLES: Record<StyleId, StyleDef> = {
  allround: {
    id: "allround",
    name: "All-Rounder",
    blurb: "A bit of everything. Good at nothing yet, bad at nothing either.",
    perk: "Quick learner: gym techniques cost 20% less.",
    base: { punch: 6, kick: 6, strength: 6, agility: 6, defense: 6, guts: 6, stamina: 50 },
    cash: 25,
    pockets: ["candy", "candy"],
  },
  boxer: {
    id: "boxer",
    name: "Boxer",
    blurb: "Fast hands and a solid chin. Kicks are an afterthought.",
    perk: "Quick jabs: punches take less time.",
    base: { punch: 8, kick: 4, strength: 7, agility: 6, defense: 6, guts: 5, stamina: 50 },
    cash: 25,
    pockets: ["candy", "candy"],
  },
  kicker: {
    id: "kicker",
    name: "Street Kicker",
    blurb: "Light on your feet with long legs. Lighter in the arms.",
    perk: "Snap kicks: kicks take less time.",
    base: { punch: 4, kick: 9, strength: 5, agility: 8, defense: 5, guts: 5, stamina: 46 },
    cash: 25,
    pockets: ["candy", "candy"],
  },
  brawler: {
    id: "brawler",
    name: "Brawler",
    blurb: "Big, slow and hard to knock over. Anything nearby is a weapon.",
    perk: "Junkyard dog: swung and thrown objects hit 30% harder and last longer.",
    base: { punch: 6, kick: 5, strength: 9, agility: 5, defense: 6, guts: 5, stamina: 62 },
    cash: 25,
    pockets: ["candy", "candy"],
  },
  hustler: {
    id: "hustler",
    name: "Hustler",
    blurb: "Knows every shopkeeper by name. Fights dirty when cornered.",
    perk: "Haggler: 10% off food, gear and supplies. Starts with more cash.",
    base: { punch: 5, kick: 5, strength: 5, agility: 7, defense: 6, guts: 8, stamina: 46 },
    cash: 90,
    pockets: ["candy", "bandage"],
  },
  wrestler: {
    id: "wrestler",
    name: "Wrestler",
    blurb: "Spent years in a high-school singlet. Grabs first, asks questions never.",
    perk: "Takedown: a quarter of your punches knock foes to the ground.",
    base: { punch: 7, kick: 3, strength: 9, agility: 5, defense: 7, guts: 5, stamina: 56 },
    cash: 25,
    pockets: ["candy", "candy"],
    unlock: "champ",
  },
  runner: {
    id: "runner",
    name: "Night Runner",
    blurb: "Knows every rooftop and back alley, and does their best work after dark.",
    perk: "Night moves: +3 Agility and see further at night.",
    base: { punch: 6, kick: 7, strength: 4, agility: 8, defense: 5, guts: 6, stamina: 46 },
    cash: 25,
    pockets: ["candy", "soda"],
    unlock: "night_owl",
  },
};

export const STYLE_ORDER: StyleId[] = [
  "allround",
  "boxer",
  "kicker",
  "brawler",
  "hustler",
  "wrestler",
  "runner",
];
