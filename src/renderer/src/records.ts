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
  });
  // Wins first (fastest first), then the rest by how many gang members they beat.
  list.sort((a, b) =>
    a.result === b.result
      ? a.result === "won"
        ? a.turns - b.turns
        : b.kos - a.kos
      : a.result === "won"
        ? -1
        : 1,
  );
  await writeData("records", JSON.stringify(list.slice(0, 50)));
}
