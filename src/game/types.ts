import type { Color } from "./colors";

export const STAT_KEYS = ["punch", "kick", "strength", "agility", "defense", "guts"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** The six fighting stats plus stamina (maximum health). */
export type AnyStat = StatKey | "stamina";
export type Stats = Record<AnyStat, number>;
export type StatBonus = Partial<Stats>;

export const ALL_STATS: AnyStat[] = [...STAT_KEYS, "stamina"];

export const STAT_LABEL: Record<AnyStat, string> = {
  punch: "Punch",
  kick: "Kick",
  strength: "Strength",
  agility: "Agility",
  defense: "Defense",
  guts: "Guts",
  stamina: "Stamina",
};

export const STAT_SHORT: Record<AnyStat, string> = {
  punch: "PUN",
  kick: "KIK",
  strength: "STR",
  agility: "AGI",
  defense: "DEF",
  guts: "GUT",
  stamina: "STA",
};

export const STAT_CAP = 99;
export const STAMINA_CAP = 300;

export type Dir = readonly [number, number];

/** The eight directions, clockwise from north. */
export const DIRS8: Dir[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export type GearSlot = "feet" | "hands" | "body" | "charm";
export const GEAR_SLOTS: GearSlot[] = ["hands", "feet", "body", "charm"];
export const GEAR_SLOT_LABEL: Record<GearSlot, string> = {
  hands: "Hands",
  feet: "Feet",
  body: "Body",
  charm: "Charm",
};

export type Mode = "street" | "permadeath";

export interface Fighter {
  id: number;
  x: number;
  y: number;
  hp: number;
  /** Game time when this fighter acts next. */
  time: number;
  /** Turns left stunned (cannot act). */
  stun: number;
  /** Turns left knocked down. */
  down: number;
}

export interface Player extends Fighter {
  name: string;
  base: Stats;
  guts: number;
  cash: number;
  pockets: string[];
  gear: Partial<Record<GearSlot, string>>;
  techniques: string[];
  /** Index into techniques for the L key. */
  selected: number;
  /** An object carried in both hands (crate, pipe...). */
  held: string | null;
  heldUses: number;
  guard: boolean;
  facing: Dir;
  /** Temporary boosts from tonics: stat bonus and turns left. */
  buffs: { stats: StatBonus; turns: number; name: string }[];
  kos: number;
  /** Turns since the last health/guts trickle. */
  regenClock: number;
}

export type AiKind = "brawler" | "quick" | "heavy" | "thrower" | "boss";

export interface Enemy extends Fighter {
  kind: string;
  name: string;
  title: string;
  glyph: string;
  color: Color;
  maxHp: number;
  stats: Stats;
  ai: AiKind;
  awake: boolean;
  /** A big attack being wound up: it lands next turn in this direction. */
  windup: { dir: Dir; move: string } | null;
  cash: number;
  boss: boolean;
  /** Turns before this enemy may use a special move again. */
  cooldown: number;
  /** Flag set when this boss is beaten. */
  flag?: string;
}

export type GroundItem =
  | { kind: "cash"; x: number; y: number; amount: number }
  | { kind: "object"; x: number; y: number; id: string }
  | { kind: "item"; x: number; y: number; id: string };

export interface Exit {
  x: number;
  y: number;
  marker: string;
  to: string;
  arrive: string;
}

export interface Area {
  id: string;
  name: string;
  kind: "town" | "district" | "static";
  w: number;
  h: number;
  tiles: Uint8Array;
  seen: Uint8Array;
  /** Tile index -> shop id. */
  doors: Map<number, string>;
  exits: Exit[];
  /** Squares lit by street lamps (visible from further away). */
  lamp: Uint8Array;
  enemies: Enemy[];
  items: GroundItem[];
  /** Everything in the area is visible (towns are lit). */
  lit: boolean;
  depth: number;
  gang: string | null;
  /** Where the player arrived; used to respawn after a knock-out. */
  start: { x: number; y: number };
}

export interface LogLine {
  text: string;
  color: Color;
  turn: number;
}

/** Things the screen should show or play: floating numbers, flashes and sounds. */
export type GameEvent =
  | { type: "pop"; x: number; y: number; text: string; color: Color }
  | { type: "flash"; x: number; y: number; color: Color }
  | { type: "sound"; id: SoundId }
  | { type: "shop"; shop: string }
  | { type: "area" }
  | { type: "dead" }
  | { type: "win" };

export type SoundId =
  | "punch"
  | "kick"
  | "miss"
  | "hurt"
  | "ko"
  | "coin"
  | "buy"
  | "eat"
  | "slam"
  | "splash"
  | "special"
  | "throw"
  | "deny"
  | "door"
  | "guard"
  | "levelup";
