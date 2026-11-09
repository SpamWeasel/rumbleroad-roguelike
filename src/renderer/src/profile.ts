import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from "../../game/data/achievements";
import { STYLES, type StyleId } from "../../game/data/styles";
import type { Game } from "../../game/game";
import { readData, writeData } from "./storage";

/** Things kept across every game: earned achievements (id -> date earned). */
interface Profile {
  version: 1;
  achievements: Record<string, string>;
  /** New-player tips already shown. */
  tips?: string[];
}

const profile: Profile = { version: 1, achievements: {}, tips: [] };

export async function loadProfile(): Promise<void> {
  try {
    const saved = JSON.parse((await readData("profile")) ?? "{}") as Partial<Profile>;
    if (saved.achievements && typeof saved.achievements === "object")
      for (const [id, date] of Object.entries(saved.achievements))
        if (ACHIEVEMENT_BY_ID[id] && typeof date === "string") profile.achievements[id] = date;
    if (Array.isArray(saved.tips))
      profile.tips = saved.tips.filter((t): t is string => typeof t === "string");
  } catch {
    // A broken profile just starts fresh.
  }
}

export function tipSeen(id: string): boolean {
  return !!profile.tips?.includes(id);
}

export function markTip(id: string): void {
  profile.tips = [...(profile.tips ?? []), id];
  void writeData("profile", JSON.stringify(profile, null, 2));
}

/** Shows every tip again (Settings). */
export function resetTips(): void {
  profile.tips = [];
  void writeData("profile", JSON.stringify(profile, null, 2));
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
