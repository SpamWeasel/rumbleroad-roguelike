import type { Game } from "../../game/game";
import { play } from "./audio";
import { deleteSave, writeSave } from "./storage";
import { Term } from "./term";

export interface Screen {
  draw(t: Term, now: number): void;
  /** Extra drawing on top of the grid (floating numbers). */
  overlay?(ctx: CanvasRenderingContext2D, t: Term, now: number): void;
  key(e: KeyboardEvent): void;
  /** True while something is animating and the screen must keep redrawing. */
  animating?(now: number): boolean;
}

/** Owns the canvas, the screen stack and the current game. */
export class App {
  readonly term = new Term();
  private stack: Screen[] = [];
  private dirty = true;
  game: Game | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2D canvas.");
    const resize = () => {
      this.term.layout(canvas, window.innerWidth, window.innerHeight);
      this.dirty = true;
    };
    window.addEventListener("resize", resize);
    resize();
    window.addEventListener("keydown", (e) => {
      if (e.code === "F11") {
        e.preventDefault();
        void window.rumblerow?.toggleFullscreen();
        return;
      }
      // Keep the browser from scrolling, tabbing away or opening menus.
      if (
        [
          "Tab",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Slash",
          "F1",
          "Backspace",
        ].includes(e.code)
      )
        e.preventDefault();
      this.top()?.key(e);
      this.dirty = true;
    });
    const frame = (now: number) => {
      const top = this.top();
      if (top && (this.dirty || top.animating?.(now))) {
        this.dirty = false;
        this.term.clear();
        // Draw every screen from the bottom up so pop-ups sit over the game.
        for (const s of this.stack) s.draw(this.term, now);
        this.term.draw(ctx);
        for (const s of this.stack) s.overlay?.(ctx, this.term, now);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(s: Screen): void {
    this.stack.push(s);
    this.dirty = true;
  }

  pop(): void {
    this.stack.pop();
    this.dirty = true;
  }

  /** Replaces the whole stack with one screen. */
  reset(s: Screen): void {
    this.stack = [s];
    this.dirty = true;
  }

  redraw(): void {
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.game || this.game.s.over === "dead") return;
    await writeSave(this.game.save());
  }

  async forget(): Promise<void> {
    await deleteSave();
  }

  sound = play;
}
