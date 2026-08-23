"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// ---------------------------------------------------------------------------
// Fallback Manager API
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("vrchatAPI", {
  loadAvatars:     ()               => ipcRenderer.invoke("load-avatars"),
  loadAvatarImage: (url, auth)      => ipcRenderer.invoke("load-avatar-image", { url, auth }),
  verifyAuth:      (auth)           => ipcRenderer.invoke("verify-auth", auth),
  getAvatar:       (auth, avatarId) => ipcRenderer.invoke("get-avatar", { auth, avatarId }),
  selectFallback:  (auth, avatarId) => ipcRenderer.invoke("select-fallback", { auth, avatarId })
});

// ---------------------------------------------------------------------------
// OSC / Avatar Detector API
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("oscAPI", {
  getSnapshot:   ()                          => ipcRenderer.invoke("osc:get-snapshot"),
  detectAvatar:  ()                          => ipcRenderer.invoke("osc:detect-avatar"),
  // value + type both passed — main process overrides type from schema anyway
  sendParameter: (paramName, value, type)    => ipcRenderer.invoke("osc:send-parameter", { paramName, value, type }),

  // Push events from main → renderer
  onAvatarChanged: (cb) => ipcRenderer.on("osc:avatar-changed", (_e, data) => cb(data)),
  onParamUpdate:   (cb) => ipcRenderer.on("osc:param-update",   (_e, data) => cb(data)),

  offAvatarChanged: (cb) => ipcRenderer.removeListener("osc:avatar-changed", cb),
  offParamUpdate:   (cb) => ipcRenderer.removeListener("osc:param-update",   cb)
});

// ---------------------------------------------------------------------------
// Preset Manager API
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("presetAPI", {
  list:    (avatarId)                         => ipcRenderer.invoke("preset:list",   { avatarId }),
  save:    (avatarId, presetName, parameters) => ipcRenderer.invoke("preset:save",   { avatarId, presetName, parameters }),
  load:    (avatarId, presetName)             => ipcRenderer.invoke("preset:load",   { avatarId, presetName }),
  rename:  (avatarId, oldName, newName)       => ipcRenderer.invoke("preset:rename", { avatarId, oldName, newName }),
  delete:  (avatarId, presetName)             => ipcRenderer.invoke("preset:delete", { avatarId, presetName }),
  export:  (avatarId, presetName)             => ipcRenderer.invoke("preset:export", { avatarId, presetName }),
  import:  (avatarId)                         => ipcRenderer.invoke("preset:import", { avatarId })
});

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("settingsAPI", {
  get:            ()       => ipcRenderer.invoke("settings:get"),
  save:           (s)      => ipcRenderer.invoke("settings:save", s),
  getPresetPath:  ()       => ipcRenderer.invoke("settings:preset-path"),
  openPresetFolder: ()     => ipcRenderer.invoke("settings:open-preset-folder"),
  openExternal:   (url)    => ipcRenderer.invoke("settings:open-external", url)
});