/* global libWrapper */
import DvDisplay from "./dv-display.js";
import AdditionsCover from "./cover.js";
import AdditionsTemplate from "./template.js";
import AdditionsDfAmbientLights from "./df-ambient-lights.js";
import AdditionsItemPiles from "./item-piles.js";
import registerPoorWeaponCheck from "./poor-weapon-check.js";
import registerDoesItHit from "./does-it-hit.js";

export function registerAdditions() {
  const tokenClass = foundry.canvas.placeables.Token;
  libWrapper.register(
    game.system.id,
    "foundry.canvas.placeables.Token.prototype.draw",
    DvDisplay.registerWrapper,
    "WRAPPER"
  );
  tokenClass.prototype.showDVDisplay = DvDisplay.show;
  tokenClass.prototype.clearDVDisplay = DvDisplay.clear;

  Hooks.on("hoverToken", (token, hovered) => {
    if (hovered) canvas.tokens.get(token.id)?.showDVDisplay();
    else canvas.tokens.get(token.id)?.clearDVDisplay();
  });
  Hooks.on("controlToken", (token) => {
    canvas.tokens.get(token.id)?.clearDVDisplay();
  });

  registerDoesItHit();
  registerPoorWeaponCheck();
  AdditionsDfAmbientLights.initialize();
  AdditionsItemPiles.initialize();
}

export function getAdditionsApi() {
  return {
    createCover: AdditionsCover.createCover,
    createTemplate: AdditionsTemplate.createTemplate,
    createExplosiveTemplate: AdditionsTemplate.createExplosiveTemplate,
  };
}
