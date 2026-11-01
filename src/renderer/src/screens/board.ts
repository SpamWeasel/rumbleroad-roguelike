import { C } from "../../../game/colors";
import { BOARDS, type Job } from "../../../game/data/jobs";
import { SHOPS } from "../../../game/data/shops";
import { type Game, jobText, MAX_JOBS, shopTown } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm, isDown, isUp } from "../input";
import { Term } from "../term";

const BOX = { x: 2, y: 1, w: 72, h: 26 };

const KIND_LABEL: Record<Job["kind"], string> = {
  bounty: "BOUNTY",
  sweep: "CLEAN-UP",
  courier: "DELIVERY",
};
const KIND_COLOR: Record<Job["kind"], string> = {
  bounty: C.red,
  sweep: C.orange,
  courier: C.cyan,
};

const DETAIL: Record<Job["kind"], string> = {
  bounty:
    "Find the wanted fighter in that district and knock them out. They're tougher than the usual gang members and never run. You're paid on the spot.",
  sweep:
    "Knock out that many members of the gang, anywhere in the city (fight club rings don't count). You're paid the moment the last one drops.",
  courier:
    "Walk into the shop's door with the parcel to deliver it. If you get knocked out on the way, the parcel is lost and so is the job.",
};

/**
 * A town job board (`boardId`), or just your own jobs when opened from the street (no board).
 * Enter takes a posted job; D twice drops one of yours.
 */
export class BoardScreen implements Screen {
  private cursor = 0;
  private message: string;
  private messageColor: string = C.light;
  private armedDrop = "";

  constructor(
    private app: App,
    private boardId: string | null,
  ) {
    this.message = boardId
      ? SHOPS[boardId].greet
      : "Your jobs. Rewards are paid the moment a job is done.";
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  private rows(): { job: Job; mine: boolean }[] {
    const g = this.game;
    const offers = this.boardId ? g.boardOffers(this.boardId) : [];
    return [
      ...offers.map((job) => ({ job, mine: false })),
      ...g.s.jobs.map((job) => ({ job, mine: true })),
    ];
  }

  key(e: KeyboardEvent): void {
    if (isBack(e)) {
      this.app.pop();
      void this.app.save();
      return;
    }
    const rows = this.rows();
    const n = rows.length;
    if (n === 0) return;
    this.cursor = Math.min(this.cursor, n - 1);
    const row = rows[this.cursor];
    if (isUp(e)) this.cursor = (this.cursor + n - 1) % n;
    else if (isDown(e)) this.cursor = (this.cursor + 1) % n;
    else if (isConfirm(e) && !row.mine && this.boardId) {
      const res = this.game.takeJob(this.boardId, row.job.id);
      this.message = res.message;
      this.messageColor = res.ok ? C.lime : C.orange;
      for (const ev of this.game.events) if (ev.type === "sound") this.app.sound(ev.id);
      this.game.events.length = 0;
      void this.app.save();
    } else if (e.code === "KeyD" && row.mine) {
      if (this.armedDrop !== row.job.id) {
        this.armedDrop = row.job.id;
        this.message = "Press D again to give up this job.";
        this.messageColor = C.orange;
        return;
      }
      this.game.dropJob(row.job.id);
      this.message = "Job dropped.";
      this.messageColor = C.gray;
      void this.app.save();
    }
    if (e.code !== "KeyD") this.armedDrop = "";
    this.cursor = Math.min(this.cursor, Math.max(0, this.rows().length - 1));
  }

  draw(t: Term): void {
    const g = this.game;
    const { x, y, w, h } = BOX;
    const title = this.boardId ? SHOPS[this.boardId].name : "Your Jobs";
    t.box(x, y, w, h, C.yellow, title, C.yellow);
    const cash = `$${g.player.cash}`;
    t.text(x + w - cash.length - 3, y, ` ${cash} `, C.gold);
    Term.wrap(this.message, w - 4)
      .slice(0, 2)
      .forEach((line, i) => t.text(x + 2, y + 2 + i, line, this.messageColor));

    const rows = this.rows();
    let yy = y + 5;
    const offers = rows.filter((r) => !r.mine);
    if (this.boardId) {
      t.text(x + 2, yy++, "POSTED TODAY", C.gray);
      if (offers.length === 0)
        t.text(x + 4, yy++, "Nothing left. New jobs go up every visit.", C.dim);
    }
    rows.forEach((row, i) => {
      if (row.mine && (i === 0 || !rows[i - 1].mine)) {
        yy++;
        t.text(x + 2, yy++, `YOUR JOBS (${g.s.jobs.length}/${MAX_JOBS})`, C.gray);
      }
      const sel = i === this.cursor;
      if (sel) t.fill(x + 1, yy, w - 2, 1, " ", C.light, C.dark);
      t.text(x + 2, yy, sel ? "►" : " ", C.yellow, sel ? C.dark : undefined);
      t.text(x + 4, yy, KIND_LABEL[row.job.kind], KIND_COLOR[row.job.kind]);
      t.text(
        x + 14,
        yy,
        jobText(row.job, true),
        row.mine ? C.light : C.white,
        undefined,
        x + w - 9,
      );
      const pay = `$${row.job.reward}`;
      t.text(x + w - 2 - pay.length, yy, pay, C.gold);
      yy++;
    });
    if (g.s.jobs.length === 0) {
      yy++;
      t.text(x + 2, yy++, `YOUR JOBS (0/${MAX_JOBS})`, C.gray);
      t.text(x + 4, yy++, "None yet. Job boards hang in every town.", C.dim);
    }

    const sel = rows[this.cursor];
    if (sel) {
      yy += 1;
      const posted = `Posted by ${sel.job.client}.`;
      t.text(x + 2, yy++, posted, C.tan, undefined, x + w - 1);
      if (sel.job.kind === "courier" && sel.job.to)
        t.text(
          x + 4,
          yy++,
          `Deliver to ${SHOPS[sel.job.to].name} in ${shopTown(sel.job.to)}.`,
          C.cyan,
        );
      for (const l of Term.wrap(DETAIL[sel.job.kind], w - 6)) t.text(x + 4, yy++, l, C.gray);
      const board = BOARDS[sel.job.board];
      if (sel.mine && !this.boardId && board)
        t.text(x + 4, yy++, `From the ${SHOPS[board.id].name}.`, C.dim);
    }

    const foot = this.boardId
      ? "↑↓ choose   Enter take job   D drop one of yours   Esc leave"
      : "↑↓ choose   D drop a job   Esc back";
    t.text(x + 2, y + h - 2, foot, C.gray);
  }
}

/** Your jobs, opened from the street. */
export class JobsScreen extends BoardScreen {
  constructor(app: App) {
    super(app, null);
  }
}
