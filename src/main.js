"use strict";

const { app, BrowserWindow, ipcMain, session, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs   = require("fs");

const OSCManager     = require("./osc-manager");
const AvatarDetector = require("./avatar-detector");
const PresetManager  = require("./preset-manager");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE    = "https://api.vrchat.cloud/api/1";
const AVATARS_FILE = path.join(__dirname, "..", "avatars", "avatars.json");

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const oscManager = new OSCManager({
  vrcIp: "127.0.0.1", vrcSendPort: 9000, listenPort: 9001
});

const avatarDetector = new AvatarDetector();

const presetManager = new PresetManager(
  path.join(app.getPath("userData"), "outfits")
);

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 880, minHeight: 600,
    backgroundColor: "#111318",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [{ role: "quit", label: "Exit" }] },
    { label: "Help", submenu: [
        { label: "GitHub", click: () => shell.openExternal("https://github.com/Saesei") },
        { type: "separator" },
        { label: "Version 0.3.0", enabled: false }
    ]}
  ]));
}

// ---------------------------------------------------------------------------
// OSC + push to renderer
// ---------------------------------------------------------------------------

function startOSC() {
  oscManager.start({
    onAvatarChange: (avatarId) => {
      avatarDetector.setAvatar(avatarId);
    },
    onParamChange: (paramName, value, oscType) => {
      avatarDetector.updateParameter(paramName, value, oscType);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("osc:param-update", { paramName, value, type: oscType });
      }
    }
  });
}

avatarDetector.onAvatarChanged((avatarId, avatarName) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("osc:avatar-changed", {
      avatarId,
      avatarName,
      params: avatarDetector.getParameters()
    });
  }
});

// ---------------------------------------------------------------------------
// VRChat API helpers
// ---------------------------------------------------------------------------

function headers(auth) {
  return {
    "Cookie": `auth=${auth}`,
    "User-Agent": "VRChatFallbackManager/0.3.0",
    "Accept": "application/json"
  };
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, text, body };
}

function imageMime(buffer, contentType) {
  if (contentType && contentType.startsWith("image/")) return contentType.split(";")[0];
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  return "image/png";
}

async function fetchImage(url, auth) {
  const h = { "User-Agent": "VRChatFallbackManager/0.3.0", "Accept": "image/*,*/*;q=0.8" };
  if (auth) h["Cookie"] = `auth=${auth}`;
  const response = await fetch(url, { headers: h });
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Empty image response.");
  return `data:${imageMime(buffer, response.headers.get("content-type"))};base64,${buffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// IPC — Fallback Manager
// ---------------------------------------------------------------------------

ipcMain.handle("load-avatars", async () =>
  JSON.parse(fs.readFileSync(AVATARS_FILE, "utf8"))
);

ipcMain.handle("load-avatar-image", async (_e, { url, auth }) => {
  try { return { ok: true, dataUrl: await fetchImage(url, auth || "") }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("verify-auth", async (_e, auth) => {
  if (!auth) return { ok: false, error: "Please enter your VRChat auth cookie." };
  try {
    const { response, body } = await apiRequest(`${API_BASE}/auth/user`, { headers: headers(auth) });
    if (!response.ok) return { ok: false, error:
      response.status === 401 ? "Authentication failed. Check your auth cookie."
      : `VRChat returned HTTP ${response.status}.` };
    return { ok: true,
      username:       body?.displayName || body?.username || "VRChat user",
      fallbackAvatar: body?.fallbackAvatar || null
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("get-avatar", async (_e, { auth, avatarId }) => {
  // auth may be empty — VRChat still returns public avatar info
  try {
    const reqHeaders = auth ? headers(auth) : { "User-Agent": "VRChatFallbackManager/0.3.0", "Accept": "application/json" };
    const { response, body } = await apiRequest(
      `${API_BASE}/avatars/${encodeURIComponent(avatarId)}`, { headers: reqHeaders }
    );
    if (!response.ok) return { ok: false, error: `VRChat returned HTTP ${response.status}.` };
    return { ok: true, avatar: {
      id:         body?.id         || avatarId,
      name:       body?.name       || "",
      authorName: body?.authorName || "",
      imageUrl:   body?.imageUrl   || body?.thumbnailImageUrl || ""
    }};
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle("select-fallback", async (_e, { auth, avatarId }) => {
  if (!auth) return { ok: false, error: "Please enter your VRChat auth cookie." };
  if (!/^avtr_[0-9a-f-]{36}$/i.test(avatarId || ""))
    return { ok: false, error: "That does not look like a valid VRChat avatar ID." };
  try {
    const { response, body, text } = await apiRequest(
      `${API_BASE}/avatars/${encodeURIComponent(avatarId)}/selectFallback`,
      { method: "PUT", headers: headers(auth) }
    );
    if (!response.ok) {
      const error =
        response.status === 401 ? "Authentication failed. Check your auth cookie."
        : response.status === 403 ? "VRChat rejected this avatar as a fallback. It may not be eligible."
        : response.status === 404 ? "Avatar not found."
        : `VRChat returned HTTP ${response.status}.`;
      return { ok: false, error, raw: text };
    }
    return { ok: true, fallbackAvatar: body?.fallbackAvatar || avatarId };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---------------------------------------------------------------------------
// IPC — OSC / Avatar Detector
// ---------------------------------------------------------------------------

ipcMain.handle("osc:get-snapshot", () => avatarDetector.getSnapshot());

ipcMain.handle("osc:detect-avatar", () => {
  avatarDetector.checkInitialAvatar();
  return { ok: true };
});

// Send a parameter — caller provides { paramName, value, type }
// type from schema overrides what the caller says, ensuring correct OSC encoding
ipcMain.handle("osc:send-parameter", (_e, { paramName, value, type }) => {
  // Always use schema type if available — prevents old-preset int/float confusion
  const schemaType = avatarDetector.getParamType(paramName);
  oscManager.sendParameter(paramName, value, schemaType || type || null);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC — Preset Manager
// ---------------------------------------------------------------------------

ipcMain.handle("preset:list",   (_e, { avatarId })                           => presetManager.list(avatarId));
ipcMain.handle("preset:save",   (_e, { avatarId, presetName, parameters })   => presetManager.save(avatarId, presetName, parameters));
ipcMain.handle("preset:load",   (_e, { avatarId, presetName })               => presetManager.load(avatarId, presetName));
ipcMain.handle("preset:rename", (_e, { avatarId, oldName, newName })         => presetManager.rename(avatarId, oldName, newName));
ipcMain.handle("preset:delete", (_e, { avatarId, presetName })               => presetManager.delete(avatarId, presetName));

ipcMain.handle("preset:export", async (_e, { avatarId, presetName }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${presetName}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (r.canceled || !r.filePath) return { ok: false, error: "Cancelled." };
  return presetManager.export(avatarId, presetName, r.filePath);
});

ipcMain.handle("preset:import", async (_e, { avatarId }) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, error: "Cancelled." };
  return presetManager.import(avatarId, r.filePaths[0]);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  createWindow();
  startOSC();
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => avatarDetector.checkInitialAvatar(), 500);
  });
});

app.on("window-all-closed", () => {
  oscManager.stop();
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------------------
// IPC — Settings
// ---------------------------------------------------------------------------

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE))
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {}
  return { listenPort: 9001, sendPort: 9000 };
}

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:save", (_e, settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("settings:preset-path", () =>
  path.join(app.getPath("userData"), "outfits")
);

ipcMain.handle("settings:open-preset-folder", () => {
  const folder = path.join(app.getPath("userData"), "outfits");
  fs.mkdirSync(folder, { recursive: true });
  shell.openPath(folder);
  return { ok: true };
});

ipcMain.handle("settings:open-external", (_e, url) => {
  shell.openExternal(url);
  return { ok: true };
});