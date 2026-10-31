import { contextBridge, ipcRenderer } from "electron";
import { IPC, type RumbleBridge } from "../shared/bridge";

const smokeArg = process.argv.find((arg) => arg.startsWith("--smoke-scene="));

const bridge: RumbleBridge = {
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listSlots: () => ipcRenderer.invoke(IPC.listSlots),
  readSlot: (slot) => ipcRenderer.invoke(IPC.readSlot, slot),
  writeSlot: (slot, title, data) => ipcRenderer.invoke(IPC.writeSlot, slot, title, data),
  deleteSlot: (slot) => ipcRenderer.invoke(IPC.deleteSlot, slot),
  readData: (name) => ipcRenderer.invoke(IPC.readData, name),
  writeData: (name, text) => ipcRenderer.invoke(IPC.writeData, name, text),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  setFullscreen: (on) => ipcRenderer.invoke(IPC.setFullscreen, on),
  quit: () => ipcRenderer.send(IPC.quit),
  onClosing: (handler) => {
    ipcRenderer.on(IPC.closing, async () => {
      try {
        await handler();
      } finally {
        ipcRenderer.send(IPC.closeReady);
      }
    });
  },
  signalReady: (report) => ipcRenderer.send(IPC.rendererReady, report),
  smokeScene: smokeArg ? smokeArg.slice("--smoke-scene=".length) : null,
};

contextBridge.exposeInMainWorld("rumblerow", bridge);
