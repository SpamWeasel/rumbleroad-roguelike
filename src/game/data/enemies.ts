import { C, type Color } from "../colors";
import type { AiKind, Stats } from "../types";

export type Rank =
  | "punk"
  | "scrapper"
  | "slinger"
  | "bruiser"
  | "lieutenant"
  | "cutter"
  | "medic"
  | "rider"
  | "guard";

export interface RankDef {
  glyph: string;
  ai: AiKind;
  base: Stats;
  cash: [number, number];
}

/** Gang members at depth 1. Everything scales up with depth (see `scaleFor`). */
export const RANKS: Record<Rank, RankDef> = {
  punk: {
    glyph: "p",
    ai: "brawler",
    base: { stamina: 14, punch: 5, kick: 4, strength: 4, agility: 5, defense: 3, guts: 3 },
    cash: [2, 6],
  },
  scrapper: {
    glyph: "s",
    ai: "quick",
    base: { stamina: 11, punch: 4, kick: 6, strength: 3, agility: 10, defense: 2, guts: 3 },
    cash: [3, 7],
  },
  slinger: {
    glyph: "t",
    ai: "thrower",
    base: { stamina: 10, punch: 3, kick: 3, strength: 5, agility: 6, defense: 2, guts: 2 },
    cash: [3, 8],
  },
  bruiser: {
    glyph: "b",
    ai: "heavy",
    base: { stamina: 26, punch: 7, kick: 5, strength: 9, agility: 3, defense: 6, guts: 6 },
    cash: [6, 12],
  },
  /** Knife fighter: cuts keep bleeding for a few turns. */
  cutter: {
    glyph: "k",
    ai: "cutter",
    base: { stamina: 12, punch: 6, kick: 3, strength: 4, agility: 9, defense: 2, guts: 3 },
    cash: [4, 9],
  },
  /** Patches up hurt friends and keeps out of reach. Take them out first. */
  medic: {
    glyph: "m",
    ai: "medic",
    base: { stamina: 12, punch: 3, kick: 3, strength: 3, agility: 7, defense: 3, guts: 4 },
    cash: [5, 10],
  },
  /** On wheels: charges in from a distance and runs you over. */
  rider: {
    glyph: "r",
    ai: "rider",
    base: { stamina: 18, punch: 5, kick: 6, strength: 7, agility: 8, defense: 4, guts: 4 },
    cash: [6, 12],
  },
  /** Blocks punches from the front. Kick them, or hit them from the side. */
  guard: {
    glyph: "g",
    ai: "guard",
    base: { stamina: 22, punch: 6, kick: 4, strength: 6, agility: 4, defense: 7, guts: 5 },
    cash: [5, 11],
  },
  lieutenant: {
    glyph: "L",
    ai: "brawler",
    base: { stamina: 34, punch: 8, kick: 8, strength: 7, agility: 7, defense: 6, guts: 8 },
    cash: [14, 24],
  },
};

export interface GangDef {
  id: string;
  name: string;
  color: Color;
  /** Brighter color for lieutenants. */
  elite: Color;
  titles: Record<Rank, string>;
  /** What their slingers throw. */
  missile: string;
}

export const GANGS: Record<string, GangDef> = {
  rats: {
    id: "rats",
    name: "Rust Rats",
    color: C.orange,
    elite: C.amber,
    titles: {
      punk: "Rat Punk",
      scrapper: "Rat Scrapper",
      slinger: "Rat Slinger",
      bruiser: "Rat Bruiser",
      lieutenant: "Rat Captain",
      cutter: "Rat Shiv",
      medic: "Rat Patcher",
      rider: "Rat Rider",
      guard: "Rat Doorman",
    },
    missile: "rock",
  },
  vipers: {
    id: "vipers",
    name: "Neon Vipers",
    color: C.magenta,
    elite: C.pink,
    titles: {
      punk: "Viper Punk",
      scrapper: "Viper Striker",
      slinger: "Viper Slinger",
      bruiser: "Viper Brute",
      lieutenant: "Viper Lieutenant",
      cutter: "Viper Fang",
      medic: "Viper Nurse",
      rider: "Viper Biker",
      guard: "Viper Bouncer",
    },
    missile: "bottle",
  },
  dogs: {
    id: "dogs",
    name: "Chrome Dogs",
    color: C.steel,
    elite: C.cyan,
    titles: {
      punk: "Dog Pup",
      scrapper: "Dog Runner",
      slinger: "Dog Slinger",
      bruiser: "Dog Mauler",
      lieutenant: "Dog Alpha",
      cutter: "Dog Knife",
      medic: "Dog Medic",
      rider: "Dog Rider",
      guard: "Dog Shield",
    },
    missile: "wrench",
  },
  crowns: {
    id: "crowns",
    name: "The Crowns",
    color: C.gold,
    elite: C.yellow,
    titles: {
      punk: "Crown Thug",
      scrapper: "Crown Dancer",
      slinger: "Crown Marksman",
      bruiser: "Crown Heavy",
      lieutenant: "Crown Guard",
      cutter: "Crown Blade",
      medic: "Crown Medic",
      rider: "Crown Outrider",
      guard: "Crown Sentinel",
    },
    missile: "poker chip",
  },
};

export interface BossDef {
  id: string;
  name: string;
  title: string;
  glyph: string;
  color: Color;
  stats: Stats;
  cash: number;
  /** Flag set in the save when beaten. */
  flag: string;
  taunt: string;
  defeat: string;
}

export const BOSSES: Record<string, BossDef> = {
  gnash: {
    id: "gnash",
    name: "Gnash",
    title: "King of the Rust Rats",
    glyph: "G",
    color: C.orange,
    stats: { stamina: 95, punch: 11, kick: 9, strength: 12, agility: 8, defense: 8, guts: 10 },
    cash: 120,
    flag: "gnash",
    taunt: '"Nobody walks through MY yard!"',
    defeat: "\"Okay, okay! The yard's yours! Harbor's that way!\"",
  },
  mara: {
    id: "mara",
    name: "Mara Fang",
    title: "Queen of the Neon Vipers",
    glyph: "M",
    color: C.magenta,
    stats: { stamina: 170, punch: 18, kick: 23, strength: 15, agility: 20, defense: 15, guts: 18 },
    cash: 320,
    flag: "mara",
    taunt: '"Cute. Let\'s see how you dance."',
    defeat: '"Tch... Varga won\'t go easy on you like I did."',
  },
  kilo: {
    id: "kilo",
    name: "Kilo Marsh",
    title: "Top Dog of the Chrome Dogs",
    glyph: "K",
    color: C.cyan,
    stats: { stamina: 380, punch: 30, kick: 25, strength: 28, agility: 24, defense: 25, guts: 24 },
    cash: 600,
    flag: "kilo",
    taunt: '"This is the Kennel. You walked in on two feet. You\'re crawling out."',
    defeat: "\"Heel... alright, I'm done. Go on up. Ashgate's all yours.\"",
  },
  voss: {
    id: "voss",
    name: "Baron Voss",
    title: "Marshal of the Crowns",
    glyph: "V",
    color: C.red,
    stats: { stamina: 640, punch: 40, kick: 34, strength: 40, agility: 28, defense: 34, guts: 30 },
    cash: 800,
    flag: "voss",
    taunt: '"You brought a block party to a war."',
    defeat: '"Fall back! FALL BACK! ...The Duke will hear of this."',
  },
  varga: {
    id: "varga",
    name: "Duke Varga",
    title: "The Crown of the City",
    glyph: "D",
    color: C.gold,
    stats: { stamina: 820, punch: 48, kick: 40, strength: 46, agility: 33, defense: 42, guts: 36 },
    cash: 1000,
    flag: "varga",
    taunt: '"So you\'re the one wrecking my city. Come. Kneel."',
    defeat: '"Impossible... a nobody from Maple Street..."',
  },
};

export const NICKNAMES = [
  "Spike",
  "Lenny",
  "Moose",
  "Dice",
  "Knuckles",
  "Vinnie",
  "Ziggy",
  "Tank",
  "Rocco",
  "Skeeter",
  "Mags",
  "Bones",
  "Duke Jr.",
  "Pinky",
  "Sparky",
  "Toothpick",
  "Grub",
  "Ace",
  "Nails",
  "Sully",
  "Jojo",
  "Bruno",
  "Fritz",
  "Lefty",
  "Stretch",
  "Babs",
  "Chopper",
  "Weasel",
  "Gus",
  "Trixie",
  "Ratchet",
  "Smokey",
  "Butch",
  "Kiki",
  "Dutch",
  "Mouse",
  "Hector",
  "Big Sal",
  "Rusty",
  "Flip",
  "Dot",
  "Mango",
  "Puddles",
  "Scratch",
  "Nico",
  "Frankie",
  "Wanda",
  "Ozzie",
  "Turbo",
  "Vee",
];

/** Rare gang members with something extra (see Game.toughen). */
export type Trait = "tough" | "quick" | "loaded" | "loud";
export const TRAITS: Record<Trait, { label: string; desc: string }> = {
  tough: { label: "Tough", desc: "Takes a lot more punishment." },
  quick: { label: "Quick", desc: "Faster and harder to hit." },
  loaded: { label: "Loaded", desc: "Carrying three times the cash." },
  loud: { label: "Loud", desc: "Hollers for the whole block when they spot you." },
};

export const SPOT_BARKS = [
  "Hey! You lost?",
  "Get 'em!",
  "Wrong street, pal!",
  "This is our turf!",
  "Nice shoes. Hand 'em over!",
  "Look who wandered in.",
  "Fresh meat!",
  "Empty your pockets!",
  "You picked the wrong block!",
];

export const KO_BARKS = [
  "Ugh...",
  "Not the face!",
  "I'll remember this!",
  "My lunch money...",
  "Tell my mom I tried...",
  "Ow, ow, ow!",
  "No fair...",
  "I quit this gang!",
  "Seeing stars...",
  "Five more minutes...",
];
