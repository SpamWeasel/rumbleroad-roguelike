import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from "../../game/data/achievements";
import { STYLES, type StyleId } from "../../game/data/styles";
import type { Game } from "../../game/game";
import { readData, writeData } from "./storage";

/** Things kept across every game: earned achievements (id -> date earned). */
interface Profile {
  version: 1;
  achievements: Record<string, string>;
}

const profile: Profile = { version: 1, achievements: {} };

export async function loadProfile(): Promise<void> {
  try {
    const saved = JSON.parse((await readData("profile")) ?? "{}") as Partial<Profile>;
    if (saved.achievements && typeof saved.achievements === "object")
      for (const [id, date] of Object.entries(saved.achievements))
        if (ACHIEVEMENT_BY_ID[id] && typeof date === "string") profile.achievements[id] = date;
  } catch {
    // A broken profile just starts fresh.
  }
}

export function earned(id: string): string | undefined {
  return profile.achievements[id];
}

export function earnedCount(): number {
  return Object.keys(profile.achievements).length;
}

/** Whether a fighting style can be picked yet. */
export function styleUnlocked(id: StyleId): boolean {
  const need = STYLES[id]?.unlock;
  return !need || !!profile.achievements[need];
}

/**
 * Checks a game for newly earned achievements, records them and returns them, with any styles
 * they unlocked.
 */
export function checkAchievements(game: Game): { name: string; unlocks: string[] }[] {
  const fresh: { name: string; unlocks: string[] }[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id] || !a.check(game)) continue;
    profile.achievements[a.id] = new Date().toISOString().slice(0, 10);
    const unlocks = Object.values(STYLES)
      .filter((s) => s.unlock === a.id)
      .map((s) => s.name);
    fresh.push({ name: a.name, unlocks });
  }
  if (fresh.length) void writeData("profile", JSON.stringify(profile, null, 2));
  return fresh;
}
