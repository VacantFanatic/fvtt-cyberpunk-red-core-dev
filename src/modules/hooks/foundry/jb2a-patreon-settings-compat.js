const JB2A_PATREON_ID = "jb2a_patreon";

function isSettingRegistered(key) {
  return game.settings.settings.has(`${JB2A_PATREON_ID}.${key}`);
}

function registerJb2aPatreonSetting(key, config) {
  if (isSettingRegistered(key)) return;
  game.settings.register(JB2A_PATREON_ID, key, config);
}

/**
 * JB2A's bridge script reads patreon settings during setupGame. If the patreon
 * module folder exists but failed to initialize, register safe defaults so
 * startup does not throw.
 */
export function registerJb2aPatreonSettingsCompat() {
  const patreonModule = game.modules.get(JB2A_PATREON_ID);
  const freeJb2aModule = game.modules.get("JB2A_DnD5e");
  if (!patreonModule && !freeJb2aModule?.active) return;

  registerJb2aPatreonSetting("runonlyonce", {
    name: "JB2A Patreon Run Only Once",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  registerJb2aPatreonSetting("jb2aLocation", {
    name: "JB2A Patreon Asset Location",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
}

export default function registerJb2aPatreonSettingsCompatHook() {
  Hooks.once("init", registerJb2aPatreonSettingsCompat, { priority: 1000 });
}
