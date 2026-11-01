import type { Stats } from "../types";

/**
 * Fighting styles, picked when you start a new game. Each spreads the same 36 points across the
 * six fighting stats a different way and comes with one small perk (handled in game.ts).
 */
export type StyleId = "allround" | "boxer" | "kicker" | "brawler" | "hustler";

export interface StyleDef {
  id: StyleId;
  name: string;
  blurb: string;
  perk: string;
  base: Stats;
  cash: number;
  pockets: string[];
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
};

export const STYLE_ORDER: StyleId[] = ["allround", "boxer", "kicker", "brawler", "hustler"];
