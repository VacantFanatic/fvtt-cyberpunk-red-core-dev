/* eslint-disable no-param-reassign */

import BaseMigrationScript from "../base-migration-script.js";

/**
 * Make "ammo" an installable type for every loadable (weapon) item.
 *
 * Add ammo uuid to the list of installed items (will get converted to regular id
 * in next script).
 */
export default class AmmoIsInstallable extends BaseMigrationScript {
  static version = 32;

  static name = "Loadables: Ammo Is Installable";

  static documentFilters = {
    Item: { types: [], mixins: ["loadable"] },
    Actor: { types: [], mixins: [] },
  };

  async updateItem(doc) {
    const { addAmmoAsInstallable, addInstalledAmmo } = this.constructor;
    addAmmoAsInstallable(doc);
    addInstalledAmmo(doc);
  }

  static addAmmoAsInstallable(loadable) {
    const systemData = loadable.system || (loadable.system = {});
    const { isRanged } = systemData;
    if (!isRanged) return;
    const installedItems =
      systemData.installedItems || (systemData.installedItems = {});
    if (!Array.isArray(installedItems.allowedTypes)) {
      installedItems.allowedTypes = [];
    }
    installedItems.allowed = true;
    if (installedItems.allowedTypes.includes("ammo")) return;
    installedItems.allowedTypes.push("ammo");
  }

  static addInstalledAmmo(loadable) {
    const systemData = loadable.system || (loadable.system = {});
    const installedItems =
      systemData.installedItems || (systemData.installedItems = {});
    if (!Array.isArray(installedItems.list)) {
      installedItems.list = [];
    }
    const magazine = systemData.magazine || (systemData.magazine = {});
    if (magazine.ammoData?.uuid) {
      installedItems.list.push(magazine.ammoData.uuid);
    }
    magazine.ammoData = null;
  }
}
