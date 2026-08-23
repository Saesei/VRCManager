"use strict";

const fs   = require("fs");
const path = require("path");

class PresetManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  _safeId(avatarId) {
    return (avatarId || "unknown_avatar").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  _avatarDir(avatarId) {
    const dir = path.join(this.baseDir, this._safeId(avatarId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  _presetPath(avatarId, presetName) {
    return path.join(this._avatarDir(avatarId), `${presetName.trim()}.json`);
  }

  list(avatarId) {
    try {
      return fs.readdirSync(this._avatarDir(avatarId))
        .filter(f => f.endsWith(".json"))
        .map(f => path.basename(f, ".json"))
        .sort((a, b) => a.localeCompare(b));
    } catch { return []; }
  }

  // parameters: { paramName: { value, type } }  (new format)
  //          OR { paramName: value }              (old Python format — we normalise on save)
  save(avatarId, presetName, parameters) {
    // Normalise: ensure each entry has { value, type }
    const normalised = {};
    for (const [name, entry] of Object.entries(parameters)) {
      if (entry !== null && typeof entry === "object" && "value" in entry && "type" in entry) {
        normalised[name] = entry;
      } else {
        // Old format — infer type from JS value
        const value = entry;
        let type;
        if (typeof value === "boolean")       type = "bool";
        else if (Number.isInteger(value))     type = "int";   // will be fixed on apply via schema
        else if (typeof value === "number")   type = "float";
        else                                  type = "string";
        normalised[name] = { value, type };
      }
    }

    const data = {
      avatarId,
      presetName: presetName.trim(),
      savedAt: new Date().toISOString(),
      parameters: normalised
    };
    fs.writeFileSync(this._presetPath(avatarId, presetName), JSON.stringify(data, null, 2), "utf8");
    return { ok: true };
  }

  load(avatarId, presetName) {
    const filepath = this._presetPath(avatarId, presetName);
    if (!fs.existsSync(filepath)) return { ok: false, error: "Preset not found." };
    try {
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
      const raw  = data.parameters || {};

      // Normalise old Python format on load too
      const parameters = {};
      for (const [name, entry] of Object.entries(raw)) {
        if (entry !== null && typeof entry === "object" && "value" in entry && "type" in entry) {
          parameters[name] = entry;
        } else {
          // Old Python preset — bare value
          const value = entry;
          let type;
          if (typeof value === "boolean")     type = "bool";
          else if (typeof value === "number")  type = "float"; // treat all numbers as float (Python floats)
          else                                type = "string";
          parameters[name] = { value, type };
        }
      }

      return { ok: true, parameters };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  rename(avatarId, oldName, newName) {
    const oldPath = this._presetPath(avatarId, oldName);
    const newPath = this._presetPath(avatarId, newName);
    if (!fs.existsSync(oldPath)) return { ok: false, error: "Preset not found." };
    if (fs.existsSync(newPath))  return { ok: false, error: "A preset with that name already exists." };
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  }

  delete(avatarId, presetName) {
    const filepath = this._presetPath(avatarId, presetName);
    if (!fs.existsSync(filepath)) return { ok: false, error: "Preset not found." };
    fs.unlinkSync(filepath);
    return { ok: true };
  }

  export(avatarId, presetName, targetPath) {
    const filepath = this._presetPath(avatarId, presetName);
    if (!fs.existsSync(filepath)) return { ok: false, error: "Preset not found." };
    fs.copyFileSync(filepath, targetPath);
    return { ok: true };
  }

  import(avatarId, sourcePath) {
    if (!fs.existsSync(sourcePath)) return { ok: false, error: "Source file not found." };
    try {
      const data       = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      const presetName = data.presetName || path.basename(sourcePath, ".json");
      // Use save() so normalisation runs
      const result     = this.save(avatarId, presetName, data.parameters || {});
      return { ...result, presetName };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = PresetManager;