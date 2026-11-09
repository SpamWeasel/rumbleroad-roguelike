import { C, type Color } from "../colors";
import { hashSeed } from "../rng";

/**
 * Each day has its own weather (picked from the game seed and the day, so it never needs saving).
 * It only matters outdoors: not in fight-club rings or the indoor areas below.
 * - rain: slippery streets (knock-backs go a square further), less sight, restaurant meals heal
 *   more, and the ice cream cart stays home.
 * - fog: much less sight, but gangs notice you later too.
 * - heat: fewer gang crews out, and cold drinks restore twice the guts.
 */
export type Weather = "clear" | "rain" | "fog" | "heat";

export const WEATHER: Record<
  Weather,
  { label: string; icon: string; color: Color; dawn: string; tip: string }
> = {
  clear: {
    label: "Clear",
    icon: "",
    color: C.yellow,
    dawn: "A clear day over the city.",
    tip: "",
  },
  rain: {
    label: "Rain",
    icon: "☂",
    color: C.cyan,
    dawn: "Rain today. Slick streets - knock-backs go further. Restaurant meals hit the spot.",
    tip: "Rain: slick streets send everyone flying a square further (great for slamming foes into walls), you see less, and restaurant meals heal 50% more.",
  },
  fog: {
    label: "Fog",
    icon: "≈",
    color: C.gray,
    dawn: "Thick fog rolls in off the harbor. You can't see far, and neither can they.",
    tip: "Fog: you can't see far, but gang members won't spot you until you're close. Sneak past, or get the first hit in.",
  },
  heat: {
    label: "Heatwave",
    icon: "☀",
    color: C.orange,
    dawn: "A heatwave. Half the gangs are hiding in the shade. Cold drinks are a lifesaver.",
    tip: "Heatwave: fewer gang crews on the streets, and cold drinks (sodas, shakes, boba...) restore twice the guts.",
  },
};

/** Areas with a roof over them: weather doesn't reach. */
export const INDOOR = ["subway", "kennel", "lobby"];

/** Drinks that count as cold in a heatwave. */
export const COLD_DRINKS = [
  "soda",
  "shake",
  "lemonade",
  "horchata",
  "popsicle",
  "icecream",
  "boba",
  "tarotea",
  "shavedice",
  "lassi",
  "berryblast",
  "greenmachine",
  "cottoncandy",
];

/** The weather on a given day of a game (day 1 is always clear). */
export function weatherOn(seed: number, day: number): Weather {
  if (day <= 1) return "clear";
  const roll = hashSeed(seed, 0x77e47, day) % 100;
  return roll < 52 ? "clear" : roll < 72 ? "rain" : roll < 86 ? "fog" : "heat";
}
