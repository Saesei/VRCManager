"use strict";

// ============================================================
// SIDEBAR NAVIGATION
// ============================================================

document.querySelectorAll(".sidebar-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.page;
    if (!target) return;
    document.querySelectorAll(".sidebar-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(target).classList.add("active");
  });
});

// ============================================================
// INLINE DIALOG
// ============================================================

const dialogOverlay = document.getElementById("dialogOverlay");
const dialogTitle   = document.getElementById("dialogTitle");
const dialogInput   = document.getElementById("dialogInput");
const dialogConfirm = document.getElementById("dialogConfirm");
const dialogCancel  = document.getElementById("dialogCancel");
let _dialogResolve  = null;

function showDialog(title, placeholder = "", defaultValue = "") {
  return new Promise(resolve => {
    _dialogResolve = resolve;
    dialogTitle.textContent     = title;
    dialogInput.placeholder     = placeholder;
    dialogInput.value           = defaultValue;
    dialogOverlay.classList.add("visible");
    setTimeout(() => dialogInput.focus(), 30);
  });
}

function closeDialog(value) {
  dialogOverlay.classList.remove("visible");
  if (_dialogResolve) { _dialogResolve(value); _dialogResolve = null; }
}

dialogConfirm.addEventListener("click", () => closeDialog(dialogInput.value.trim()));
dialogCancel .addEventListener("click", () => closeDialog(null));
dialogInput  .addEventListener("keydown", e => {
  if (e.key === "Enter")  closeDialog(dialogInput.value.trim());
  if (e.key === "Escape") closeDialog(null);
});

// ============================================================
// PRESET MANAGER STATE
// ============================================================

let currentAvatarId   = "Unknown";
let selectedPreset    = null;

// parameters: { name -> { value, type } }  — live from OSC
let liveParams  = {};
// rowEls: { name -> { row, valEl, typeEl } }
let rowEls      = {};

// ============================================================
// AVATAR BAR
// ============================================================

const pmAvatarName    = document.getElementById("pmAvatarName");
const pmAvatarId      = document.getElementById("pmAvatarId");
const btnDetectAvatar = document.getElementById("btnDetectAvatar");

function setAvatarBar(avatarId, avatarName) {
  currentAvatarId = avatarId || "Unknown";
  pmAvatarName.textContent = avatarName && avatarName !== "Unknown" ? avatarName : "No Avatar Detected";
  pmAvatarId.textContent   = avatarId  && avatarId  !== "Unknown" ? avatarId   : "—";
}

btnDetectAvatar.addEventListener("click", async () => {
  btnDetectAvatar.disabled = true;
  await window.oscAPI.detectAvatar();
  setTimeout(() => { btnDetectAvatar.disabled = false; }, 2000);
});

// ============================================================
// PRESET LIST
// ============================================================

const presetSearch = document.getElementById("presetSearch");
const presetList   = document.getElementById("presetList");

async function refreshPresetList() {
  const filter  = presetSearch.value.toLowerCase().trim();
  let presets   = await window.presetAPI.list(currentAvatarId);
  if (filter) presets = presets.filter(p => p.toLowerCase().includes(filter));

  presetList.innerHTML = "";

  if (!presets.length) {
    presetList.innerHTML = `<div class="pm-empty">${
      filter ? "No presets match your search." : "No presets saved yet.<br>Interact with your avatar<br>in VRChat, then save."
    }</div>`;
    // Only clear selection if the selected preset is gone
    if (selectedPreset && !presets.includes(selectedPreset)) selectedPreset = null;
    return;
  }

  for (const name of presets) {
    const el       = document.createElement("div");
    el.className   = "preset-item" + (name === selectedPreset ? " active" : "");
    el.textContent = name;
    el.addEventListener("click", () => {
      selectedPreset = name;
      presetList.querySelectorAll(".preset-item").forEach(i =>
        i.classList.toggle("active", i.textContent === name)
      );
    });
    presetList.appendChild(el);
  }
}

presetSearch.addEventListener("input", refreshPresetList);

// ============================================================
// PARAMETER PANEL
// ============================================================

const paramSearch = document.getElementById("paramSearch");
const paramList   = document.getElementById("paramList");
const paramEmpty  = document.getElementById("paramEmpty");

function formatValue(entry) {
  if (!entry || entry.value === null || entry.value === undefined) return "—";
  const { value, type } = entry;
  if (type === "bool")  return value ? "true" : "false";
  if (type === "int")   return String(Math.round(value));
  if (type === "float") {
    // Show up to 3 decimal places, strip trailing zeros
    return (typeof value === "number") ? parseFloat(value.toFixed(3)).toString() : String(value);
  }
  return String(value);
}

function valueClass(entry) {
  if (!entry || entry.value === null) return "param-value null-val";
  if (entry.type === "bool") return entry.value ? "param-value bool-true" : "param-value bool-false";
  return "param-value";
}

function rebuildParamList() {
  // Full rebuild — called on avatar change
  paramList.innerHTML = "";
  paramList.appendChild(paramEmpty);
  rowEls = {};
  renderParams();
}

function renderParams() {
  const filter = paramSearch.value.toLowerCase().trim();
  const names  = Object.keys(liveParams).sort();

  paramEmpty.style.display = names.length ? "none" : "";

  // Remove rows for params no longer in liveParams
  for (const name of Object.keys(rowEls)) {
    if (!(name in liveParams)) {
      rowEls[name].row.remove();
      delete rowEls[name];
    }
  }

  for (const name of names) {
    const entry   = liveParams[name];
    const visible = !filter || name.toLowerCase().includes(filter);
    const valStr  = formatValue(entry);
    const vClass  = valueClass(entry);
    const typeStr = entry ? (entry.type || "") : "";

    if (!rowEls[name]) {
      // Create row
      const row    = document.createElement("div");
      row.className = "param-row";

      const nameEl = document.createElement("span");
      nameEl.className   = "param-name";
      nameEl.textContent = name;
      nameEl.title       = name;

      const typeEl = document.createElement("span");
      typeEl.className   = "param-type";
      typeEl.textContent = typeStr;

      const valEl = document.createElement("span");
      valEl.className   = vClass;
      valEl.textContent = valStr;

      row.appendChild(nameEl);
      row.appendChild(typeEl);
      row.appendChild(valEl);
      paramList.appendChild(row);

      rowEls[name] = { row, valEl, typeEl };
    } else {
      // Update existing
      const { row, valEl, typeEl } = rowEls[name];
      if (valEl.textContent !== valStr) {
        valEl.textContent = valStr;
        valEl.className   = vClass;
      }
      if (typeEl.textContent !== typeStr) typeEl.textContent = typeStr;
      row.style.display = visible ? "" : "none";
      continue; // display already set below for new rows
    }

    rowEls[name].row.style.display = visible ? "" : "none";
  }
}

paramSearch.addEventListener("input", renderParams);

// 300ms refresh loop — only re-renders values, no DOM create/destroy
setInterval(renderParams, 300);

// ============================================================
// OSC PUSH EVENTS
// ============================================================

window.oscAPI.onAvatarChanged(({ avatarId, avatarName, params }) => {
  setAvatarBar(avatarId, avatarName);
  // params from main: { name: { value, type } }
  liveParams     = params || {};
  selectedPreset = null;
  rebuildParamList();
  refreshPresetList();
});

window.oscAPI.onParamUpdate(({ paramName, value, type }) => {
  // Update or insert — type may be null if entry already in schema
  if (liveParams[paramName]) {
    liveParams[paramName] = { value, type: type || liveParams[paramName].type };
  } else {
    liveParams[paramName] = { value, type: type || "float" };
  }
  // renderParams runs on interval — no need to call here
});

// ============================================================
// PRESET ACTIONS
// ============================================================

document.getElementById("btnSavePreset").addEventListener("click", async () => {
  if (currentAvatarId === "Unknown") {
    return alert("No avatar detected yet.\nLoad an avatar in VRChat first, then use ↻ Re-detect if needed.");
  }

  // Only save params that have a real value (not null/schema-only)
  const toSave = {};
  for (const [name, entry] of Object.entries(liveParams)) {
    if (entry && entry.value !== null && entry.value !== undefined) {
      toSave[name] = { value: entry.value, type: entry.type };
    }
  }

  if (!Object.keys(toSave).length) {
    return alert("No parameter values received yet.\nInteract with your avatar in VRChat to populate parameters.");
  }

  const name = await showDialog("Save Outfit Preset", "Preset name…");
  if (!name) return;

  const r = await window.presetAPI.save(currentAvatarId, name, toSave);
  if (!r.ok) return alert(`Save failed: ${r.error}`);
  selectedPreset = name;
  await refreshPresetList();
});

document.getElementById("btnApplyPreset").addEventListener("click", async () => {
  if (!selectedPreset) return alert("Select a preset first.");

  const r = await window.presetAPI.load(currentAvatarId, selectedPreset);
  if (!r.ok) return alert(`Could not load preset: ${r.error}`);

  // r.parameters: { name: { value, type } }
  // Send each param — main process will override type from schema if available
  for (const [paramName, entry] of Object.entries(r.parameters)) {
    await window.oscAPI.sendParameter(paramName, entry.value, entry.type);
  }
});

document.getElementById("btnRenamePreset").addEventListener("click", async () => {
  if (!selectedPreset) return alert("Select a preset first.");
  const newName = await showDialog("Rename Preset", "New name…", selectedPreset);
  if (!newName || newName === selectedPreset) return;
  const r = await window.presetAPI.rename(currentAvatarId, selectedPreset, newName);
  if (!r.ok) return alert(`Rename failed: ${r.error}`);
  selectedPreset = newName;
  await refreshPresetList();
});

document.getElementById("btnDeletePreset").addEventListener("click", async () => {
  if (!selectedPreset) return alert("Select a preset first.");
  const confirmed = confirm(`Delete preset "${selectedPreset}"?\nThis cannot be undone.`);
  if (!confirmed) return;
  const r = await window.presetAPI.delete(currentAvatarId, selectedPreset);
  if (!r.ok) return alert(`Delete failed: ${r.error}`);
  selectedPreset = null;
  await refreshPresetList();
});

document.getElementById("btnExportPreset").addEventListener("click", async () => {
  if (!selectedPreset) return alert("Select a preset first.");
  const r = await window.presetAPI.export(currentAvatarId, selectedPreset);
  if (r && !r.ok && r.error !== "Cancelled.") alert(`Export failed: ${r.error}`);
});

document.getElementById("btnImportPreset").addEventListener("click", async () => {
  if (currentAvatarId === "Unknown") {
    return alert("No avatar detected yet.\nImport requires a known avatar ID to file presets under.");
  }
  const r = await window.presetAPI.import(currentAvatarId);
  if (!r.ok) {
    if (r.error !== "Cancelled.") alert(`Import failed: ${r.error}`);
    return;
  }
  selectedPreset = r.presetName;
  await refreshPresetList();
});

// ============================================================
// STARTUP — load initial snapshot
// ============================================================

(async () => {
  const snap = await window.oscAPI.getSnapshot();
  setAvatarBar(snap.avatarId, snap.avatarName);
  liveParams = snap.parameters || {};
  rebuildParamList();
  await refreshPresetList();
})();

// ============================================================
// SETTINGS PAGE
// ============================================================

const settingListenPort  = document.getElementById("settingListenPort");
const settingSendPort    = document.getElementById("settingSendPort");
const btnSaveSettings    = document.getElementById("btnSaveSettings");
const settingsStatus     = document.getElementById("settingsStatus");
const presetStoragePath  = document.getElementById("presetStoragePath");
const btnOpenPresetFolder = document.getElementById("btnOpenPresetFolder");

// Load settings into form
(async () => {
  const s = await window.settingsAPI.get();
  if (s.listenPort) settingListenPort.value = s.listenPort;
  if (s.sendPort)   settingSendPort.value   = s.sendPort;

  const p = await window.settingsAPI.getPresetPath();
  presetStoragePath.textContent = p;
})();

btnSaveSettings.addEventListener("click", async () => {
  const listenPort = parseInt(settingListenPort.value, 10);
  const sendPort   = parseInt(settingSendPort.value,   10);

  if (!listenPort || listenPort < 1024 || listenPort > 65535
   || !sendPort   || sendPort   < 1024 || sendPort   > 65535) {
    settingsStatus.textContent = "Invalid port numbers.";
    settingsStatus.className   = "status error";
    return;
  }
  if (listenPort === sendPort) {
    settingsStatus.textContent = "Listen and send ports must be different.";
    settingsStatus.className   = "status error";
    return;
  }

  const r = await window.settingsAPI.save({ listenPort, sendPort });
  if (r.ok) {
    settingsStatus.textContent = "Saved. Restart the app to apply port changes.";
    settingsStatus.className   = "status success";
  } else {
    settingsStatus.textContent = `Save failed: ${r.error}`;
    settingsStatus.className   = "status error";
  }
});

btnOpenPresetFolder.addEventListener("click", () => window.settingsAPI.openPresetFolder());

document.getElementById("linkGithub").addEventListener("click", () =>
  window.settingsAPI.openExternal("https://github.com/Saesei")
);

// ============================================================
// FALLBACK MANAGER PAGE (unchanged)
// ============================================================

const select        = document.getElementById("avatarSelect");
const customId      = document.getElementById("customId");
const auth          = document.getElementById("auth");
const selectedId    = document.getElementById("selectedId");
const avatarImage   = document.getElementById("avatarImage");
const avatarName    = document.getElementById("avatarName");
const avatarAuthor  = document.getElementById("avatarAuthor");
const currentImage  = document.getElementById("currentImage");
const currentName   = document.getElementById("currentName");
const currentAuthor = document.getElementById("currentAuthor");
const currentId     = document.getElementById("currentId");
const result        = document.getElementById("result");
const accountStatus = document.getElementById("accountStatus");

let avatars = [];

function setImage(img, dataUrl) {
  if (dataUrl) { img.src = dataUrl; img.style.display = "block"; }
  else { img.removeAttribute("src"); img.style.display = "none"; }
}

function showResult(text, error = false) {
  result.textContent = text;
  result.className   = `result ${error ? "error" : "success"}`;
}

async function showPreset(avatar) {
  if (!avatar) return;
  avatarName.textContent   = avatar.avatarName;
  avatarAuthor.textContent = `By: ${avatar.authorName || "Unknown"}`;
  selectedId.textContent   = avatar.avatarId;
  setImage(avatarImage, null);
  const img = await window.vrchatAPI.loadAvatarImage(avatar.imgUrl, auth.value.trim());
  if (img.ok) setImage(avatarImage, img.dataUrl);
}

async function loadAvatars() {
  avatars = await window.vrchatAPI.loadAvatars();
  select.innerHTML = "";
  for (const a of avatars) {
    const o = document.createElement("option");
    o.value = a.avatarId;
    o.textContent = `${a.avatarName} — ${a.authorName}`;
    select.appendChild(o);
  }
  await showPreset(avatars[0]);
}

select.addEventListener("change", async () => {
  customId.value = "";
  await showPreset(avatars.find(a => a.avatarId === select.value));
});

customId.addEventListener("input", () => {
  if (customId.value.trim()) {
    selectedId.textContent   = customId.value.trim();
    avatarName.textContent   = "Custom avatar";
    avatarAuthor.textContent = "";
    setImage(avatarImage, null);
  } else {
    showPreset(avatars.find(a => a.avatarId === select.value));
  }
});

document.getElementById("verify").addEventListener("click", async () => {
  accountStatus.textContent = "Checking…";
  accountStatus.className   = "status";
  const r = await window.vrchatAPI.verifyAuth(auth.value.trim());
  if (!r.ok) {
    accountStatus.textContent = r.error;
    accountStatus.className   = "status error";
    return;
  }
  accountStatus.textContent = `Logged in as ${r.username}`;
  accountStatus.className   = "status success";
  if (r.fallbackAvatar) await showCurrentFallback(r.fallbackAvatar);
});

async function showCurrentFallback(id) {
  currentId.textContent     = id || "—";
  currentName.textContent   = "Loading…";
  currentAuthor.textContent = "";
  setImage(currentImage, null);

  const info   = await window.vrchatAPI.getAvatar(auth.value.trim(), id);
  let avatar   = info.ok ? info.avatar : null;
  if (!avatar || !avatar.name) avatar = avatars.find(a => a.avatarId === id);

  if (avatar) {
    currentName.textContent   = avatar.name || avatar.avatarName || "Unknown avatar";
    currentAuthor.textContent = `By: ${avatar.authorName || "Unknown"}`;
    currentId.textContent     = avatar.id   || avatar.avatarId   || id;
    const url = avatar.imageUrl || avatar.imgUrl;
    if (url) {
      const img = await window.vrchatAPI.loadAvatarImage(url, auth.value.trim());
      if (img.ok) setImage(currentImage, img.dataUrl);
    }
  } else {
    currentName.textContent   = "Unknown avatar";
    currentAuthor.textContent = "";
  }
}

document.getElementById("selectFallback").addEventListener("click", async () => {
  const id = customId.value.trim() || select.value;
  if (!auth.value.trim()) return showResult("Enter your VRChat auth cookie first.", true);
  if (!id)                return showResult("Select an avatar or enter an avatar ID.", true);
  showResult("Sending request to VRChat…");
  const r = await window.vrchatAPI.selectFallback(auth.value.trim(), id);
  if (!r.ok) return showResult(r.error, true);
  showResult(`Success. VRChat reports your fallback as ${r.fallbackAvatar}`);
  await showCurrentFallback(r.fallbackAvatar || id);
});

document.getElementById("checkCurrent").addEventListener("click", async () => {
  if (!auth.value.trim()) return showResult("Enter your VRChat auth cookie first.", true);
  showResult("Checking current fallback…");
  const r = await window.vrchatAPI.verifyAuth(auth.value.trim());
  if (!r.ok)              return showResult(r.error, true);
  if (!r.fallbackAvatar)  return showResult("VRChat did not report a fallback avatar.", true);
  await showCurrentFallback(r.fallbackAvatar);
  showResult("Current fallback loaded.");
});

loadAvatars().catch(err => showResult(`Could not load avatar list: ${err.message}`, true));