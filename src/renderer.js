const select = document.getElementById("avatarSelect");
const customId = document.getElementById("customId");
const auth = document.getElementById("auth");
const selectedId = document.getElementById("selectedId");
const avatarImage = document.getElementById("avatarImage");
const avatarName = document.getElementById("avatarName");
const avatarAuthor = document.getElementById("avatarAuthor");
const currentImage = document.getElementById("currentImage");
const currentName = document.getElementById("currentName");
const currentAuthor = document.getElementById("currentAuthor");
const currentId = document.getElementById("currentId");
const result = document.getElementById("result");
const accountStatus = document.getElementById("accountStatus");

let avatars = [];

function setImage(img, dataUrl) {
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

function showResult(text, error = false) {
  result.textContent = text;
  result.className = `result ${error ? "error" : "success"}`;
}

async function showPreset(avatar) {
  if (!avatar) return;
  avatarName.textContent = avatar.avatarName;
  avatarAuthor.textContent = `By: ${avatar.authorName || "Unknown"}`;
  selectedId.textContent = avatar.avatarId;
  setImage(avatarImage, null);
  avatarImage.alt = avatar.avatarName;

  const authValue = auth.value.trim();
  const image = await window.vrchatAPI.loadAvatarImage(avatar.imgUrl, authValue);
  if (image.ok) setImage(avatarImage, image.dataUrl);
}

async function loadAvatars() {
  avatars = await window.vrchatAPI.loadAvatars();
  select.innerHTML = "";
  for (const avatar of avatars) {
    const option = document.createElement("option");
    option.value = avatar.avatarId;
    option.textContent = `${avatar.avatarName} — ${avatar.authorName}`;
    select.appendChild(option);
  }
  await showPreset(avatars[0]);
}

select.addEventListener("change", async () => {
  customId.value = "";
  const avatar = avatars.find(a => a.avatarId === select.value);
  await showPreset(avatar);
});

customId.addEventListener("input", () => {
  if (customId.value.trim()) {
    selectedId.textContent = customId.value.trim();
    avatarName.textContent = "Custom avatar";
    avatarAuthor.textContent = "";
    setImage(avatarImage, null);
  } else {
    showPreset(avatars.find(a => a.avatarId === select.value));
  }
});

document.getElementById("verify").addEventListener("click", async () => {
  accountStatus.textContent = "Checking…";
  const r = await window.vrchatAPI.verifyAuth(auth.value.trim());
  if (!r.ok) {
    accountStatus.textContent = r.error;
    accountStatus.className = "status error";
    return;
  }
  accountStatus.textContent = `Logged in as ${r.username}`;
  accountStatus.className = "status success";
  if (r.fallbackAvatar) await showCurrentFallback(r.fallbackAvatar);
  await showPreset(avatars.find(a => a.avatarId === select.value));
});

async function showCurrentFallback(id) {
  currentId.textContent = id || "—";
  currentName.textContent = "Loading avatar…";
  currentAuthor.textContent = "";
  setImage(currentImage, null);

  const info = await window.vrchatAPI.getAvatar(auth.value.trim(), id);
  let avatar = info.ok ? info.avatar : null;

  if (!avatar || !avatar.name) {
    avatar = avatars.find(a => a.avatarId === id);
  }

  if (avatar) {
    currentName.textContent = avatar.name || avatar.avatarName || "Unknown avatar";
    currentAuthor.textContent = `By: ${avatar.authorName || "Unknown"}`;
    currentId.textContent = avatar.id || avatar.avatarId || id;

    const url = avatar.imageUrl || avatar.imgUrl;
    if (url) {
      const image = await window.vrchatAPI.loadAvatarImage(url, auth.value.trim());
      if (image.ok) setImage(currentImage, image.dataUrl);
    } else {
      const preset = avatars.find(a => (a.avatarId || a.id) === id);
      if (preset?.imgUrl) {
        const image = await window.vrchatAPI.loadAvatarImage(preset.imgUrl, auth.value.trim());
        if (image.ok) setImage(currentImage, image.dataUrl);
      }
    }
  } else {
    currentName.textContent = "Unknown avatar";
    currentAuthor.textContent = "";
  }
}

document.getElementById("selectFallback").addEventListener("click", async () => {
  const id = customId.value.trim() || select.value;
  if (!auth.value.trim()) return showResult("Enter your VRChat auth cookie first.", true);
  if (!id) return showResult("Select an avatar or enter an avatar ID.", true);

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
  if (!r.ok) return showResult(r.error, true);

  if (!r.fallbackAvatar) return showResult("VRChat did not report a fallback avatar.", true);
  await showCurrentFallback(r.fallbackAvatar);
  showResult("Current fallback loaded.");
});

loadAvatars().catch(error => showResult(`Could not load avatar list: ${error.message}`, true));