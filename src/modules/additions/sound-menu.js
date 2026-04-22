/* eslint-disable class-methods-use-this */
/* global FilePicker */
import { ADDITIONS_SETTINGS } from "./constants.js";

export default class SoundMenu extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cpr-additions-sounds-menu",
      title: game.i18n.localize("CPR.additions.settings.soundSelect.name"),
      template: `systems/${game.system.id}/templates/additions/soundmenu.html`,
      classes: ["sheet"],
      width: 500,
      height: 500,
      closeOnSubmit: true,
      submitOnClose: false,
      resizable: true,
    });
  }

  async getData() {
    const data = (await super.getData()).object;
    data.userSounds = game.settings.get(
      game.system.id,
      ADDITIONS_SETTINGS.configuredSounds
    );
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("th a .fa-trash").click((event) => {
      event.target.parentElement.parentElement.parentElement.remove();
    });

    html.find(".add-row").click((event) => {
      const target = event.currentTarget;
      new FilePicker({
        type: "audio",
        current: target.getAttribute("src"),
        callback: (path) => this.newRow(target, path),
        top: this.position.top + 40,
        left: this.position.left + 10,
      }).browse(target.getAttribute("src"));
    });

    html.find("#save-hit-sounds").click(() => {
      const pathInputs = $(".diw-audiopath");
      const paths = [];
      for (let i = 0; i < pathInputs.length; i += 1) {
        paths.push(pathInputs[i].value);
      }
      game.settings.set(
        game.system.id,
        ADDITIONS_SETTINGS.configuredSounds,
        paths
      );
    });
  }

  async newRow(target, path) {
    const newRow = $(`<tr>
      <th><input type="text" class="diw-audiopath" value="${path}" readonly/></th>
      <th><a><i class="fa-solid fa-trash"></i></a></th>
    </tr>`);
    newRow.insertBefore(target);
    newRow.find("a .fa-trash").click((event) => {
      event.target.parentElement.parentElement.parentElement.remove();
    });
  }
}
