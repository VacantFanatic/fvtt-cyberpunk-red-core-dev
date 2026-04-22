/* eslint-disable no-use-before-define */
/* global renderTemplate, Portal */
import { ADDITIONS_SETTINGS } from "./constants.js";

let materials = [];

const presets = [
  { name: "Choose...", material: "custom" },
  { name: "Bank Vault Door", material: "steel_thick" },
  { name: "Bank Window Glass", material: "bulletproofglass_thick" },
  { name: "Bar", material: "wood_thick" },
  { name: "Boulder", material: "stone_thick" },
  { name: "Bulletproof Windshield", material: "bulletproofglass_thin" },
  { name: "Car Door", material: "steel_thin" },
  { name: "Data Term", material: "concrete_thick" },
  { name: "Engine Block", material: "steel_thick" },
  { name: "Hydrant", material: "steel_thick" },
  { name: "Log Cabin Wall", material: "wood_thick" },
  { name: "Metal Door", material: "steel_thin" },
  { name: "Office Cubicle", material: "plaster-foam-plastic_thin" },
  { name: "Office Wall", material: "plaster-foam-plastic_thick" },
  { name: "Overturned Table", material: "wood_thin" },
  { name: "Prison Visitation Glass", material: "bulletproofglass_thin" },
  { name: "Refrigerator", material: "steel_thin" },
  { name: "Shipping Container", material: "steel_thin" },
  { name: "Sofa", material: "plaster-foam-plastic_thin" },
  { name: "Statue", material: "stone_thin" },
  { name: "Tree", material: "wood_thick" },
  { name: "Utility Pole", material: "concrete_thick" },
  { name: "Wardrobe", material: "wood_thin" },
  { name: "Windshield", material: "plaster-foam-plastic_thin" },
  { name: "Wooden Door", material: "wood_thin" },
];

export default class Cover {
  static async createCover() {
    if (!game.user.isGM) {
      ui.notifications.error(game.i18n.localize("CPR.additions.cover.onlyGm"));
      return;
    }
    if (!materials.length) initMaterials();

    const template = await renderTemplate(
      `systems/${game.system.id}/templates/additions/createcover.html`,
      { presets, materials }
    );
    new Dialog({
      title: game.i18n.localize("CPR.additions.cover.dialog.title"),
      content: template,
      buttons: {
        confirm: {
          label: game.i18n.localize("CPR.dialog.common.confirm"),
          callback: async (html) => extractData(html),
        },
        cancel: {
          label: game.i18n.localize("CPR.dialog.common.cancel"),
        },
      },
    }).render(true);
  }
}

function createMaterial(id, hp, thin) {
  return {
    value: `${id}_${thin ? "thin" : "thick"}`,
    name: game.i18n.format("CPR.additions.cover.materials.display", {
      material: game.i18n.localize(`CPR.additions.cover.materials.${id}`),
      thickness: game.i18n.localize(
        `CPR.additions.cover.materials.${thin ? "thin" : "thick"}`
      ),
    }),
    hp,
  };
}

function initMaterials() {
  materials = [
    createMaterial("steel", 25, true),
    createMaterial("steel", 50, false),
    createMaterial("stone", 20, true),
    createMaterial("stone", 40, false),
    createMaterial("bulletproofglass", 15, true),
    createMaterial("bulletproofglass", 30, false),
    createMaterial("concrete", 10, true),
    createMaterial("concrete", 25, false),
    createMaterial("wood", 5, true),
    createMaterial("wood", 20, false),
    createMaterial("plaster-foam-plastic", 0, true),
    createMaterial("plaster-foam-plastic", 15, false),
    { value: "custom", name: game.i18n.localize("NOTE.Custom"), hp: -1 },
  ];
}

async function extractData(html) {
  const height = Number.parseFloat(html.find("[id=height]")[0].value);
  const width = Number.parseFloat(html.find("[id=width]")[0].value);
  const hp = Number.parseInt(html.find("[id=hp]")[0].value, 10);
  if (hp <= 0) {
    ui.notifications.error(
      game.i18n.localize("CPR.additions.cover.zeroHpNoCover")
    );
    return;
  }

  let name = "";
  const preset = html.find("[id=preset]")[0];
  if (preset.value !== "custom") {
    name = preset.options[preset.options.selectedIndex].text;
  } else {
    const material = html.find("[id=material]")[0];
    name = material.options[material.options.selectedIndex].text;
  }

  const position = await getPosition(height, width);
  if (!position) return;
  await createToken(name, height, width, position, hp);
}

async function getPosition(height, width) {
  if (window.Portal) {
    return new Portal()
      .texture(
        `systems/${game.system.id}/icons/compendium/armor/bullet_proof_shield.svg`
      )
      .size(Math.max(height, width) * 2)
      .pick();
  }
  const { x, y } = canvas.mousePosition;
  return { x, y, elevation: 0 };
}

async function getActor() {
  const actorId = game.settings.get(
    game.system.id,
    ADDITIONS_SETTINGS.coverActorId
  );
  let actor = game.actors.get(actorId);
  if (!actor) actor = await createActor();
  return actor;
}

async function createActor() {
  const name = game.i18n.localize("CPR.additions.cover.defaultActorName");
  const actor = await Actor.create({
    name,
    type: "mook",
    img: `systems/${game.system.id}/icons/compendium/armor/bullet_proof_shield.svg`,
  });
  await actor.setFlag(
    "core",
    "sheetClass",
    `${game.system.id}.CPRMookActorSheet`
  );
  await actor.setFlag(game.system.id, "isCover", true);
  await actor.update({
    prototypeToken: {
      actorLink: false,
      displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER,
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      img: `systems/${game.system.id}/icons/compendium/armor/bullet_proof_shield.svg`,
      name,
      vision: false,
    },
  });
  await game.settings.set(
    game.system.id,
    ADDITIONS_SETTINGS.coverActorId,
    actor.id
  );
  return actor;
}

async function createToken(name, height, width, position, hp) {
  const actor = await getActor();
  await actor.update({ "system.derivedStats.hp": { max: hp, value: hp } });
  const data = await actor.getTokenDocument({ x: 0, y: 0, name });
  const [token] = await canvas.scene.createEmbeddedDocuments("Token", [data]);
  await canvas.scene.updateEmbeddedDocuments(
    "Token",
    [
      {
        _id: token._id,
        texture: {
          scaleX: 1,
          scaleY: Math.max(height, 0.5) / Math.max(width, 0.5),
        },
        elevation: position.elevation,
        height: Math.max(height, 0.5),
        hidden: game.settings.get(
          game.system.id,
          ADDITIONS_SETTINGS.hideCoverTokenOnPlace
        ),
        name,
        width: Math.max(width, 0.5),
        x: position.x - canvas.grid.size * (Math.max(width, 0.5) / 2),
        y: position.y - canvas.grid.size * (Math.max(height, 0.5) / 2),
      },
    ],
    { animate: false }
  );
}
