import SoundMenu from "./sound-menu.js";
import { ADDITIONS_SETTINGS } from "./constants.js";

export default function registerAdditionsSettings() {
  game.settings.register(game.system.id, ADDITIONS_SETTINGS.hitAnimations, {
    name: "CPR.additions.settings.hitAnimations.name",
    hint: "CPR.additions.settings.hitAnimations.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: window.Sequence != null,
  });

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.useJb2aPatreon, {
    name: "CPR.additions.settings.useJb2aPatreon.name",
    hint: "CPR.additions.settings.useJb2aPatreon.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.hitSounds, {
    name: "CPR.additions.settings.hitSounds.name",
    hint: "CPR.additions.settings.hitSounds.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.registerMenu(game.system.id, "additionsConfigureSoundsMenu", {
    name: "CPR.additions.settings.soundSelect.name",
    label: "CPR.additions.settings.soundSelect.button",
    hint: "CPR.additions.settings.soundSelect.hint",
    icon: "fas fa-cog",
    type: SoundMenu,
    restricted: true,
  });

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.configuredSounds, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.showDvDisplay, {
    name: "CPR.additions.settings.showDvDisplay.name",
    hint: "CPR.additions.settings.showDvDisplay.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(
    game.system.id,
    ADDITIONS_SETTINGS.dvDisplayOnlyInCombat,
    {
      name: "CPR.additions.settings.dvDisplayOnlyInCombat.name",
      hint: "CPR.additions.settings.dvDisplayOnlyInCombat.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
    }
  );

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.dvDisplayPosition, {
    name: "CPR.additions.settings.dvDisplayPosition.name",
    hint: "CPR.additions.settings.dvDisplayPosition.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      right: "CPR.additions.settings.dvDisplayPosition.right",
      left: "CPR.additions.settings.dvDisplayPosition.left",
    },
    default: "right",
  });

  game.settings.register(
    game.system.id,
    ADDITIONS_SETTINGS.showWeaponNamesInDvDisplay,
    {
      name: "CPR.additions.settings.showWeaponNamesInDvDisplay.name",
      hint: "CPR.additions.settings.showWeaponNamesInDvDisplay.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
    }
  );

  game.settings.register(
    game.system.id,
    ADDITIONS_SETTINGS.hideCoverTokenOnPlace,
    {
      name: "CPR.additions.settings.hideCoverTokenOnPlace.name",
      hint: "CPR.additions.settings.hideCoverTokenOnPlace.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    }
  );

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.coverActorId, {
    scope: "world",
    config: false,
    default: "",
    type: String,
  });

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.poorWeaponCheck, {
    name: "CPR.additions.settings.poorWeaponCheck.name",
    hint: "CPR.additions.settings.poorWeaponCheck.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(
    game.system.id,
    ADDITIONS_SETTINGS.dfAmbientLightsEnable,
    {
      name: "CPR.additions.settings.dfAmbientLightsEnable.name",
      hint: "CPR.additions.settings.dfAmbientLightsEnable.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    }
  );

  game.settings.register(game.system.id, ADDITIONS_SETTINGS.itemPilesHandling, {
    name: "CPR.additions.settings.itemPilesHandling.name",
    hint: "CPR.additions.settings.itemPilesHandling.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}
