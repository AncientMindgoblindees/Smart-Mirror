const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__SMART_MIRROR_ELECTRON__", true);

contextBridge.exposeInMainWorld("smartMirrorCamera", {
  getStatus: async () => ipcRenderer.invoke("smartMirrorCamera:getStatus"),
  startPreview: async () => ipcRenderer.invoke("smartMirrorCamera:startPreview"),
  stopPreview: async () => ipcRenderer.invoke("smartMirrorCamera:stopPreview"),
  capturePhoto: async (opts) => ipcRenderer.invoke("smartMirrorCamera:capturePhoto", opts),
  getPreviewFrame: async () => ipcRenderer.invoke("smartMirrorCamera:getPreviewFrame"),
  getPreviewStreamUrl: async () => ipcRenderer.invoke("smartMirrorCamera:getPreviewStreamUrl"),
});
