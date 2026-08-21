const { app, BrowserWindow, ipcMain, session, Menu, shell } = require("electron"); // Добавени Menu и shell
const path = require("path");
const fs = require("fs");

const API_BASE = "https://api.vrchat.cloud/api/1";
const AVATARS_FILE = path.join(__dirname, "..", "avatars", "avatars.json");

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#111318",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));

  // СЪЗДАВАНЕ НА МЕНЮТО ЗА ПРИЛОЖЕНИЕТО
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit", label: "Exit" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "GitHub Repository",
          click: async () => {
            // Open github rep
            await shell.openExternal("https://github.com");
          }
        },
        {
          label: "About Creator",
          click: async () => {
            // Opens github profile
            await shell.openExternal("https://github.com/Saesei");
          }
        },
        { type: "separator" },
        {
          label: "Version 0.3.0",
          enabled: false // Text is only active for info
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function headers(auth) {
  return {
    "Cookie": `auth=${auth}`,
    "User-Agent": "VRChatFallbackManager/0.3.0",
    "Accept": "application/json"
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, text, body };
}

function imageMime(buffer, contentType) {
  if (contentType && contentType.startsWith("image/")) return contentType.split(";")[0];
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF87a") return "image/gif";
  return "image/png";
}

async function fetchImage(url, auth) {
  const h = {
    "User-Agent": "VRChatFallbackManager/0.3.0",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
  };
  if (auth) h["Cookie"] = `auth=${auth}`;

  const response = await fetch(url, { headers: h });
  if (!response.ok) throw new Error(`Image request failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("VRChat returned an empty image.");
  const mime = imageMime(buffer, response.headers.get("content-type"));
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

ipcMain.handle("load-avatars", async () => {
  return JSON.parse(fs.readFileSync(AVATARS_FILE, "utf8"));
});

ipcMain.handle("load-avatar-image", async (_event, { url, auth }) => {
  try {
    return { ok: true, dataUrl: await fetchImage(url, auth || "") };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("verify-auth", async (_event, auth) => {
  if (!auth) return { ok: false, error: "Please enter your VRChat auth cookie." };

  try {
    const { response, body } = await request(`${API_BASE}/auth/user`, {
      headers: headers(auth)
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.status === 401
          ? "Authentication failed. Check your auth cookie."
          : `VRChat returned HTTP ${response.status}.`
      };
    }

    return {
      ok: true,
      username: body?.displayName || body?.username || "VRChat user",
      fallbackAvatar: body?.fallbackAvatar || null
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-avatar", async (_event, { auth, avatarId }) => {
  try {
    const { response, body } = await request(
      `${API_BASE}/avatars/${encodeURIComponent(avatarId)}`,
      { headers: headers(auth) }
    );

    if (!response.ok) {
      return { ok: false, status: response.status, error: `VRChat returned HTTP ${response.status}.` };
    }

    return {
      ok: true,
      avatar: {
        id: body?.id || avatarId,
        name: body?.name || "",
        authorName: body?.authorName || "",
        imageUrl: body?.imageUrl || body?.thumbnailImageUrl || body?.imageUrl || ""
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("select-fallback", async (_event, { auth, avatarId }) => {
  if (!auth) return { ok: false, error: "Please enter your VRChat auth cookie." };
  if (!/^avtr_[0-9a-f-]{36}$/i.test(avatarId || "")) {
    return { ok: false, error: "That does not look like a valid VRChat avatar ID." };
  }

  try {
    const { response, body, text } = await request(
      `${API_BASE}/avatars/${encodeURIComponent(avatarId)}/selectFallback`,
      { method: "PUT", headers: headers(auth) }
    );

    if (!response.ok) {
      let error = `VRChat returned HTTP ${response.status}.`;
      if (response.status === 401) error = "Authentication failed. Check your auth cookie.";
      if (response.status === 403) error = "VRChat rejected this avatar as a fallback. It may not be eligible.";
      if (response.status === 404) error = "Avatar not found.";
      return { ok: false, status: response.status, error, raw: text };
    }

    return {
      ok: true,
      fallbackAvatar: body?.fallbackAvatar || avatarId
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
