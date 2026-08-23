"use strict";

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const AVATAR_ID_RE = /avtr_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getLocalLow() {
  const localAppData = process.env.LOCALAPPDATA
    || path.join(os.homedir(), "AppData", "Local");
  return path.join(path.dirname(localAppData), "LocalLow");
}

function getVRChatLogDir()  { return path.join(getLocalLow(), "VRChat", "VRChat"); }
function getVRChatOSCDir()  { return path.join(getLocalLow(), "VRChat", "VRChat", "OSC"); }

// ---------------------------------------------------------------------------
// Log scan
// ---------------------------------------------------------------------------

function detectAvatarFromLog() {
  try {
    const logDir = getVRChatLogDir();
    if (!fs.existsSync(logDir)) return null;

    const logs = fs.readdirSync(logDir)
      .filter(f => f.startsWith("output_log_") && f.endsWith(".txt"))
      .map(f => ({ file: path.join(logDir, f), mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3);

    for (const { file } of logs) {
      try {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].includes("avtr_")) {
            const m = AVATAR_ID_RE.exec(lines[i]);
            if (m) return m[0];
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("[AvatarDetector] Log scan error:", err.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// OSC JSON config helpers
// ---------------------------------------------------------------------------

function findAvatarConfigFile(avatarId) {
  try {
    const oscDir = getVRChatOSCDir();
    if (!fs.existsSync(oscDir)) return null;
    for (const userDir of fs.readdirSync(oscDir)) {
      const f = path.join(oscDir, userDir, "Avatars", `${avatarId}.json`);
      if (fs.existsSync(f)) return f;
    }
  } catch {}
  return null;
}

function resolveAvatarName(avatarId) {
  if (!avatarId || avatarId === "Unknown") return "No Avatar Detected";
  try {
    const f = findAvatarConfigFile(avatarId);
    if (f) {
      const data = JSON.parse(
  fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
      return data.name || avatarId;
    }
  } catch {}
  return avatarId;
}

// Load parameter schema from VRChat OSC config.
// Returns Map<name, "bool"|"int"|"float"> — the authoritative type for each param.
function loadParameterSchema(avatarId) {
  const schema = new Map();
  if (!avatarId || avatarId === "Unknown") return schema;

  try {
    const f = findAvatarConfigFile(avatarId);
    if (!f) return schema;

    const data = JSON.parse(
      fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")
    );

    if (!Array.isArray(data.parameters)) return schema;

    for (const p of data.parameters) {
      if (!p.name) continue;

      const rawType = (
        p.input?.type ||
        p.output?.type ||
        "Float"
      ).toLowerCase();

      const type =
        rawType === "bool" ? "bool" :
        rawType === "int" ? "int" :
        "float";

      schema.set(p.name, type);
    }
  } catch (err) {
    console.error("[AvatarDetector] Schema load error:", err.message);
  }

  return schema;
}

// ---------------------------------------------------------------------------
// AvatarDetector
// ---------------------------------------------------------------------------

class AvatarDetector {
  constructor() {
    this.currentAvatarId   = "Unknown";
    this.currentAvatarName = "No Avatar Detected";
    // parameters: Map<name, { value, type: "bool"|"int"|"float" }>
    this._params    = new Map();
    // schema: Map<name, type> from OSC JSON — authoritative types
    this._schema    = new Map();
    this._callbacks = [];
  }

  onAvatarChanged(cb) { this._callbacks.push(cb); }

  checkInitialAvatar() {
    const id = detectAvatarFromLog();
    if (id) {
      console.log(`[AvatarDetector] Initial avatar from log: ${id}`);
      this.currentAvatarId = "__reset__";
      this.setAvatar(id);
    } else {
      console.log("[AvatarDetector] No avatar found in recent logs.");
    }
  }

  setAvatar(avatarId) {
    if (this.currentAvatarId === avatarId) return;
    this.currentAvatarId   = avatarId;
    this.currentAvatarName = resolveAvatarName(avatarId);
    this._schema = loadParameterSchema(avatarId);
    this._params = new Map();

    // Pre-populate with schema params, value = null (not yet received)
    for (const [name, type] of this._schema) {
      this._params.set(name, { value: null, type });
    }

    console.log(
      `[AvatarDetector] Avatar -> ${avatarId} (${this.currentAvatarName}),`,
      `${this._schema.size} params from schema`
    );

    for (const cb of this._callbacks) {
      try { cb(this.currentAvatarId, this.currentAvatarName); } catch {}
    }
  }

  // Called from OSCManager — type is the raw OSC type ("bool","int","float")
  updateParameter(paramName, value, oscType) {
    // Prefer schema type, fall back to received OSC type
    const type = this._schema.get(paramName) || oscType || (
      typeof value === "boolean" ? "bool"
      : Number.isInteger(value) ? "int"
      : "float"
    );
    this._params.set(paramName, { value, type });
  }

  // Returns plain object suitable for IPC transfer
  getParameters() {
    const out = {};
    for (const [name, { value, type }] of this._params) {
      out[name] = { value, type };
    }
    return out;
  }

  // Returns the schema type for a given parameter name (for sending presets)
  getParamType(paramName) {
    if (this._schema.has(paramName)) return this._schema.get(paramName);
    const entry = this._params.get(paramName);
    return entry ? entry.type : null;
  }

  getSnapshot() {
    return {
      avatarId:   this.currentAvatarId,
      avatarName: this.currentAvatarName,
      parameters: this.getParameters()
    };
  }
}

module.exports = AvatarDetector;