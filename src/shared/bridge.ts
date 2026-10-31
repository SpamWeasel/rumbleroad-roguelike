/** Messages between the game window and the Electron main process. */
export const IPC = {
  appInfo: "rumblerow:app-info",
  listSlots: "rumblerow:list-slots",
  readSlot: "rumblerow:read-slot",
  writeSlot: "rumblerow:write-slot",
  deleteSlot: "rumblerow:delete-slot",
  readData: "rumblerow:read-data",
  writeData: "rumblerow:write-data",
  copyText: "rumblerow:copy-text",
  setFullscreen: "rumblerow:set-fullscreen",
  quit: "rumblerow:quit",
  closing: "rumblerow:closing",
  closeReady: "rumblerow:close-ready",
  rendererReady: "rumblerow:renderer-ready",
} as const;

export const SAVE_SLOTS = 3;
/** Small data files kept beside the saves. */
export const DATA_FILES = ["settings", "records"] as const;
export type DataFile = (typeof DATA_FILES)[number];

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
}

export interface SlotInfo {
  slot: number;
  /** e.g. "Ace - Harbor Market - Normal - 120 KOs" */
  title: string;
  savedAt: string;
  damaged?: boolean;
}

export interface SlotData {
  data: string;
  /** The main file was damaged, so this came from the newest good backup. */
  recovered: boolean;
}

export interface SmokeReport {
  ok: boolean;
  scene: string;
  detail?: string;
}

export interface RumbleBridge {
  appInfo(): Promise<AppInfo>;
  listSlots(): Promise<SlotInfo[]>;
  readSlot(slot: number): Promise<SlotData | null>;
  writeSlot(slot: number, title: string, data: string): Promise<void>;
  deleteSlot(slot: number): Promise<void>;
  readData(name: DataFile): Promise<string | null>;
  writeData(name: DataFile, text: string): Promise<void>;
  copyText(text: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  quit(): void;
  /** Called when the window is about to close, so the game can save first. */
  onClosing(handler: () => Promise<void> | void): void;
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
