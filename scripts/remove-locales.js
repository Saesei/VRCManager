const fs = require("fs");
const path = require("path");

const localesPath = path.join(
  __dirname,
  "..",
  "out",
  "VRChatFallbackManager-win32-x64",
  "locales"
);

const keepLocale = "en-US.pak";

if (!fs.existsSync(localesPath)) {
  console.error("Locales directory not found:");
  console.error(localesPath);
  process.exit(1);
}

for (const file of fs.readdirSync(localesPath)) {
  if (file !== keepLocale) {
    fs.rmSync(path.join(localesPath, file), { force: true });
  }
}

console.log(`Kept locale: ${keepLocale}`);
console.log("Removed all other Electron locale files.");