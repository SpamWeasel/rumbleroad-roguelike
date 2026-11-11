import type { Game } from "../../game/game";
import { DIFFICULTY } from "../../game/types";
import { readData, writeData } from "./storage";

/** Finished runs, best first. Kept beside the saves. */
export interface RunRecord {
  name: string;
  result: "won" | "dead";
  difficulty: string;
  mode: string;
  area: string;
  kos: number;
  turns: number;
  date: string;
  /** A daily run's date. */
  daily?: string;
  /** Arcade Mode: waves cleared. */
  arcade?: number;
}

export async function loadRecords(): Promise<RunRecord[]> {
  try {
    const list = JSON.parse((await readData("records")) ?? "[]") as RunRecord[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addRecord(game: Game, result: "won" | "dead"): Promise<void> {
  const list = await loadRecords();
  list.push({
    name: game.player.name,
    result,
    difficulty: DIFFICULTY[game.s.difficulty].label,
    mode: game.s.mode === "permadeath" ? "Permadeath" : "Street Rules",
    area: game.area.name,
    kos: game.player.kos,
    turns: game.s.turn,
    date: new Date().toISOString().slice(0, 10),
    daily: game.s.daily,
    arcade: game.s.arcade?.cleared,
  });
  // Wins first (fastest first), then Arcade runs (most waves first), then the rest by how many
  // gang members they beat.
  const rank = (r: RunRecord) => (r.result === "won" ? 0 : r.arcade !== undefined ? 1 : 2);
  list.sort((a, b) =>
    rank(a) !== rank(b)
      ? rank(a) - rank(b)
      : rank(a) === 0
        ? a.turns - b.turns
        : rank(a) === 1
          ? (b.arcade ?? 0) - (a.arcade ?? 0)
          : b.kos - a.kos,
  );
  await writeData("records", JSON.stringify(list.slice(0, 50)));
}
