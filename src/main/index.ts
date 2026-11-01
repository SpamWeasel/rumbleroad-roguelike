import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
} from "electron";
import {
  DATA_FILES,
  IPC,
  SAVE_SLOTS,
  type SlotData,
  type SlotInfo,
  type SmokeReport,
} from "../shared/bridge";

/** Smoke tests: draw one screen, save a screenshot and a report beside it, then quit. */
const smokeScreenshot = process.env.RUMBLEROW_SMOKE_SCREENSHOT;
const smokeScene = process.env.RUMBLEROW_SMOKE_SCENE ?? "title";

// Development runs keep their own saves so testing never touches a player's game.
if (process.env.RUMBLEROW_USER_DATA) app.setPath("userData", process.env.RUMBLEROW_USER_DATA);
else if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "RumbleRow Dev"));

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const rendererFile = join(__dirname, "../renderer/index.html");
const trustedPagePrefix = devServerUrl ?? pathToFileURL(rendererFile).href;
const userData = app.getPath("userData");
const savesDir = join(userData, "Saves");
const backupsDir = join(savesDir, "Backups");
/** The single save file used by 0.1; it becomes slot 1. */
const legacySave = join(savesDir, "game.json");
const BACKUPS_KEPT = 5;
/** A new backup at most this often while playing (and always when the area changes). */
const BACKUP_EVERY_MS = 3 * 60_000;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(start);
}

function start(): void {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  registerIpc();
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#000000",
    title: "Rumble Row",
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      // The title music starts right away instead of waiting for a key press.
      autoplayPolicy: "no-user-gesture-required",
      additionalArguments: smokeScreenshot ? [`--smoke-scene=${smokeScene}`] : [],
    },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(trustedPagePrefix)) event.preventDefault();
  });
  // Smoke tests run silently.
  if (smokeScreenshot) window.webContents.setAudioMuted(true);
  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(rendererFile);

  // Closing the window: let the game save first (at most a couple of seconds).
  let allowClose = false;
  window.on("close", (event) => {
    if (allowClose || smokeScreenshot) return;
    event.preventDefault();
    const finish = () => {
      if (allowClose) return;
      allowClose = true;
      window.close();
    };
    ipcMain.once(IPC.closeReady, finish);
    setTimeout(finish, 2500);
    window.webContents.send(IPC.closing);
  });

  if (smokeScreenshot) {
    const timer = setTimeout(() => {
      console.error("Smoke test timed out.");
      app.exit(2);
    }, 30_000);
    ipcMain.once(IPC.rendererReady, async (_event: IpcMainEvent, report: SmokeReport) => {
      clearTimeout(timer);
      const image = await window.webContents.capturePage();
      await writeFile(smokeScreenshot, image.toPNG());
      await writeFile(`${smokeScreenshot}.json`, JSON.stringify(report));
      app.exit(report.ok ? 0 : 1);
    });
  }
}

function assertTrusted(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!url.startsWith(trustedPagePrefix)) throw new Error("Untrusted sender.");
}

function slotNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= SAVE_SLOTS) {
    throw new Error("Bad save slot.");
  }
  return value;
}

const slotFile = (slot: number) => join(savesDir, `slot${slot + 1}.json`);
const slotBackups = (slot: number) => join(backupsDir, `slot${slot + 1}`);

interface SaveFile {
  title: string;
  savedAt: string;
  data: string;
}

/** A save file that parses and holds a game. */
function parseSave(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile;
    if (typeof file.data !== "string") return null;
    const game = JSON.parse(file.data) as { version?: unknown; player?: unknown };
    if (typeof game.version !== "number" || !game.player) return null;
    return file;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 0.1 kept one save in Saves/game.json; move it into slot 1 the first time. */
async function migrateLegacySave(): Promise<void> {
  if (!(await exists(legacySave)) || (await exists(slotFile(0)))) return;
  try {
    const data = await readFile(legacySave, "utf8");
    const when = (await stat(legacySave)).mtime.toISOString();
    const file: SaveFile = { title: "Saved game (from 0.1)", savedAt: when, data };
    await writeFile(slotFile(0), JSON.stringify(file));
    await rename(legacySave, `${legacySave}.old`);
  } catch {
    // Leave the old file alone if anything goes wrong.
  }
}

async function newestBackups(slot: number): Promise<string[]> {
  try {
    const names = (await readdir(slotBackups(slot))).filter((n) => n.endsWith(".json"));
    return names
      .sort()
      .reverse()
      .map((n) => join(slotBackups(slot), n));
  } catch {
    return [];
  }
}

async function readSlot(slot: number): Promise<SlotData | null> {
  try {
    const file = parseSave(await readFile(slotFile(slot), "utf8"));
    if (file) return { data: file.data, recovered: false };
  } catch {
    // Missing or unreadable: fall through to the backups.
  }
  for (const path of await newestBackups(slot)) {
    try {
      const file = parseSave(await readFile(path, "utf8"));
      if (file) return { data: file.data, recovered: true };
    } catch {
      // Try the next one.
    }
  }
  return null;
}

async function writeSlot(slot: number, title: string, data: string): Promise<void> {
  await mkdir(savesDir, { recursive: true });
  const target = slotFile(slot);
  // Keep a backup of the previous save now and then.
  if (parseSave(await readFile(target, "utf8").catch(() => ""))) {
    const backups = await newestBackups(slot);
    const lastTime = backups[0] ? (await stat(backups[0])).mtimeMs : 0;
    const oldTitle = (parseSave(await readFile(target, "utf8")) as SaveFile).title;
    if (Date.now() - lastTime > BACKUP_EVERY_MS || oldTitle !== title) {
      await mkdir(slotBackups(slot), { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(target, join(slotBackups(slot), `${stamp}.json`));
      for (const old of (await newestBackups(slot)).slice(BACKUPS_KEPT))
        await rm(old, { force: true });
    }
  }
  const file: SaveFile = { title: title.slice(0, 100), savedAt: new Date().toISOString(), data };
  // Write to a temporary file first so a crash mid-write never leaves a broken save.
  await writeFile(`${target}.tmp`, JSON.stringify(file));
  await rename(`${target}.tmp`, target);
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (event) => {
    assertTrusted(event);
    return { version: app.getVersion(), platform: process.platform, arch: process.arch };
  });
  ipcMain.handle(IPC.listSlots, async (event): Promise<SlotInfo[]> => {
    assertTrusted(event);
    await migrateLegacySave();
    const slots: SlotInfo[] = [];
    for (let slot = 0; slot < SAVE_SLOTS; slot++) {
      const raw = await readFile(slotFile(slot), "utf8").catch(() => null);
      const backups = await newestBackups(slot);
      if (raw === null && backups.length === 0) continue;
      const file = raw === null ? null : parseSave(raw);
      if (file) slots.push({ slot, title: file.title, savedAt: file.savedAt });
      else if ((await readSlot(slot)) !== null)
        slots.push({
          slot,
          title: "Damaged save - a backup can be loaded",
          savedAt: "",
          damaged: true,
        });
    }
    return slots;
  });
  ipcMain.handle(IPC.readSlot, (event, slot: unknown) => {
    assertTrusted(event);
    return readSlot(slotNumber(slot));
  });
  ipcMain.handle(IPC.writeSlot, async (event, slot: unknown, title: unknown, data: unknown) => {
    assertTrusted(event);
    if (typeof title !== "string" || typeof data !== "string") throw new Error("Bad save.");
    await writeSlot(slotNumber(slot), title, data);
  });
  ipcMain.handle(IPC.deleteSlot, async (event, slot: unknown) => {
    assertTrusted(event);
    const n = slotNumber(slot);
    await rm(slotFile(n), { force: true });
    await rm(slotBackups(n), { recursive: true, force: true });
  });
  ipcMain.handle(IPC.readData, async (event, name: unknown) => {
    assertTrusted(event);
    if (!DATA_FILES.includes(name as never)) throw new Error("Bad data file.");
    return readFile(join(userData, `${name}.json`), "utf8").catch(() => null);
  });
  ipcMain.handle(IPC.writeData, async (event, name: unknown, text: unknown) => {
    assertTrusted(event);
    if (!DATA_FILES.includes(name as never) || typeof text !== "string")
      throw new Error("Bad data file.");
    const target = join(userData, `${name}.json`);
    await mkdir(userData, { recursive: true });
    await writeFile(`${target}.tmp`, text);
    await rename(`${target}.tmp`, target);
  });
  ipcMain.handle(IPC.copyText, (event, text: unknown) => {
    assertTrusted(event);
    if (typeof text === "string") clipboard.writeText(text);
  });
  ipcMain.handle(IPC.setFullscreen, (event, on: unknown) => {
    assertTrusted(event);
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(on === true);
  });
  ipcMain.on(IPC.quit, (event) => {
    assertTrusted(event);
    app.quit();
  });
}
