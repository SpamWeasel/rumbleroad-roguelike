import { weatherOn } from "../../game/data/weather";
import { DAY_START, Game } from "../../game/game";
import { walkable } from "../../game/tiles";
import { App } from "./app";
import { loadProfile } from "./profile";
import { ARCADE_SLOT } from "./screens/arcade";
import { ArenaScreen } from "./screens/arena";
import { BoardScreen } from "./screens/board";
import { BusScreen } from "./screens/bus";
import { CarnivalScreen } from "./screens/carnival";
import { CharacterScreen } from "./screens/character";
import { CityMapScreen } from "./screens/citymap";
import { GuideScreen } from "./screens/guide";
import { AchievementsScreen, EndScreen, HelpScreen, startGame, TitleScreen } from "./screens/menus";
import { QuestLogScreen, SceneScreen, TalkScreen } from "./screens/quests";
import { ShopScreen } from "./screens/shop";
import { loadSettings, settings } from "./settings";
import { listSlots, readSlot, writeSlot } from "./storage";

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

void boot();

async function boot(): Promise<void> {
  await Promise.all([loadSettings(), loadProfile()]);
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const app = new App(canvas);
  app.reset(new TitleScreen(app));
  const smokeScene = window.rumblerow?.smokeScene;
  if (smokeScene) void smoke(app, smokeScene);
}

/** Smoke tests (scripts/smoke.mjs): show one screen, then tell Electron to take a screenshot. */
async function smoke(app: App, scene: string): Promise<void> {
  const frames = (n: number) =>
    new Promise<void>((resolve) => {
      const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  await frames(10);
  // Tips would pop up over every screenshot; their own scene turns them back on.
  settings.tips = scene === "tips";
  try {
    if (scene === "saves") {
      // Two good saves, then a broken one: loading must fall back to the newest backup.
      const a = Game.create("First", "street", 1).save();
      const b = Game.create("Second", "street", 2).save();
      await writeSlot(1, "save A", a);
      await writeSlot(1, "save B", b);
      await writeSlot(1, "save C", "this is not a game");
      const got = await readSlot(1);
      if (!got?.recovered || got.data !== b)
        errors.push(`backup recovery failed: ${JSON.stringify(got)?.slice(0, 80)}`);
      const slots = await listSlots();
      if (!slots.find((s) => s.slot === 1)?.damaged) errors.push("damaged slot not flagged");
      Game.load(got?.data ?? "");
    } else if (scene === "keys") {
      // Title > Settings > Change keys.
      for (const code of [
        "ArrowDown",
        "ArrowDown",
        "Enter",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "Enter",
      ])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene === "create") {
      // Title > New Game (the first option while there are no saves), then pick Boxer.
      for (const code of ["Enter", "ArrowDown", "ArrowRight"])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene === "arcadesetup") {
      // Title > Arcade Mode (the second option while there are no saves), then pick Kicker.
      for (const code of ["ArrowDown", "Enter", "ArrowDown", "ArrowRight", "ArrowRight"])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene === "settings") {
      // Title > Settings (after New Game and Arcade Mode while there are no saves).
      for (const code of ["ArrowDown", "ArrowDown", "Enter"])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene !== "title") {
      const play = startGame(app, Game.create("Smoke", "street", 12345), 2);
      for (let i = 0; i < 4; i++) app.game?.move(1, 0);
      play.flush();
      if (scene === "shop") app.push(new ShopScreen(app, "rosa"));
      if (scene === "arena") app.push(new ArenaScreen(app, "club_maple", play));
      if (scene === "help") app.push(new HelpScreen(app));
      if (scene === "achievements") app.push(new AchievementsScreen(app));
      if (scene === "bus") {
        const g = app.game as Game;
        g.s.visits.harbor = 1;
        g.player.cash = 50;
        app.push(new BusScreen(app, "bus_maple", play));
      }
      if (scene === "night") {
        // Maple Street after dark, with a closed bookstore and a partner.
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        g.s.clock = 23 * 60 - DAY_START - g.s.turn;
        if (!g.isNight()) errors.push("clock did not reach night");
        if (g.shopOpen("chapter")) errors.push("bookstore open at night");
        play.flush();
      }
      if (scene === "partner") {
        // Ironside Gym, on the Partner tab.
        (app.game as Game).player.cash = 300;
        app.push(new ShopScreen(app, "ironside"));
        for (const code of ["Tab", "Tab"])
          window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      }
      if (scene === "sheet") {
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        g.player.techniques = ["haymaker", "uppercut"];
        g.player.gear.hands = "tgloves";
        app.push(new CharacterScreen(app));
      }
      if (scene === "ending") {
        const g = app.game as Game;
        g.s.over = "won";
        g.s.turf.alleys = { sweeps: 3, held: true, raid: null, swept: 0 };
        g.s.quests.rosa_recipe = { step: 1, progress: 0, done: true };
        g.s.quests.pete_boat = { step: 2, progress: 0, done: true };
        app.push(new EndScreen(app, "won"));
        // New Game+ must start cleanly from a won game.
        const plus = Game.newGamePlus(g, 99);
        if (plus.s.plus !== 1) errors.push("New Game+ did not start");
      }
      if (["kennel", "ashgate", "tailor", "pawn"].includes(scene)) {
        const g = app.game as Game;
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        if (scene === "kennel") {
          // Face to face with Kilo Marsh in the Kennel.
          inside.enterArea("kennel", "<");
          const boss = g.area.enemies.find((e) => e.boss);
          if (boss?.kind !== "kilo") errors.push("Kilo is not in the Kennel");
          else {
            g.player.x = boss.x - 4;
            g.player.y = boss.y;
            boss.awake = true;
          }
          g.area.lit = true;
          g.updateView();
        } else {
          inside.enterArea("ashgate", "<");
          g.player.cash = 2600;
          g.player.gear = { body: "vest", hands: "weighted", feet: "fightshoes" };
          g.player.tailored = { body: 2, hands: 1 };
          g.player.pockets = ["herbal", "bandage", "firecracker"];
          if (g.stockOf("pawn").length !== 5) errors.push("pawn shop stock is wrong");
          if (scene === "tailor") app.push(new ShopScreen(app, "tailor"));
          if (scene === "pawn") app.push(new ShopScreen(app, "pawn"));
        }
        play.flush();
      }
      if (scene === "carnival") {
        // One swing at the High Striker on Sunset Pier.
        const g = app.game as Game;
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        inside.enterArea("pier", "^");
        g.player.cash = 40;
        g.s.tickets = 57;
        play.flush();
        app.push(new CarnivalScreen(app, "striker"));
        // Start, then swing when the marker swings past the middle (a quarter turn later).
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
        await new Promise((r) => setTimeout(r, 600));
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
        if ((g.s.tickets ?? 0) <= 57) errors.push("the High Striker paid no tickets");
      }
      if (scene === "nightmarket") {
        // Lantern Row after dark.
        const g = app.game as Game;
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        g.s.clock = 22 * 60 - DAY_START - g.s.turn;
        inside.enterArea("lantern", "v");
        if (!g.shopOpen("skewer")) errors.push("night market closed at night");
        play.flush();
      }
      if (scene === "talk") {
        // Rosa asks for a hand.
        const g = app.game as Game;
        if (!g.area.items.some((i) => i.kind === "giver")) errors.push("no quest-givers in Maple");
        app.push(new TalkScreen(app, "rosa_recipe"));
      }
      if (scene === "questlog") {
        // A few quests on the go, one done.
        const g = app.game as Game;
        g.s.visits.harbor = 1;
        g.s.visits.neon = 1;
        g.acceptQuest("rosa_recipe");
        g.s.quests.rosa_recipe = { step: 1, progress: 0, done: true };
        g.acceptQuest("coach_comeback");
        g.s.quests.coach_comeback.progress = 9;
        g.acceptQuest("pete_boat");
        g.s.quests.pete_boat.step = 1;
        g.events.length = 0;
        app.push(new QuestLogScreen(app));
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowDown" }));
      }
      if (scene === "scene") {
        // Gnash's scene, all the way through.
        app.push(new SceneScreen(app, "gnash"));
        for (let i = 0; i < 3; i++)
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
      }
      if (scene === "rain" || scene === "look" || scene === "tips") {
        // Out on Rustline Alleys on a rainy afternoon.
        const g = app.game as Game;
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        let day = 2;
        while (weatherOn(g.s.seed, day) !== "rain" && day < 60) day++;
        g.s.clock = (day - 1) * 1440 + 14 * 60 - DAY_START - g.s.turn;
        if (g.weather() !== "rain") errors.push("no rain day found");
        inside.enterArea("alleys", "<");
        g.area.lit = true;
        g.updateView();
        play.flush();
        if (scene === "look") {
          // Look at the nearest gang member with the keyboard cursor.
          const p = g.player;
          const e = [...g.area.enemies].sort(
            (a, b) =>
              Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) -
              Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)),
          )[0];
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV" }));
          const looking = play as unknown as { look: { x: number; y: number } | null };
          if (!looking.look) errors.push("look mode did not start");
          else if (e) looking.look = { x: e.x, y: e.y };
        }
      }
      if (scene === "guide" || scene === "gangguide") {
        const g = app.game as Game;
        g.s.visits.harbor = 1;
        g.s.tried = ["pancakes", "chili", "coffee", "ramen", "dumplings", "fishchips", "hotdog"];
        g.s.beaten = [
          "rats:punk",
          "rats:scrapper",
          "rats:slinger",
          "rats:cutter",
          "vipers:punk",
          "vipers:medic",
        ];
        g.s.flags.gnash = true;
        g.s.flags.met_mara = true;
        app.push(new GuideScreen(app));
        if (scene === "gangguide")
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
        else
          for (let i = 0; i < 3; i++)
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowDown" }));
      }
      if (scene === "intro") app.push(new SceneScreen(app, "intro"));
      if (scene === "rollcall" || scene === "rumble") {
        // Crown Plaza with a big crew: a partner, quest friends, the rival, a champ and turf.
        const g = app.game as Game;
        const p = g.player;
        for (const k of ["punch", "kick", "strength", "agility", "defense", "guts"] as const)
          p.base[k] = 60;
        p.base.stamina = 220;
        p.hp = 220;
        p.cash = 2000;
        g.hirePartner("riptide");
        for (const q of ["rosa_recipe", "coach_comeback", "pete_boat", "mike_sauce", "jinx_arcade"])
          g.s.quests[q] = { step: 9, progress: 0, done: true };
        g.s.rival.wins = 5;
        g.s.flags.title_club_harbor = true;
        g.s.turf.docks = { sweeps: 3, held: true, raid: null, swept: 0 };
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        inside.enterArea("plaza", "<");
        if (!g.rumbleOn()) errors.push("the Rumble did not start");
        if (scene === "rumble") {
          g.events.length = 0;
          // Let the two sides close in for a few turns.
          for (let i = 0; i < 6 && g.rumbleOn(); i++) g.guard();
          if (!g.rumbleInfo()) errors.push("no Rumble info");
        }
        play.flush();
      }
      if (scene === "carry") {
        // Holding a Rust Rat overhead in the alleys, with his friends lined up.
        const g = app.game as Game;
        const inside = g as unknown as { enterArea(id: string, arrive: string): void };
        inside.enterArea("alleys", "<");
        g.area.lit = true;
        const p = g.player;
        const foe = g.area.enemies.find((e) => !e.ally);
        if (!foe) errors.push("no one to lift");
        else {
          const spot = [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
            [1, 1],
            [-1, -1],
          ].find(
            ([dx, dy]) =>
              g.tileAt(p.x + dx, p.y + dy) !== undefined &&
              walkable(g.tileAt(p.x + dx, p.y + dy)) &&
              !g.enemyAt(p.x + dx, p.y + dy),
          );
          if (spot) {
            foe.x = p.x + spot[0];
            foe.y = p.y + spot[1];
          }
          foe.down = 3;
          p.facing = spot ? [spot[0], spot[1]] : p.facing;
          g.area.items = g.area.items.filter((i) => i.x !== p.x || i.y !== p.y);
          if (!g.grab() || !p.carry) errors.push("could not lift the gang member");
        }
        g.updateView();
        play.flush();
      }
      if (scene === "arcade" || scene === "arcadepick" || scene === "arcadeover") {
        // An Arcade run a few waves in, with a friend and some upgrades.
        const g = Game.createArcade("Smoke", 4242, "allround");
        const arcadePlay = startGame(app, g, ARCADE_SLOT);
        const inside = g as unknown as { knockOut(e: unknown): void };
        for (let w = 0; w < 3; w++) {
          for (const e of [...g.area.enemies]) if (!e.ally) inside.knockOut(e);
          g.wait();
          const offers = g.s.arcade?.offers ?? [];
          const friend = offers.findIndex((o) => o.startsWith("friend"));
          g.pickArcade(friend >= 0 ? friend : 0);
        }
        if (g.arcadeInfo()?.wave !== 4) errors.push("the Arcade did not reach wave 4");
        for (let i = 0; i < 4; i++) g.guard();
        if (scene === "arcadepick") {
          for (const e of [...g.area.enemies]) if (!e.ally) inside.knockOut(e);
          g.wait();
          if (!g.s.arcade?.offers) errors.push("no upgrades on offer");
        }
        if (scene === "arcadeover") {
          g.player.pockets = [];
          g.player.hp = 0;
          (g as unknown as { playerDown(): void }).playerDown();
          if (g.s.over !== "dead") errors.push("the Arcade run did not end");
        }
        g.events = g.events.filter((e) => e.type !== "dead" || scene === "arcadeover");
        arcadePlay.flush();
      }
      if (scene === "citymap") {
        // Halfway through the city with some turf, one block under attack.
        const g = app.game as Game;
        g.s.daily = "2026-11-03";
        for (const id of [
          "maple",
          "alleys",
          "scrapyard",
          "trainyard",
          "harbor",
          "docks",
          "cannery",
          "pier9",
          "neon",
        ])
          g.s.visits[id] = 2;
        g.s.flags.gnash = true;
        g.s.flags.mara = true;
        g.s.turf.alleys = { sweeps: 3, held: true, raid: null, swept: 0 };
        g.s.turf.scrapyard = { sweeps: 3, held: true, raid: 99999, swept: 0 };
        g.s.turf.docks = { sweeps: 1, held: false, raid: null, swept: 0 };
        app.push(new CityMapScreen(app));
      }
      if (scene === "board") {
        const g = app.game as Game;
        const first = g.boardOffers("board_maple")[0];
        if (!first || !g.takeJob("board_maple", first.id).ok) errors.push("could not take a job");
        app.push(new BoardScreen(app, "board_maple"));
      }
      if (scene === "street") {
        // A district with a job on the go, a shakedown and the rival about.
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        for (const job of g.boardOffers("board_maple")) g.takeJob("board_maple", job.id);
        const inside = g as unknown as {
          enterArea(id: string, arrive: string): void;
          spawnRival(): void;
        };
        for (let i = 0; i < 40 && !g.area.items.some((it) => it.kind === "npc"); i++)
          inside.enterArea("alleys", "<");
        inside.spawnRival();
        for (const e of g.area.enemies) e.awake = e.event === "rival" || e.event === "shakedown";
        // Walk toward the trouble so it shows on screen.
        const npc = g.area.items.find((it) => it.kind === "npc");
        if (!npc) errors.push("no shakedown happened");
        else {
          let best: { x: number; y: number } | null = null;
          for (let dy = -5; dy <= 5; dy++)
            for (let dx = -5; dx <= 5; dx++) {
              const x = npc.x + dx;
              const y = npc.y + dy;
              const far = Math.max(Math.abs(dx), Math.abs(dy)) >= 4;
              if (far && !best && walkable(g.tileAt(x, y)) && !g.enemyAt(x, y)) best = { x, y };
            }
          if (best) {
            g.player.x = best.x;
            g.player.y = best.y;
          }
          const pal = g.ally();
          const near = best
            ? [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
                [1, 1],
                [-1, -1],
                [1, -1],
                [-1, 1],
              ]
                .map(([dx, dy]) => ({
                  x: (best as { x: number }).x + dx,
                  y: (best as { y: number }).y + dy,
                }))
                .find((q) => walkable(g.tileAt(q.x, q.y)) && !g.enemyAt(q.x, q.y))
            : undefined;
          if (pal && near) {
            pal.x = near.x;
            pal.y = near.y;
          }
          // Lit up so the screenshot shows everything.
          g.area.lit = true;
          g.updateView();
        }
        play.flush();
      }
      if (scene === "bout") {
        const g = app.game as Game;
        g.player.cash = 100;
        g.startBout("club_maple", 0, 10);
        play.flush();
        // Point the mouse at a challenger to show the info box (the small ring is centered).
        const e = g.area.enemies[0];
        if (e)
          play.hover({
            x: e.x + Math.floor((76 - g.area.w) / 2),
            y: e.y + Math.floor((26 - g.area.h) / 2),
          });
      }
      // A save written mid-area loads back.
      if (scene === "game") Game.load((app.game as Game).save());
    }
  } catch (err) {
    errors.push(String(err));
  }
  await frames(20);
  window.rumblerow?.signalReady({
    ok: errors.length === 0,
    scene,
    detail: errors.join("; ") || undefined,
  });
}
