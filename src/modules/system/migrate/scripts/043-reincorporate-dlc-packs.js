/* eslint-disable no-param-reassign */
import BaseMigrationScript from "../base-migration-script.js";
import CPRSystemUtils from "../../../utils/cpr-systemUtils.js";

const PACK_REGEX =
  /@UUID\[Compendium\.cyberpunk-red-dlc\.(black-chrome_[a-z-]+|dlc_[a-z-]+|elflines_[a-z-]+)\.([a-zA-Z]+)\.([a-zA-Z0-9]+)\]/g;

const OLD_ICON_PREFIX = "modules/cyberpunk-red-dlc/icons/";
const NEW_ICON_PREFIX = "systems/cyberpunk-red-core/icons/compendium/";

export default class ReincorporateDlcPacks extends BaseMigrationScript {
  static version = 43;

  static name = "Reincorporate DLC compendia into core system";

  static documentFilters = {
    Item: { types: [], mixins: [] },
    Actor: { types: ["character", "mook", "blackIce", "demon"], mixins: [] },
  };

  _rewriteCompendiumUUIDs(str) {
    if (!str) return str;
    return str.replace(
      PACK_REGEX,
      (match, packName, docType, docId) =>
        `@UUID[Compendium.cyberpunk-red-core.${packName}.${docType}.${docId}]`
    );
  }

  _rewriteImagePath(path) {
    if (!path || !path.startsWith(OLD_ICON_PREFIX)) return path;
    return path.replace(OLD_ICON_PREFIX, NEW_ICON_PREFIX);
  }

  _updatePageContent(doc) {
    for (const page of doc.pages) {
      page.update({
        "text.content": this._rewriteCompendiumUUIDs(page.text.content),
      });
    }
  }

  _updateTableResult(doc) {
    const { results } = doc;
    for (const result of results) {
      const collection = result.documentCollection;
      if (typeof collection === "string" && collection.startsWith("cyberpunk-red-dlc.")) {
        result.update({
          documentCollection: collection.replace(
            "cyberpunk-red-dlc.",
            "cyberpunk-red-core."
          ),
        });
      }

      const newImg = this._rewriteImagePath(result.img);
      if (newImg !== result.img) result.update({ img: newImg });
    }
  }

  async updateItem(doc) {
    doc.img = this._rewriteImagePath(doc.img);
    doc.system.description.value = this._rewriteCompendiumUUIDs(
      doc.system.description.value
    );
  }

  async updateActor(doc) {
    if (["character", "mook"].includes(doc.type)) {
      doc.system.information.notes = this._rewriteCompendiumUUIDs(
        doc.system.information.notes
      );

      if ("lifepath" in doc.system) {
        for (const key of Object.keys(doc.system.lifepath)) {
          doc.system.lifepath[key] = this._rewriteCompendiumUUIDs(
            doc.system.lifepath[key]
          );
        }
      }

      if ("lifestyle" in doc.system) {
        for (const key of Object.keys(doc.system.lifestyle)) {
          doc.system.lifestyle[key].description = this._rewriteCompendiumUUIDs(
            doc.system.lifestyle[key].description
          );
        }
      }
    }

    if (["demon", "blackIce"].includes(doc.type)) {
      doc.system.notes = this._rewriteCompendiumUUIDs(doc.system.notes);
    }
  }

  async migrateMisc() {
    const journalsWorld = game.journal;
    const journalsWorldComp = CPRSystemUtils.GetCompendiaByType(
      "world",
      "JournalEntry"
    );
    const journalsModuleComp = CPRSystemUtils.GetCompendiaByType(
      "module",
      "JournalEntry"
    );
    const journalComps = [...journalsWorldComp, ...journalsModuleComp];

    for await (const journal of journalsWorld) this._updatePageContent(journal);

    for await (const comp of journalComps) {
      const pack = await game.packs.get(comp.metadata.id);
      const docs = await pack.getDocuments();
      const wasLocked = await pack.locked;
      if (wasLocked) await pack.configure({ locked: false });
      for (const doc of docs) this._updatePageContent(doc);
      if (wasLocked) await pack.configure({ locked: true });
    }

    const tablesWorld = game.tables;
    const tablesWorldComp = CPRSystemUtils.GetCompendiaByType("world", "RollTable");
    const tablesModuleComp = CPRSystemUtils.GetCompendiaByType(
      "module",
      "RollTable"
    );
    const tablesComps = [...tablesWorldComp, ...tablesModuleComp];

    for await (const table of tablesWorld) this._updateTableResult(table);

    for await (const table of tablesComps) {
      const pack = await game.packs.get(table.metadata.id);
      const docs = await pack.getDocuments();
      const wasLocked = await pack.locked;
      if (wasLocked) await pack.configure({ locked: false });
      for (const doc of docs) this._updateTableResult(doc);
      if (wasLocked) await pack.configure({ locked: true });
    }

    const scenesWorld = game.scenes;
    const scenesWorldComp = CPRSystemUtils.GetCompendiaByType("world", "Scene");
    const scenesModuleComp = CPRSystemUtils.GetCompendiaByType("module", "Scene");
    const scenesComps = [...scenesWorldComp, ...scenesModuleComp];

    for await (const scene of scenesWorld) {
      for await (const tile of scene.tiles) {
        const newImg = this._rewriteImagePath(tile.texture.src);
        if (newImg !== tile.texture.src) tile.update({ "texture.src": newImg });
      }
    }

    for await (const s of scenesComps) {
      const pack = await game.packs.get(s.metadata.id);
      const docs = await pack.getDocuments();
      const wasLocked = await pack.locked;
      if (wasLocked) await pack.configure({ locked: false });
      for (const doc of docs) {
        for (const tile of doc.tiles) {
          const newImg = this._rewriteImagePath(tile.texture.src);
          if (newImg !== tile.texture.src) tile.update({ "texture.src": newImg });
        }
      }
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}

