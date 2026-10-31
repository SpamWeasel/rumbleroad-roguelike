import { contextBridge, ipcRenderer } from "electron";
import { IPC, type RumbleBridge } from "../shared/bridge";

const bridge: RumbleBridge = {
  readSave: () => ipcRenderer.invoke(IPC.readSave),
  writeSave: (data) => ipcRenderer.invoke(IPC.writeSave, data),
  deleteSave: () => ipcRenderer.invoke(IPC.deleteSave),
  toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
  quit: () => ipcRenderer.send(IPC.quit),
};

contextBridge.exposeInMainWorld("rumblerow", bridge);
