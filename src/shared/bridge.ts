/** Messages between the game window and the Electron main process. */
export const IPC = {
  readSave: "rumblerow:read-save",
  writeSave: "rumblerow:write-save",
  deleteSave: "rumblerow:delete-save",
  toggleFullscreen: "rumblerow:toggle-fullscreen",
  quit: "rumblerow:quit",
  rendererReady: "rumblerow:renderer-ready",
} as const;

export interface SmokeReport {
  ok: boolean;
  scene: string;
  detail?: string;
}

export interface RumbleBridge {
  /** The saved game as text, or null when there is none. */
  readSave(): Promise<string | null>;
  writeSave(data: string): Promise<void>;
  deleteSave(): Promise<void>;
  toggleFullscreen(): Promise<void>;
  quit(): void;
  /** Smoke tests: the window has drawn the requested screen. */
  signalReady(report: SmokeReport): void;
  /** Smoke tests: which screen to show, if any. */
  smokeScene: string | null;
}

declare global {
  interface Window {
    rumblerow?: RumbleBridge;
  }
}
