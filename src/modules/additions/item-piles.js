/* eslint-disable no-use-before-define, no-continue */
import AdditionsUtils from "./utils.js";
import { ADDITIONS_SETTINGS } from "./constants.js";

export default class AdditionsItemPiles {
  static initialize() {
    if (!game.modules.get("item-piles")?.active) return;

    Hooks.on("item-piles-removeItems", (target, itemDeltas) => {
      handleItemPilesInteraction(target, itemDeltas);
    });

    ["dropItem", "transferItems", "giveItem"].forEach((hookName) => {
      Hooks.on(`item-piles-${hookName}`, (source, _, itemData) => {
        handleItemPilesInteraction(source, itemData);
      });
    });
  }
}

async function handleItemPilesInteraction(source, itemData) {
  if (
    !AdditionsUtils.isResponsibleGM() ||
    !game.settings.get(game.system.id, ADDITIONS_SETTINGS.itemPilesHandling)
  ) {
    return;
  }
  const deltas = Array.isArray(itemData) ? itemData : [itemData];
  const owningActor = source._actor ?? source;
  const itemsToDelete = [];
  for (const info of deltas) {
    if (
      !info ||
      info?.quantity > 1 ||
      info.item?.type !== "weapon" ||
      !info.item?.system?.upgrades?.length
    ) {
      continue;
    }
    for (const upgrade of info.item.system.upgrades) {
      itemsToDelete.push(upgrade._id);
    }
  }
  if (!itemsToDelete.length) return;

  setTimeout(async () => {
    const deletable = itemsToDelete.filter((id) => owningActor.items.get(id));
    if (!deletable.length) return;
    await owningActor.deleteEmbeddedDocuments("Item", deletable);
    if (
      owningActor.items.size === 0 &&
      owningActor?.flags["item-piles"]?.data?.deleteWhenEmpty &&
      owningActor.parent
    ) {
      await owningActor.parent.delete();
    }
  }, 5000);
}
