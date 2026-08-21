const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vrchatAPI", {
  loadAvatars: () => ipcRenderer.invoke("load-avatars"),
  loadAvatarImage: (url, auth) => ipcRenderer.invoke("load-avatar-image", { url, auth }),
  verifyAuth: (auth) => ipcRenderer.invoke("verify-auth", auth),
  getAvatar: (auth, avatarId) => ipcRenderer.invoke("get-avatar", { auth, avatarId }),
  selectFallback: (auth, avatarId) => ipcRenderer.invoke("select-fallback", { auth, avatarId })
});