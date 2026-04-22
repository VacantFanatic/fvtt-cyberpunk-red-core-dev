/* eslint-disable no-use-before-define */
/* eslint-disable prefer-destructuring, no-param-reassign */
import AdditionsUtils from "./utils.js";
import { ADDITIONS_SETTINGS } from "./constants.js";

export default class AdditionsDfAmbientLights {
  static initialize() {
    if (
      game.modules.get("df-active-lights")?.active &&
      game.modules.get("autoanimations")?.active
    ) {
      Hooks.on("AutomatedAnimations-WorkflowStart", onWorkflowStart);
    }
  }
}

async function onWorkflowStart(clonedData, animationData) {
  if (
    !AdditionsUtils.isResponsibleGM() ||
    !game.settings.get(game.system.id, ADDITIONS_SETTINGS.dfAmbientLightsEnable)
  ) {
    return;
  }

  if (clonedData?.item?.system?.isRanged && !clonedData.ammoItem) {
    const foundAmmoItem = clonedData.item.system.installedItems?.list
      ?.map((id) => clonedData.token?.actor?.items?.get(id))
      ?.find((item) => item.type === "ammo");
    if (foundAmmoItem) {
      clonedData.ammoItem = foundAmmoItem;
      clonedData.recheckAnimation = true;
      if (
        ["arrow", "paintball", "grenade"].includes(foundAmmoItem.system.variety)
      )
        return;
    }
  }

  if (
    !clonedData?.item?.system?.isRanged ||
    !clonedData?.ammoItem ||
    !clonedData?.token ||
    !animationData
  ) {
    return;
  }

  const addedDelay = 100;
  const token = clonedData.token;
  const target = clonedData.targets?.[0]?.document;
  const delay = animationData?.primary?.options?.delay ?? 0;
  const repeat =
    clonedData?.overrideRepeat ?? animationData?.primary?.options?.repeat ?? 1;
  const repeatDelay = animationData?.primary?.options?.repeatDelay ?? 250;

  let rotation = token.rotation;
  if (target) {
    rotation =
      (360 -
        90 +
        Math.atan2(target.y - token.y, target.x - token.x) * (180 / Math.PI)) %
      360;
  }

  const addKeyFrame = (time, on) => ({
    time: game.time.serverTime + time + addedDelay,
    angle: { enabled: false, value: 0 },
    bright: { enabled: true, value: on ? 25 : 0 },
    dim: { enabled: true, value: on ? 25 : 0 },
    rotation: { enabled: false, value: 0 },
    tintAlpha: { enabled: false, value: 0.5 },
    tintColor: { enabled: false, value: "#000000", isColor: true },
  });

  const keyFrames = [];
  const initial = addKeyFrame(0, false);
  initial.time = 0;
  keyFrames.push(initial);
  keyFrames.push(addKeyFrame(delay - 1, false));
  for (let i = 0; i < repeat; i += 1) {
    keyFrames.push(addKeyFrame(delay + repeatDelay * i, true));
    keyFrames.push(addKeyFrame(delay + repeatDelay * i + 49, true));
    keyFrames.push(addKeyFrame(delay + repeatDelay * i + 50, false));
    keyFrames.push(addKeyFrame(delay + repeatDelay * (i + 1) - 1, false));
  }
  keyFrames.push(addKeyFrame(delay + repeatDelay * repeat + 10000, false));

  const [light] = await canvas.scene.createEmbeddedDocuments("AmbientLight", [
    {
      x: token.x + canvas.grid.size / 2,
      y: token.y + canvas.grid.size / 2,
      rotation,
      config: {
        color: "#943400",
        dim: 20,
        bright: 20,
        luminosity: 0.5,
        angle: 270,
        attenuation: 1,
      },
      flags: {
        "df-active-lights": {
          anims: { bounce: false, offset: 0, keys: keyFrames },
        },
      },
    },
  ]);

  setTimeout(() => {
    canvas.scene.deleteEmbeddedDocuments("AmbientLight", [light._id]);
  }, delay + repeatDelay * repeat + 2000 + addedDelay);
}
