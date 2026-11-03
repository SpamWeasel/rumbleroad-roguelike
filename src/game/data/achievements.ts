import type { Game } from "../game";
import { TURF_AREAS } from "../world";

/**
 * Achievements are earned across all your games (kept in the profile beside the saves, not in
 * a save). Some unlock new fighting styles (see `unlock` in data/styles.ts). Each check reads
 * the current game; the renderer runs them after every action.
 */
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (g: Game) => boolean;
}

const won = (g: Game) => g.s.over === "won";
const held = (g: Game) => Object.values(g.s.turf ?? {}).filter((t) => t.held).length;
const titles = (g: Game) => Object.keys(g.s.flags).filter((k) => k.startsWith("title_")).length;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_ko",
    name: "Welcome to the Neighborhood",
    desc: "Knock out your first gang member.",
    check: (g) => g.player.kos >= 1,
  },
  {
    id: "gnash",
    name: "Rat Catcher",
    desc: "Beat Gnash, King of the Rust Rats.",
    check: (g) => !!g.s.flags.gnash,
  },
  {
    id: "mara",
    name: "Snake Charmer",
    desc: "Beat Mara Fang, Queen of the Neon Vipers.",
    check: (g) => !!g.s.flags.mara,
  },
  {
    id: "kilo",
    name: "Top Dog",
    desc: "Beat Kilo Marsh in the Kennel.",
    check: (g) => !!g.s.flags.kilo,
  },
  {
    id: "varga",
    name: "The City Is Free",
    desc: "Beat Duke Varga on the roof of Crown Tower.",
    check: won,
  },
  {
    id: "champ",
    name: "Belt Holder",
    desc: "Win a fight club title bout.",
    check: (g) => titles(g) >= 1,
  },
  {
    id: "triple",
    name: "Undisputed",
    desc: "Hold three fight club title belts.",
    check: (g) => titles(g) >= 3,
  },
  {
    id: "grandslam",
    name: "Grand Slam",
    desc: "Hold all four fight club title belts.",
    check: (g) => titles(g) >= 4,
  },
  {
    id: "bespoke",
    name: "Bespoke",
    desc: "Have a piece of gear tailored as far as it goes.",
    check: (g) => Object.values(g.player.tailored ?? {}).some((n) => (n ?? 0) >= 3),
  },
  {
    id: "turf",
    name: "Block Captain",
    desc: "Hold three districts as your turf at once.",
    check: (g) => held(g) >= 3,
  },
  {
    id: "mayor",
    name: "Mayor of the Streets",
    desc: "Hold every street district in the city at once.",
    check: (g) => held(g) >= TURF_AREAS.length,
  },
  {
    id: "defender",
    name: "Neighborhood Watch",
    desc: "Drive off 3 raids on your turf.",
    check: (g) => (g.s.tally.raids ?? 0) >= 3,
  },
  {
    id: "daily",
    name: "Daily Grind",
    desc: "Win a daily run.",
    check: (g) => won(g) && !!g.s.daily,
  },
  {
    id: "ding",
    name: "Ding Ding Ding!",
    desc: "Ring the bell on the High Striker.",
    check: (g) => (g.s.tally.dings ?? 0) >= 1,
  },
  {
    id: "bigprize",
    name: "Grand Prize",
    desc: "Win the Ringmaster's Jacket at the Prize Booth.",
    check: (g) => !!g.s.flags.won_ringmaster,
  },
  {
    id: "samaritan",
    name: "Good Samaritan",
    desc: "Rescue 5 people from shakedowns.",
    check: (g) => g.s.tally.rescues >= 5,
  },
  {
    id: "worker",
    name: "Odd Jobber",
    desc: "Finish 10 jobs from the job boards.",
    check: (g) => g.s.tally.jobs >= 10,
  },
  {
    id: "rival",
    name: "Rivals No More",
    desc: "Beat Dex Marlowe five times.",
    check: (g) => g.s.rival.wins >= 5,
  },
  {
    id: "team",
    name: "Tag Team",
    desc: "Team up with a partner.",
    check: (g) => !!g.s.flags.hired,
  },
  {
    id: "gourmet",
    name: "Gourmet",
    desc: "Eat 40 meals at restaurants and stands.",
    check: (g) => g.s.tally.meals >= 40,
  },
  {
    id: "night_owl",
    name: "Night Owl",
    desc: "Knock out 40 gang members after dark.",
    check: (g) => g.s.tally.nightKos >= 40,
  },
  {
    id: "moves",
    name: "Move Collector",
    desc: "Know 8 special moves.",
    check: (g) => g.player.techniques.length >= 8,
  },
  {
    id: "hard",
    name: "Hard Case",
    desc: "Beat Duke Varga on Hard.",
    check: (g) => won(g) && g.s.difficulty === "hard",
  },
  {
    id: "iron",
    name: "One Life",
    desc: "Beat Duke Varga with Permadeath rules.",
    check: (g) => won(g) && g.s.mode === "permadeath",
  },
  {
    id: "plus",
    name: "Again, But Meaner",
    desc: "Start a New Game+.",
    check: (g) => (g.s.plus ?? 0) >= 1,
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
