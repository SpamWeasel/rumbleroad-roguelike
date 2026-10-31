import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/game/data/items";
import { SHOPS } from "../src/game/data/shops";
import { TECHNIQUES } from "../src/game/data/techniques";
import { Game } from "../src/game/game";
import { generateDistrict } from "../src/game/generate";
import { distanceMap } from "../src/game/grid";
import { T, walkable } from "../src/game/tiles";
import { DIRS8 } from "../src/game/types";
import { AREAS, buildArea, parseStatic } from "../src/game/world";
import { playGame } from "./bot";

describe("data", () => {
  it("every shop sells real items and teaches real techniques", () => {
    for (const shop of Object.values(SHOPS)) {
      for (const id of shop.stock) expect(ITEMS[id], `${shop.id} sells ${id}`).toBeDefined();
      for (const id of shop.gym?.techniques ?? [])
        expect(TECHNIQUES[id], `${shop.id} teaches ${id}`).toBeDefined();
    }
  });

  it("every technique is taught somewhere", () => {
    const taught = new Set(Object.values(SHOPS).flatMap((s) => s.gym?.techniques ?? []));
    for (const id of Object.keys(TECHNIQUES)) expect(taught.has(id), id).toBe(true);
  });
});

describe("static maps", () => {
  for (const def of Object.values(AREAS).filter((d) => d.map)) {
    it(`${def.id} is well formed and connected`, () => {
      const rows = (def.map as string).split("\n").filter((r) => r.length);
      const widths = new Set(rows.map((r) => r.length));
      expect([...widths], "all rows the same width").toHaveLength(1);
      const p = parseStatic(def.map as string, def.doors);
      expect(p.unknown, "unknown map letters").toEqual([]);
      // Every exit marker is wired up, and every wired exit exists.
      for (const e of p.exits) expect(def.exits[e.marker], `exit ${e.marker}`).toBeDefined();
      for (const m of Object.keys(def.exits))
        expect(
          p.exits.some((e) => e.marker === m),
          `marker ${m} on map`,
        ).toBe(true);
      // From any exit you can reach every other exit, every shop door and every spawn.
      const walk = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < p.w && y < p.h && walkable(p.tiles[y * p.w + x]);
      const from = p.exits.length ? [p.exits[0]] : [p.start as { x: number; y: number }];
      const dist = distanceMap(p.w, p.h, walk, from);
      for (const e of p.exits)
        expect(
          dist[e.y * p.w + e.x],
          `reach exit ${e.marker} at ${e.x},${e.y}`,
        ).toBeGreaterThanOrEqual(0);
      for (const [i, shop] of p.doors) expect(dist[i], `reach ${shop}`).toBeGreaterThanOrEqual(0);
      for (const s of p.spawns)
        expect(dist[s.y * p.w + s.x], `reach spawn at ${s.x},${s.y}`).toBeGreaterThanOrEqual(0);
      if (p.start) expect(dist[p.start.y * p.w + p.start.x]).toBeGreaterThanOrEqual(0);
    });
  }

  it("every exit leads to an area that has the matching arrival marker", () => {
    for (const def of Object.values(AREAS)) {
      for (const [marker, link] of Object.entries(def.exits)) {
        const target = AREAS[link.to];
        expect(target, `${def.id} ${marker} -> ${link.to}`).toBeDefined();
        expect(target.exits[link.arrive]?.to, `${link.to} links back from ${link.arrive}`).toBe(
          def.id,
        );
      }
    }
  });

  it("shop signs fit: each door has a wall run of at least 3 above or below it", () => {
    for (const def of Object.values(AREAS).filter((d) => d.map)) {
      const p = parseStatic(def.map as string, def.doors);
      for (const [i, shop] of p.doors) {
        if (!SHOPS[shop].sign) continue;
        const x = i % p.w;
        const y = Math.floor(i / p.w);
        const above = !walkable(p.tiles[(y - 1) * p.w + x]);
        const below = !walkable(p.tiles[(y + 1) * p.w + x]);
        expect(above || below, `${def.id} door at ${x},${y}`).toBe(true);
      }
    }
  });
});

describe("random districts", () => {
  const cases = [
    ["streets", "alley"],
    ["streets", "yard"],
    ["streets", "docks"],
    ["streets", "warehouse"],
    ["streets", "construction"],
    ["park", "alley"],
    ["tunnel", "alley"],
  ] as const;
  for (const [kind, theme] of cases) {
    it(`${kind}/${theme} always connects both ends and every vendor`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const r = generateDistrict(seed * 977, kind, theme);
        const g = r.grid;
        const west = r.exits.filter((e) => e.marker === "<");
        const east = r.exits.filter((e) => e.marker === ">");
        expect(west.length).toBeGreaterThan(0);
        expect(east.length).toBeGreaterThan(0);
        const dist = distanceMap(g.w, g.h, (x, y) => g.walk(x, y), west);
        for (const e of east)
          expect(dist[e.y * g.w + e.x], `seed ${seed}`).toBeGreaterThanOrEqual(0);
        for (const [i] of r.doors) expect(dist[i], `vendor seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("is the same layout for the same seed", () => {
    const a = generateDistrict(1234, "streets", "docks");
    const b = generateDistrict(1234, "streets", "docks");
    expect(Buffer.from(a.grid.t).equals(Buffer.from(b.grid.t))).toBe(true);
  });

  it("districts spawn gangs away from the entrances", () => {
    for (const id of ["alleys", "docks", "park", "subway", "steelworks"]) {
      const area = buildArea(id, 42, 1, {});
      expect(area.enemies.length, id).toBeGreaterThan(2);
      for (const e of area.enemies) expect(area.tiles[e.y * area.w + e.x], id).not.toBe(T.WALL);
    }
  });
});

describe("playing", () => {
  it("a wandering bot survives thousands of turns without errors", () => {
    for (const seed of [1, 2, 3]) {
      const game = Game.create("Bot", "street", seed);
      game.player.cash = 5000;
      let n = 0;
      // Walk east through the city, fighting whatever is in the way.
      for (let step = 0; step < 4000 && !game.s.over; step++) {
        game.events.length = 0;
        const adj = game.adjacentEnemies();
        if (adj.length) {
          const pick = adj[step % adj.length];
          if (step % 7 === 0 && game.player.techniques.length) game.technique(0, pick.dir);
          else if (step % 3 === 0) game.kick(pick.dir);
          else game.punch(pick.dir);
        } else {
          const ex = game.area.exits.find((e) => e.marker === ">") ?? game.area.exits[0];
          const p = game.player;
          const dist = distanceMap(
            game.area.w,
            game.area.h,
            (x, y) => walkable(game.tileAt(x, y)),
            [ex],
          );
          let best = DIRS8[step % 8];
          let bd = dist[p.y * game.area.w + p.x];
          for (const d of DIRS8) {
            const v = dist[(p.y + d[1]) * game.area.w + p.x + d[0]];
            if (v >= 0 && v < bd && !game.enemyAt(p.x + d[0], p.y + d[1])) {
              bd = v;
              best = d;
            }
          }
          if (!game.move(best[0], best[1])) game.wait();
        }
        if (step === 50) game.learn("ironside", "haymaker");
        n++;
      }
      expect(n).toBeGreaterThan(100);
      // The save round-trips.
      const again = Game.load(game.save());
      expect(again.player.kos).toBe(game.player.kos);
    }
  });

  it("food raises stats until its limit", () => {
    const game = Game.create("Eater", "street", 9);
    game.player.cash = 10000;
    const before = game.player.base.agility;
    game.buy("rosa", "pancakes");
    expect(game.player.base.agility).toBe(before + 1);
    for (let i = 0; i < 40; i++) game.buy("rosa", "pancakes");
    expect(game.player.base.agility).toBe(25);
  });

  it("learning a technique needs the stats and the cash", () => {
    const game = Game.create("Learner", "street", 9);
    expect(game.learn("ironside", "haymaker").ok).toBe(false);
    game.player.cash = 500;
    game.player.base.punch = 8;
    expect(game.learn("ironside", "haymaker").ok).toBe(true);
    expect(game.player.techniques).toContain("haymaker");
  });
});

describe("balance", () => {
  it("the balance bot can beat the game on Street Rules", { timeout: 120_000 }, () => {
    const r = playGame(1021, 30000);
    expect(r.won, `reached ${Object.keys(r.reached).join(",")}`).toBe(true);
    // Hard but fair: some knock-outs along the way, not dozens.
    expect(r.deaths).toBeGreaterThan(2);
    expect(r.deaths).toBeLessThan(40);
  });
});
