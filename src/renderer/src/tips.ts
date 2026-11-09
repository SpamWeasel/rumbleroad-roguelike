import { QUEST_BY_ID } from "../../game/data/quests";
import { WEATHER } from "../../game/data/weather";
import type { Game } from "../../game/game";
import { markTip, tipSeen } from "./profile";
import { keyName, settings } from "./settings";

/**
 * Tips for new players: each shows once (ever, across games) the first time its situation comes
 * up. They can be switched off in Settings.
 */
interface Tip {
  id: string;
  when: (g: Game) => boolean;
  text: (g: Game) => string;
}

const k = (action: keyof typeof settings.keys) => keyName(settings.keys[action][0]);

const TIPS: Tip[] = [
  {
    id: "gang",
    when: (g) => g.area.kind === "district" && g.visibleEnemies().length > 0,
    text: () =>
      `Gang members! Walk into one to punch, or press ${k("kick")} to kick (kicks knock foes back). ${k("guard")} guards.`,
  },
  {
    id: "windup",
    when: (g) => g.visibleEnemies().some((e) => e.windup),
    text: () =>
      `Someone's winding up a big hit: the flashing square gets hit next turn. Step out of the way or guard (${k("guard")}).`,
  },
  {
    id: "hurt",
    when: (g) => g.area.kind !== "town" && g.player.hp < g.maxHp() * 0.5,
    text: () =>
      `Hurt? Use a heal from your pockets (${k("pockets")}), rest with ${k("rest")} when nobody's around, or go back to town and eat.`,
  },
  {
    id: "bleed",
    when: (g) => !!g.player.bleed,
    text: () =>
      `You're bleeding! Any heal stops it: a snack from your pockets (${k("pockets")}) or a meal.`,
  },
  {
    id: "guard",
    when: (g) => g.visibleEnemies().some((e) => e.ai === "guard"),
    text: () =>
      `Guards (g) block punches from the front. Kick them (${k("kick")}), or get around the side.`,
  },
  {
    id: "medic",
    when: (g) => g.visibleEnemies().some((e) => e.ai === "medic"),
    text: () => "Medics (m) patch up their friends. Take them out first!",
  },
  {
    id: "cash",
    when: (g) => g.area.kind === "town" && g.player.cash >= 40 && g.s.turn > 30,
    text: () =>
      "You've got cash - spend it! Restaurant food heals AND raises your stats for good. Walk into a door to go in.",
  },
  {
    id: "special",
    when: (g) => g.player.techniques.length > 0,
    text: () =>
      `You know a special move! Press its number (1-9) to use it. Specials cost guts, which refill as you fight.`,
  },
  {
    id: "giver",
    when: (g) =>
      g.area.items.some(
        (i) =>
          i.kind === "giver" &&
          g.visible[i.y * g.area.w + i.x] === 1 &&
          g.questStatus(QUEST_BY_ID[i.quest]?.id ?? "") === "offer",
      ),
    text: () =>
      `Someone highlighted in yellow wants a word. Walk into them to talk. (${k("quests")}: your side quests)`,
  },
  {
    id: "night",
    when: (g) => g.isNight(),
    text: () =>
      "Night (21:00-5:00): darker streets, bigger and richer gang crews, and some shops close. Lantern Row's night market opens.",
  },
  {
    id: "turf",
    when: (g) => Object.values(g.s.turf ?? {}).some((t) => t.sweeps > 0),
    text: () =>
      `You cleared out a whole district! Do it on 3 different visits and it becomes your turf. (${k("map")}: city map)`,
  },
  ...(["rain", "fog", "heat"] as const).map((w) => ({
    id: `weather_${w}`,
    when: (g: Game) => g.weatherHere() === w,
    text: () => WEATHER[w].tip,
  })),
];

/** The next tip to show, if one is due (and marks it as shown). */
export function nextTip(g: Game): string | null {
  if (!settings.tips) return null;
  for (const tip of TIPS) {
    if (tipSeen(tip.id) || !tip.when(g)) continue;
    markTip(tip.id);
    return tip.text(g);
  }
  return null;
}
