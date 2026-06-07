/* eslint-disable max-classes-per-file */
import CPRMod from "../rolls/cpr-modifiers.js";
import SystemUtils from "../utils/cpr-systemUtils.js";
import CPRDialog, { resolveDialogRoot } from "./cpr-dialog-application.js";
import normalizeRollDialogFormData from "./cpr-roll-dialog-form-data.js";

export class CPRRollDialog extends CPRDialog {
  /**
   *
   * @param {CPRRoll} rollData - cprRoll data
   * @param {CPRActor} actor - actor that the roll came from
   * @param {CPRItem} item - item that the roll may have come from
   * @param {Object} options - options to change the nature of the dialog
   * @constructor
   */
  constructor(rollData, actor, item, options = {}) {
    // Push title + template into options BEFORE super so the V2 frozen-options
    // contract is respected (CPRDialog merges these into the rendered config).
    const merged = foundry.utils.mergeObject(
      options,
      {
        title: rollData.rollTitle,
        template: rollData.rollPrompt,
        form: {
          handler: CPRRollDialog.#onSubmitForm,
          submitOnChange: true,
          closeOnSubmit: false,
        },
      },
      { inplace: false }
    );
    super(rollData, merged);

    this.rollData = rollData;

    // Get prototype chain (an array of class name strings) for the rollData.
    this.prototypeChain = SystemUtils.getPrototypeChain(rollData);

    // Set actor and items.
    this.actor = actor;
    this.item = item;

    // Situational modifiers from pg. 130
    this.defaultSituationalMods = CPRMod.getDefaultSituationalMods();

    this.showSituationalMods = true;

    // Hide default mods, user can then toggle them on.
    this.showDefaultMods = false;
  }

  /**
   * Prepares data for roll dialog sheet.
   *
   * @override
   */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    data.rollData = this.rollData; // CPRRoll object
    data.actor = this.actor;
    data.prototypeChain = this.prototypeChain;

    // Select element options for program damage rolls.
    if (this.rollData.rollCardExtraArgs.program) {
      data.programDamageSelectOptions = this.getProgramDamageSelectOptions();
    }

    // Default situational mods form core book. These modifiers would not apply to Death Save rolls.
    if (!this.prototypeChain.includes("CPRDeathSaveRoll")) {
      data.defaultSituationalMods = this.defaultSituationalMods;
    }
    data.showDefaultMods = this.showDefaultMods;
    data.showSituationalMods = this.showSituationalMods;

    // Get filtered situational mods. These currently come from effects, role abilities, or item upgrades.
    data.filteredMods = CPRMod.getSituationalRollMods(
      this.rollData,
      Array.from(this.actor.allApplicableEffects()),
      this.item,
      this.actor
    );
    this.filteredMods = data.filteredMods;

    let totalMods = 0;
    this.rollData.mods.forEach((m) => {
      totalMods += parseInt(m.value, 10);
    });
    this.rollData.additionalMods.forEach((m) => {
      totalMods += parseInt(m, 10);
    });
    data.totalMods = totalMods;
    return data;
  }

  /**
   * Prepares the program damage select options.
   *
   * @return {Array<Object>} An array of objects containing the value and label for each program damage option.
   */
  getProgramDamageSelectOptions() {
    const { program } = this.rollData.rollCardExtraArgs;
    const standardDamage = program.system
      ? program.system.damage.standard
      : program.damage.standard;
    const blackIceDamage = program.system
      ? program.system.damage.blackIce
      : program.damage.blackIce;
    const programDamageSelectOptions = [
      {
        value: standardDamage,
        label: `${SystemUtils.Format("CPR.itemSheet.program.damageTo", {
          programType: SystemUtils.Localize(
            "CPR.itemSheet.program.nonBlackIce"
          ),
        })}: (${standardDamage})`,
      },
      {
        value: blackIceDamage,
        label: `${SystemUtils.Format("CPR.itemSheet.program.damageTo", {
          programType: SystemUtils.Localize("CPR.itemSheet.program.blackIce"),
        })}: (${blackIceDamage})`,
      },
    ];
    return programDamageSelectOptions;
  }

  /**
   *
   * @param {*} html
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);

    const root = resolveDialogRoot(html) ?? this.element;
    if (!(root instanceof HTMLElement)) return;

    this._rollDialogListenersAbort?.abort();
    this._rollDialogListenersAbort = new AbortController();
    const { signal } = this._rollDialogListenersAbort;

    const onClick = (selector, listener) => {
      for (const el of root.querySelectorAll(selector)) {
        el.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            listener(event);
          },
          { signal }
        );
      }
    };

    onClick(".toggle-situational-mod", (event) =>
      this._toggleSituationalMod(event)
    );
    onClick(".aimed-checkbox", () => this._aimedToggle());
    onClick(".toggle-show-mods", (event) => this._toggleModsVisibility(event));
  }

  /**
   * When the aimed shot checkbox is toggled, it shows the drop down for aim location, but `cprRoll.location` is not
   * actually updated until the next time the form is submitted. Unfortunately, when the OK button is pressed, the
   * Promise is returned before the form is resubmitted. So, if a user toggles aimed shot but doesn't change any
   * other data before pressing OK, the location is still set to "body". This function sets `cprRoll.location` to
   * head when the toggle is checked and back to body when the toggle is unchecked, fixing the above issue (until
   * someone can figure out how to resolve the Promise after the form is submitted.)
   *
   */
  _aimedToggle() {
    if (this.rollData.isAimed) {
      this.rollData.location = "body";
    } else {
      this.rollData.location = "head";
    }
  }

  /**
   * Add/remove mods from active effects. Also adds and removes the default situtational mods.
   *
   * @param {*} event
   */
  _toggleSituationalMod(event) {
    // Every situational mod should have an ID so that it can be added and deleted.
    const id = SystemUtils.GetEventDatum(event, "data-mod-id");
    const mod =
      this.filteredMods.find((m) => m.id === id) ||
      this.defaultSituationalMods.find((m) => m.id === id);

    if (this.rollData.mods.some((m) => m.id === id)) {
      this.rollData.removeMod(id);
    } else {
      this.rollData.addMod([mod]);
    }

    this.render();
  }

  /**
   * Toggle showing/hiding the situational modifiers or the default modifiers from the core rule book (pg 130).
   *
   */
  _toggleModsVisibility(event) {
    const target = SystemUtils.GetEventDatum(event, "data-target");
    if (target === "situational-mods") {
      this.showSituationalMods = !this.showSituationalMods;
    } else {
      this.showDefaultMods = !this.showDefaultMods;
    }
    this.render();
  }

  static async #onSubmitForm(_event, _form, formData) {
    const { data, invalidAdditionalMods } = normalizeRollDialogFormData(
      formData.object
    );
    if (invalidAdditionalMods) {
      SystemUtils.DisplayMessage(
        "warn",
        "CPR.rolls.modifiers.additionalModWarning"
      );
    }
    foundry.utils.mergeObject(this.object, data);
    this.render(true);
  }
}

export class CPRRoleRollDialog extends CPRRollDialog {
  /**
   * Prepares any data unique to the Role Roll Dialog sheet.
   */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);

    const skillIsVarying =
      this.item.system.skill === "varying" ||
      this.item.system.abilities.find((a) => a.name === this.rollData.roleName)
        ?.skill === "varying";

    if (skillIsVarying) {
      data.isVarying = true; // Used as a condition to display drop-down menu in dialog.
      if (this.rollData.skillName === "varying") {
        // If the skill is varying, assign data from the first skill in the dropdown menu,
        // so all form data are consistent with the what the dropdown menu displays by default.
        // Note, this will only happen when the dialog is first opened, which is by design.
        const firstSkill = this.rollData.skillList.sort((a, b) =>
          a.name > b.name ? 1 : -1
        )[0];
        data.rollData.skillName = firstSkill.name;
        data.rollData.skillValue = firstSkill.system.level;
        data.rollData.statName = firstSkill.system.stat;
        data.rollData.statValue = this.actor.getStat(this.rollData.statName);
      }
    }

    return data;
  }

  /**
   *
   * @param {*} html
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);

    const root = resolveDialogRoot(html) ?? this.element;
    if (!(root instanceof HTMLElement)) return;

    const { signal } = this._rollDialogListenersAbort ?? {};
    if (!signal) return;

    for (const select of root.querySelectorAll(".skill-list-select")) {
      select.addEventListener(
        "change",
        (event) => this._updateSkillValue(event),
        { signal }
      );
    }
  }

  /**
   * Updates the skill value when the varied skill is changed. Also adds/removes the modifier for each skill
   * as it is changed.
   *
   * @param {*} event
   */
  _updateSkillValue(event) {
    const skill = this.rollData.skillList.find(
      (s) => s.name === event.currentTarget.value
    );

    // Set skill level.
    this.rollData.skillValue = skill.system.level;

    // Set stat level.
    this.rollData.statName = skill.system.stat;
    this.rollData.statValue = this.actor.getStat(this.rollData.statName);

    const effects = Array.from(this.actor.allApplicableEffects());
    const allMods = CPRMod.getAllModifiers(effects);
    // Mods for the skill we are changing to.
    const newSkillMods = CPRMod.getRelevantMods(allMods, [
      SystemUtils.slugify(event.currentTarget.value),
      `${SystemUtils.slugify(event.currentTarget.value)}Hearing`,
      `${SystemUtils.slugify(event.currentTarget.value)}Sight`,
    ]);
    // Mods for the skill we are changing away from.
    const previousSkillMods = CPRMod.getRelevantMods(allMods, [
      SystemUtils.slugify(this.rollData.skillName),
      `${SystemUtils.slugify(this.rollData.skillName)}Hearing`,
      `${SystemUtils.slugify(this.rollData.skillName)}Sight`,
    ]);

    // Apply mods appropriately for the newly selected skill.
    if (newSkillMods) {
      newSkillMods.forEach((m) => {
        if (!m.isSituational) {
          this.rollData.addMod([m]);
        } else if (m.isSituational && m.onByDefault) {
          this.rollData.addMod([m]);
          this.filteredMods.push(m);
        } else {
          this.filteredMods.push(m);
        }
      });
    }

    // Remove mods appropriately for the deselected skill.
    if (previousSkillMods) {
      previousSkillMods.forEach((previousMod) => {
        if (
          this.rollData.mods.some(
            (currentMod) => previousMod.id === currentMod.id
          )
        ) {
          this.rollData.removeMod(previousMod.id);
        }

        if (
          this.filteredMods.some(
            (currentMod) => previousMod.id === currentMod.id
          )
        ) {
          const modIndex = this.filteredMods.findIndex(
            (currentMod) => previousMod.id === currentMod.id
          );
          this.filteredMods.splice(modIndex, 1);
        }
      });
    }
  }
}
