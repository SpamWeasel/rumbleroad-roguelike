import { C } from "../../../game/colors";
import { BOSSES } from "../../../game/data/enemies";
import { ITEMS } from "../../../game/data/items";
import { BOSS_SCENES, INTRO_SCENE, QUEST_BY_ID, QUESTS } from "../../../game/data/quests";
import { RUMBLE_INTRO } from "../../../game/data/rumble";
import type { Game } from "../../../game/game";
import { AREAS } from "../../../game/world";
import type { App, Screen } from "../app";
import { isBack, isConfirm, isDown, isUp } from "../input";
import { Term } from "../term";

const BOX = { x: 10, y: 6, w: 70, h: 20 };

/** Talking to someone with a side quest: they ask, remind you, take an item, or reward you. */
export class TalkScreen implements Screen {
  private said: string[] | null = null;
  private saidColor: string = C.lime;

  constructor(
    private app: App,
    private quest: string,
  ) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const g = this.game;
    const status = g.questStatus(this.quest);
    if (isBack(e)) {
      this.app.pop();
      void this.app.save();
      return;
    }
    if (!isConfirm(e) && e.code !== "Space") return;
    if (this.said) {
      this.app.pop();
      void this.app.save();
      return;
    }
    const res =
      status === "offer"
        ? g.acceptQuest(this.quest)
        : status === "handin"
          ? g.handInQuest(this.quest)
          : status === "claim"
            ? g.claimQuest(this.quest)
            : null;
    if (!res) {
      this.app.pop();
      return;
    }
    for (const ev of g.events) if (ev.type === "sound") this.app.sound(ev.id);
    g.events.length = 0;
    if (status === "claim") {
      this.said = [`You get ${res.message}.`];
      this.saidColor = C.gold;
    } else if (status === "handin" && g.questStatus(this.quest) === "claim") {
      this.app.redraw();
    } else {
      this.said = [`Next: ${g.questTask(this.quest)}`];
      this.saidColor = C.yellow;
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const def = QUEST_BY_ID[this.quest];
    const { x, y, w, h } = BOX;
    t.box(x, y, w, h, def.color, def.giver, def.color);
    t.text(x + 3, y + 1, def.who, C.gray);
    const status = g.questStatus(this.quest);
    let lines: string[];
    let action: string;
    if (status === "offer") {
      lines = def.pitch;
      action = 'Enter: "I\'m on it."   Esc: "Not right now."';
    } else if (status === "handin") {
      const step = def.steps[g.s.quests[this.quest].step];
      const item = step.kind === "fetch" ? ITEMS[step.item].name : "it";
      lines = [`"Is that what I think it is? You found the ${item}!"`];
      action = `Enter: hand over the ${item}   Esc: keep it for now`;
    } else if (status === "claim") {
      lines = def.thanks;
      action = "Enter: take your reward";
    } else if (status === "active") {
      lines = ['"Any luck?"', g.questTask(this.quest)];
      action = 'Esc: "Working on it."';
    } else {
      lines = ['"Thanks again. I won\'t forget it."'];
      action = "Esc: leave";
    }
    let yy = y + 3;
    t.text(x + 3, yy++, def.name, C.yellow);
    yy++;
    for (const line of lines)
      for (const l of Term.wrap(line.startsWith('"') ? line : `"${line}"`, w - 8)) {
        t.text(x + 4, yy++, l, C.light);
      }
    yy++;
    if (status === "offer" || status === "claim")
      for (const l of Term.wrap(`Reward: ${def.reward.text}.`, w - 8))
        t.text(x + 4, yy++, l, C.gold);
    if (this.said) {
      yy++;
      for (const l of Term.wrap(this.said.join(" "), w - 8)) t.text(x + 4, yy++, l, this.saidColor);
      action = "Enter: done";
    }
    t.text(x + 3, y + h - 2, action, C.gray);
  }
}

/** A short scene: a boss the first time they spot you, or the opening of a new game ("intro"). */
export class SceneScreen implements Screen {
  private shown = 1;

  constructor(
    private app: App,
    private boss: string,
  ) {}

  private scene(): { title: string; color: string; lines: typeof INTRO_SCENE; end: string } {
    if (this.boss === "intro")
      return {
        title: "Rumble Row",
        color: C.pink,
        lines: INTRO_SCENE,
        end: "Enter: hit the streets",
      };
    const b = BOSSES[this.boss];
    return {
      title: `${b.name}, ${b.title}`,
      color: b.color,
      lines: BOSS_SCENES[this.boss] ?? [],
      end: "Enter: FIGHT!",
    };
  }

  key(e: KeyboardEvent): void {
    const lines = this.scene().lines;
    if (isBack(e) || this.shown >= lines.length) {
      if (isBack(e) || isConfirm(e) || e.code === "Space") this.app.pop();
      return;
    }
    if (isConfirm(e) || e.code === "Space") this.shown++;
  }

  draw(t: Term): void {
    const sc = this.scene();
    const { x, w } = BOX;
    // Tall enough for every line, so the last one never runs into the footer.
    const wrapped = sc.lines.map((l) => Term.wrap(l.line, w - 8));
    const h = wrapped.reduce((n, l) => n + l.length + 2, 0) + 5;
    const y = Math.max(1, Math.floor((36 - h) / 2));
    t.box(x, y, w, h, sc.color, sc.title, sc.color);
    let yy = y + 2;
    sc.lines.slice(0, this.shown).forEach((line, i) => {
      const you = line.speaker === "You";
      t.text(x + 3, yy++, `${line.speaker}:`, you ? C.cyan : sc.color);
      for (const l of wrapped[i]) t.text(x + 5, yy++, l, you ? C.white : C.light);
      yy++;
    });
    const more = this.shown < sc.lines.length;
    t.text(x + 3, y + h - 2, more ? "Enter: go on   Esc: skip" : sc.end, more ? C.gray : C.yellow);
  }
}

/** The roll call before the Rumble: Baron Voss on his megaphone, and everyone who came. */
export class RumbleScreen implements Screen {
  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e) || isConfirm(e) || e.code === "Space") this.app.pop();
  }

  draw(t: Term): void {
    const g = this.app.game as Game;
    const crew = g.rumbleRollCall();
    const x = 6;
    const w = 98;
    const intro = RUMBLE_INTRO.flatMap((l) => Term.wrap(l, w - 8));
    const h = intro.length + crew.length + 10;
    const y = Math.max(1, Math.floor((36 - h) / 2));
    t.box(x, y, w, h, C.red, "THE RUMBLE", C.red);
    let yy = y + 2;
    for (const l of intro) t.text(x + 4, yy++, l, C.light);
    yy++;
    t.text(
      x + 4,
      yy++,
      `${crew.length} ${crew.length === 1 ? "friend stands" : "friends stand"} with you:`,
      C.yellow,
    );
    for (const c of crew) {
      t.text(x + 5, yy, "☻", c.color);
      const nx = t.text(x + 7, yy, c.name, c.color, undefined, x + 44);
      t.text(nx, yy, `, ${c.title}`, C.gray, undefined, x + 44);
      t.text(x + 45, yy++, `"${c.line}"`, C.light, undefined, x + w - 2);
    }
    yy++;
    t.text(
      x + 4,
      yy,
      'Baron Voss lowers the megaphone. "So be it. Crowns! Clear the plaza!"',
      C.red,
    );
    t.text(x + 4, y + h - 2, "Enter: RUMBLE!", C.yellow);
  }
}

/** Every side quest: the ones on the go, the ones finished, and who still wants a word. */
export class QuestLogScreen implements Screen {
  private cursor = 0;

  constructor(private app: App) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || e.code === "KeyU") this.app.pop();
    else if (isUp(e)) this.cursor = (this.cursor + QUESTS.length - 1) % QUESTS.length;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % QUESTS.length;
  }

  draw(t: Term): void {
    const g = this.game;
    const x = 6;
    const y = 2;
    const w = 98;
    const h = 32;
    const done = QUESTS.filter((q) => g.questStatus(q.id) === "done").length;
    t.box(x, y, w, h, C.yellow, `Side Quests (${done} of ${QUESTS.length} done)`, C.yellow);
    QUESTS.forEach((q, i) => {
      const yy = y + 2 + i;
      const sel = i === this.cursor;
      const status = g.questStatus(q.id);
      const met = !!g.s.visits[q.area];
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      const mark =
        status === "done" ? "★" : status === "offer" ? "·" : status === "claim" ? "!" : "»";
      t.text(x + 4, yy, mark, status === "done" ? C.gold : status === "offer" ? C.dim : C.yellow);
      t.text(
        x + 6,
        yy,
        met || status !== "offer" ? q.name : "???",
        status === "offer" ? C.gray : C.white,
      );
      t.text(
        x + 32,
        yy,
        status === "offer"
          ? met
            ? `Talk to ${q.giver} in ${AREAS[q.area].name}`
            : "Somewhere in the city..."
          : status === "done"
            ? "Done"
            : g.questTask(q.id),
        status === "offer" ? C.dim : status === "done" ? C.gold : C.light,
        undefined,
        x + w - 2,
      );
    });
    const q = QUESTS[this.cursor];
    const status = g.questStatus(q.id);
    let yy = y + 4 + QUESTS.length;
    if (status !== "offer" || g.s.visits[q.area]) {
      t.text(t.text(x + 3, yy, q.name, C.yellow) + 2, yy, `for ${q.giver}, ${q.who}`, C.gray);
      yy += 2;
      if (status === "offer")
        t.text(
          x + 5,
          yy++,
          `${q.giver} stands outside in ${AREAS[q.area].name}, highlighted in yellow.`,
          C.light,
        );
      else {
        const step = g.s.quests[q.id]?.step ?? 0;
        q.steps.forEach((s, i) => {
          const finished = status === "done" || i < step;
          const now = !finished && i === step;
          t.text(
            x + 5,
            yy,
            finished ? "✓" : now ? "»" : "·",
            finished ? C.lime : now ? C.yellow : C.dim,
          );
          t.text(
            x + 7,
            yy++,
            s.text,
            finished ? C.gray : now ? C.white : C.dim,
            undefined,
            x + w - 2,
          );
        });
        const last = status === "done" ? "✓" : status === "claim" ? "»" : "·";
        t.text(x + 5, yy, last, status === "done" ? C.lime : status === "claim" ? C.yellow : C.dim);
        t.text(x + 7, yy++, `Go back to ${q.giver}.`, status === "claim" ? C.white : C.gray);
      }
      yy++;
      t.text(x + 5, yy, `Reward: ${q.reward.text}.`, C.gold, undefined, x + w - 2);
    }
    t.text(
      x + 3,
      y + h - 2,
      "↑↓ choose   Esc close   People highlighted in yellow have something to say.",
      C.dim,
    );
  }
}
