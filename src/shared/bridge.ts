/** Messages between the game window and the Electron main process. */
export const IPC = {
  readSave: "rumblerow:read-save",
  writeSave: "rumblerow:write-save",
  deleteSave: "rumblerow:delete-save",
  toggleFullscreen: "rumblerow:toggle-fullscreen",
  quit: "rumblerow:quit",
} as const;

export interface RumbleBridge {
  /** The saved game as text, or null when there is none. */
  readSave(): Promise<string | null>;
  writeSave(data: string): Promise<void>;
  deleteSave(): Promise<void>;
  toggleFullscreen(): Promise<void>;
  quit(): void;
}

declare global {
  interface Window {
    rumblerow?: RumbleBridge;
  }
}
