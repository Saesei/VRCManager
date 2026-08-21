module.exports = {
  packagerConfig: {
    asar: true,
    name: "VRChatFallbackSelector",
    executableName: "VRChatFallbackSelector",
    icon: './fallback' 
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: { 
        name: "vrchatfallbackselector",
        authors: "Saesei",
        setupIcon: './fallback.ico' 
      }
    }
  ]
};
