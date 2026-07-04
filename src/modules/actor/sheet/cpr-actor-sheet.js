import * as CPRRolls from "../../rolls/cpr-rolls.js";
import CPRChat from "../../chat/cpr-chat.js";
import CPRLedger from "../../dialog/cpr-ledger-form.js";
import LOGGER from "../../utils/cpr-logger.js";
import Rules from "../../utils/cpr-rules.js";
import SystemUtils from "../../utils/cpr-systemUtils.js";
import createImageContextMenu from "../../utils/cpr-imageContextMenu.js";
import CPRMod from "../../rolls/cpr-modifiers.js";
import CPRDialog from "../../dialog/cpr-dialog-application.js";
import { ContainerUtils } from "../../item/mixins/cpr-container.js";
import AdditionsTemplate from "../../additions/template.js";
import enrichDocumentHTML from "../../utils/cpr-enrich-html.js";

/**
 * Normalize sheet root to an HTMLElement (Application V2 passes `this.element`;
 * legacy call sites may still pass a jQuery-like collection).
 *
 * @param {unknown} html
 * @returns {HTMLElement|null}
 */
export function resolveSheetRoot(html) {
  if (html instanceof HTMLElement) return html;
  const el = html?.[0];
  return el instanceof HTMLElement ? el : null;
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

/**
 * Extend the basic ActorSheet, which comes from Foundry. Not all sheets used in
 * this system module may extend from this. Others also extend ActorSheet. CPRActor
 * is used for common code between Mook sheets and Character sheets.
 * @extends {ActorSheetV2}
 */
export default class CPRActorSheet extends HandlebarsApplicationMixin(
  ActorSheetV2
) {
  static DEFAULT_OPTIONS = {
    classes: ["sheet", "actor"],
    tag: "form",
    position: {
      width: 800,
      height: "auto",
    },
    window: {
      resizable: true,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    actions: {
      importCyberpunkRedCom: CPRActorSheet.#onImportCyberpunkRedCom,
    },
  };

  static PARTS = {
    sheet: {
      template: "",
    },
  };

  /**
   * We extend the constructor to initialize data structures used for tracking parts of the sheet
   * being collapsed or opened, such as skill categories. These structures are later loaded from
   * User Settings if they exist.
   *
   * @constructor
   * @param {*} options - entity options passed up the chain
   */
  constructor(options = {}) {
    super(options);
    /** @type {string[]} */
    this.collapsedSections = [];
    const collapsedSections = SystemUtils.GetUserSetting(
      "sheetConfig",
      "sheetCollapsedSections",
      this.id
    );
    if (collapsedSections) {
      this.collapsedSections = Array.isArray(collapsedSections)
        ? [...collapsedSections]
        : collapsedSections;
    }
    /** @type {string} */
    this.cprContentFilter = "";
    /** @type {AbortController|null} Abort prior listeners when V2 re-renders the same root. */
    this._sheetListenersAbort = null;
  }

  /**
   * Inject legacy `this.template` paths into PARTS when the merged sheet part has no template
   * (e.g. mook). Application V2 freezes `this.options`; do not assign `options.parts` in the constructor.
   *
   * @param {ApplicationRenderOptions} options
   * @returns {Record<string, object>}
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const legacyTemplate = this.template;
    if (parts?.sheet && !parts.sheet.template && legacyTemplate) {
      return {
        ...parts,
        sheet: { ...parts.sheet, template: legacyTemplate },
      };
    }
    return parts;
  }

  /**
   * The scrollY option identifies elements where the
   * vertical position should be preserved during a re-render.
   *
   * See https://foundryvtt.com/api/v12/classes/client.Application.html for the complete list of options available.
   *
   * @override
   * @returns - sheet options merged with default options in ActorSheet
   */
  static get defaultOptions() {
    const resizeCPRSheets = game.settings.get(
      game.system.id,
      "resizeCPRSheets"
    );

    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "actor"],
      position: {
        width: 800,
        height: resizeCPRSheets ? 500 : "auto",
      },
      window: {
        resizable: true,
      },
      scrollY: [".right-content-section", ".top-pane-gear"],
      form: {
        submitOnChange: true,
        closeOnSubmit: false,
      },
    });
  }

  /**
   * Get actor data into a more convenient organized structure. This should be called sparingly in code.
   * Only add new data points to getData when you need a complex struct, not when you only need to add
   * new data points to shorten dataPaths. Remember, this data is on the CPRActorSheet object, not the
   * CPRActor object it is tied to. (this.actor)
   *
   * @override
   * @returns {Object} data - a curated structure of actorSheet data
   */
  async getData(options = {}) {
    const foundryData = await super._prepareContext(options);
    const cprData = {};

    cprData.fightData = {};
    if (this.actor.type === "mook" || this.actor.type === "character") {
      cprData.isHardened = this.actor.system.derivedStats.isHardened;

      cprData.fightData.fightOptions = this.actor.hasItemTypeEquipped(
        "cyberdeck"
      )
        ? "both"
        : "";
      let fightState = this.actor.getFlag(game.system.id, "fightState");
      if (!fightState || cprData.fightData.fightOptions !== "both") {
        fightState = "Meatspace";
      }
      cprData.fightData.fightState = fightState;
      cprData.fightData.cyberdeck = "";
      if (fightState === "Netspace") {
        cprData.fightData.cyberdeck = this.actor.getEquippedCyberdeck();
      }
      cprData.filteredEffects = await this.prepareActiveEffectCategories();
    }

    // This appears to have been removed in V10?
    cprData.isGM = game.user.isGM;

    cprData.isTokenSheet = !!this.token;
    cprData.measureDvInteractive = !!this._resolveDvTargetToken();

    cprData.enrichedHTML = [];
    const enrich = (html) => enrichDocumentHTML(html, this.actor);
    if (this.actor.type !== "container") {
      cprData.enrichedHTML.systemInformationNotes = await enrich(
        this.actor.system.information.notes
      );
    }
    if (this.actor.type === "demon") {
      cprData.enrichedHTML.systemNotes = await enrich(this.actor.system.notes);
    }
    if (this.actor.type === "character") {
      cprData.enrichedHTML.systemLifepathCulturalOrigin = await enrich(
        this.actor.system.lifepath.culturalOrigin
      );
      cprData.enrichedHTML.systemLifepathLanguages = await enrich(
        this.actor.system.lifepath.languages
      );
      cprData.enrichedHTML.systemLifepathPersonality = await enrich(
        this.actor.system.lifepath.personality
      );
      cprData.enrichedHTML.systemLifepathClothingStyle = await enrich(
        this.actor.system.lifepath.clothingStyle
      );
      cprData.enrichedHTML.systemLifepathHairStyle = await enrich(
        this.actor.system.lifepath.hairStyle
      );
      cprData.enrichedHTML.systemLifepathAffectations = await enrich(
        this.actor.system.lifepath.affectations
      );
      cprData.enrichedHTML.systemLifepathValueMost = await enrich(
        this.actor.system.lifepath.valueMost
      );
      cprData.enrichedHTML.systemLifepathAboutPeople = await enrich(
        this.actor.system.lifepath.aboutPeople
      );
      cprData.enrichedHTML.systemLifepathValuedPerson = await enrich(
        this.actor.system.lifepath.valuedPerson
      );
      cprData.enrichedHTML.systemLifepathValuedPossession = await enrich(
        this.actor.system.lifepath.valuedPossession
      );
      cprData.enrichedHTML.systemLifepathFamilyBackground = await enrich(
        this.actor.system.lifepath.familyBackground
      );
      cprData.enrichedHTML.systemLifepathChildhoodEnvironment = await enrich(
        this.actor.system.lifepath.childhoodEnvironment
      );
      cprData.enrichedHTML.systemLifepathFamilyCrisis = await enrich(
        this.actor.system.lifepath.familyCrisis
      );
      cprData.enrichedHTML.systemLifepathLifeGoals = await enrich(
        this.actor.system.lifepath.lifeGoals
      );
      cprData.enrichedHTML.systemLifepathRoleLifepath = await enrich(
        this.actor.system.lifepath.roleLifepath
      );
      cprData.enrichedHTML.systemLifepathFriends = await enrich(
        this.actor.system.lifepath.friends
      );
      cprData.enrichedHTML.systemLifepathTragicLoveAffairs = await enrich(
        this.actor.system.lifepath.tragicLoveAffairs
      );
      cprData.enrichedHTML.systemLifepathEnemies = await enrich(
        this.actor.system.lifepath.enemies
      );
    }

    const mergedOptions = foundry.utils.mergeObject(
      foundry.utils.deepClone(foundryData.options ?? {}),
      {
        cprContentFilter: this.cprContentFilter,
        collapsedSections: this.collapsedSections,
      }
    );

    return {
      ...foundryData,
      actor: foundryData.actor ?? foundryData.document ?? this.actor,
      options: mergedOptions,
      ...cprData,
    };
  }

  async _prepareContext(options) {
    return this.getData(options);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.activateListeners(this.element);
  }

  /**
   * Wrap a native event so handlers can use `event.currentTarget` as the matched element.
   *
   * @param {Event} event
   * @param {Element} matched
   * @returns {Event}
   */
  static _wrapDelegatedEvent(event, matched) {
    return new Proxy(event, {
      get(target, prop) {
        if (prop === "currentTarget") return matched;
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /**
   * Delegated click listener for sheet controls inside tab bodies (survives V2 re-renders).
   *
   * @param {HTMLElement} root
   * @param {AbortSignal} signal
   * @param {string} selector
   * @param {(event: Event) => void} listener
   */
  _bindDelegatedClick(root, signal, selector, listener) {
    root.addEventListener(
      "click",
      (event) => {
        const matched = event.target?.closest?.(selector);
        if (!matched || !root.contains(matched)) return;
        listener.call(this, CPRActorSheet._wrapDelegatedEvent(event, matched));
      },
      { signal }
    );
  }

  /**
   * Hook for character/mook sheets to register delegated clicks in the same pass as the base
   * sheet (avoids a second `activateListeners` pass that V2 can skip after tab re-renders).
   *
   * @param {(selector: string, listener: (event: Event) => void) => void} onClick
   * @protected
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars -- subclass hook
  _bindSubclassSheetClicks(_onClick) {}

  /**
   * Prepare the data structure for Active Effects which are currently applied to this actor.
   * This came from the DND5E active-effect.js code.
   *
   * @returns {Object} - Data for rendering
   */
  async prepareActiveEffectCategories() {
    const categories = {
      permanent: {
        type: "permanent",
        label: SystemUtils.Localize(
          "CPR.characterSheet.rightPane.effects.permanent"
        ),
        effects: [],
      },
      situational: {
        type: "situational",
        label: SystemUtils.Localize(
          "CPR.characterSheet.rightPane.effects.situational"
        ),
        effects: [],
      },
      inactive: {
        type: "inactive",
        label: SystemUtils.Localize(
          "CPR.characterSheet.rightPane.effects.inactive"
        ),
        effects: [],
      },
    };

    const setting = game.settings.get(
      game.system.id,
      "displayStatusAsActiveEffects"
    );
    // Iterate over active effects, classifying them into categories
    for (const e of this.actor.allApplicableEffects()) {
      // We want to create a "simplified effect" for two reasons:
      //    1. To make accessing information via handlebars easier.
      //    2. We want to only feed the changes that are relevant to each section.
      // We do this by first giving our new object important info from the original effect.
      // Then, we create CPRMods (which have a simplified data structure) from each effect.changes,
      // Then, put the CPRMods relevant to each category (permanent, situational, inactive)
      // into our simplified effect's changes. Then just push that to the effects in each relevant category.
      const simplifiedEffect = {
        name: e.name,
        sourceName: e.sourceName,
        parentName: e.parent.name,
        uuid: e.uuid,
        img: e.img,
        usage: e.usage,
        system: {
          isSuppressed: e.system.isSuppressed,
        },
        disabled: e.disabled,
      };
      if (
        !(
          typeof e.flags.core !== "undefined" &&
          typeof e.flags.core.statusId !== "undefined"
        ) ||
        setting
      ) {
        // Get effects with no changes and display in the Permanent Effects category.
        // This is a rare case where a user makes an effect but doesn't add any changes.
        if (e.changes.length === 0 && !e.disabled && !e.system.isSuppressed) {
          categories.permanent.effects.push(simplifiedEffect);
        }

        // Get situational, non-disabled effects.
        if (!e.disabled && !e.system.isSuppressed) {
          const situationalMods = CPRMod.getAllModifiers([e]).filter(
            (m) => m.isSituational
          );
          // To avoid repeats, duplicate simplifiedEffect to situationalEffect, and push that.
          const situationalEffect = foundry.utils.duplicate(simplifiedEffect);
          situationalEffect.changes = situationalMods;
          if (situationalEffect.changes.length > 0) {
            categories.situational.effects.push(situationalEffect);
          }
        }

        // Get inactive (disabled or suppressed) effects.
        if (e.disabled || e.system.isSuppressed) {
          // The second argument in the following function is set to true, so that it gets disabled modifiers.
          simplifiedEffect.changes = CPRMod.getAllModifiers([e], true);
          categories.inactive.effects.push(simplifiedEffect);
          // Get permanent, non-disabled effects.
        } else if (CPRMod.getAllModifiers([e]).some((m) => !m.isSituational)) {
          const permanentMods = CPRMod.getAllModifiers([e]).filter(
            (m) => !m.isSituational
          );
          simplifiedEffect.changes = permanentMods;
          categories.permanent.effects.push(simplifiedEffect);
        }
      }
    }

    return categories;
  }

  /**
   * Activate listeners for the sheet. This should be only common listeners across Mook and Character sheets.
   * This has to call super at the end for Foundry to process events properly and get built-in functionality
   * like dragging items to sheets.
   *
   * @override
   * @param {Object} html - the DOM object
   */
  activateListeners(html) {
    const root =
      resolveSheetRoot(html) ?? resolveSheetRoot(this.element) ?? null;
    if (!(root instanceof HTMLElement)) return;

    this._sheetListenersAbort?.abort();
    this._sheetListenersAbort = new AbortController();
    const { signal } = this._sheetListenersAbort;

    // allow navigation for non owned actors
    this._tabs?.forEach?.((t) => t.bind(root));

    // Delegated `.rollable` / `.item-action` clicks — tied to `signal` so partial
    // V2 re-renders do not accumulate duplicate native listeners on `root`.
    const onClick = (selector, listener) =>
      this._bindDelegatedClick(root, signal, selector, listener);

    this._bindSubclassSheetClicks(onClick);

    onClick(".rollable", (event) => this._onRoll(event));
    onClick(".item-action", (event) => this._itemAction(event));
    onClick(".ablate", (event) => this._ablateArmor(event));
    onClick(".armor-current-untrack", (event) =>
      this._makeArmorCurrentTrack(event)
    );
    onClick(".armor-current-track", (event) =>
      this._makeArmorCurrentUntrack(event)
    );
    onClick(".item-view", (event) => this._renderReadOnlyItemCard(event));
    onClick(".item-create", (event) => this._createInventoryItem(event));
    onClick(".reset-deathsave-value", () => this._resetDeathSave());
    onClick(".increase-deathsave-value", () => this._increaseDeathSave());
    onClick(".reset-content-filter", () => this._clearContentFilter());
    onClick(".expand-button", (event) => this._expandButton(event));
    onClick(".toggle-installed-visibility", (event) =>
      this._toggleInstalledVisibility(event)
    );
    onClick(".uninstall-single-item", (event) =>
      this._uninstallSingleItem(event)
    );

    root.addEventListener(
      "input",
      (event) => {
        const matched = event.target?.closest?.(".filter-contents");
        if (!matched || !root.contains(matched)) return;
        clearTimeout(this._contentFilterDebounce);
        this._contentFilterDebounce = setTimeout(() => {
          this._applyContentFilter(
            CPRActorSheet._wrapDelegatedEvent(event, matched)
          );
        }, 300);
      },
      { signal }
    );

    for (const row of root.querySelectorAll(".row.item")) {
      row.addEventListener(
        "mouseenter",
        (event) => {
          const { currentTarget } = event;
          for (const child of currentTarget.children) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              for (const nested of child.children) {
                if (nested.nodeType === Node.ELEMENT_NODE) {
                  nested.classList.add("show");
                }
              }
            }
          }
        },
        { signal }
      );
      row.addEventListener(
        "mouseleave",
        (event) => {
          const { currentTarget } = event;
          for (const child of currentTarget.children) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              for (const nested of child.children) {
                if (nested.nodeType === Node.ELEMENT_NODE) {
                  nested.classList.remove("show");
                }
              }
            }
          }
        },
        { signal }
      );
    }

    const dragHandler = (ev) => this._onDragItemStart(ev);
    for (const li of root.querySelectorAll(".item")) {
      li.setAttribute("draggable", "true");
      li.addEventListener("dragstart", dragHandler, { signal });
    }

    this._createActorImageContextMenu(root);

    super.activateListeners?.(root);

    if (!this.isEditable) return;
    // Listeners for editable fields under here. Fields might not be editable because
    // the user viewing the sheet might not have permission to. They may not be the owner.

    for (const input of root.querySelectorAll(
      'input[type="text"], input[type=text]'
    )) {
      input.addEventListener("focusin", () => input.select(), { signal });
    }

    onClick(".item-edit", (event) => this._renderItemCard(event));
    onClick(".roll-critical-injury", () => this._rollCriticalInjury());
    onClick(".fire-checkbox", (event) => this._fireCheckboxToggle(event));
    onClick(".reputation-open-ledger", () => this.showLedger("reputation"));
  }

  /**
   * This is the + or - glyph on the skill and gear tab that hides whole categories of items.
   * It does not hide favorited items.
   *
   * @callback
   * @private
   * @param {*} event - object with details of the event
   */
  _expandButton(event) {
    const btn = event.currentTarget;
    const collapsibleElement = btn.closest(".collapsible");
    if (!collapsibleElement) return;

    for (const el of collapsibleElement.querySelectorAll(".collapse-icon")) {
      el.classList.toggle("hide");
    }
    for (const el of collapsibleElement.querySelectorAll(".expand-icon")) {
      el.classList.toggle("hide");
    }

    const itemOrderedList = collapsibleElement.querySelector(":scope > ol");
    if (itemOrderedList) {
      for (const lineItem of itemOrderedList.querySelectorAll(":scope > li")) {
        if (
          lineItem.classList.contains("item") &&
          !lineItem.classList.contains("favorite")
        ) {
          lineItem.classList.toggle("hide");
        }
      }
    }

    if (this.collapsedSections.includes(btn.id)) {
      this.collapsedSections = this.collapsedSections.filter(
        (sectionName) => sectionName !== btn.id
      );
    } else {
      this.collapsedSections.push(btn.id);
    }
  }

  /**
   * Toggle display of nested installed items on the gear tab.
   *
   * @callback
   * @private
   * @param {*} event - object with details of the event
   */

  async _toggleInstalledVisibility(event) {
    const itemId = SystemUtils.GetEventDatum(event, "data-item-id");
    const installFlags = this.actor.getFlag(game.system.id, "showInstalled");

    const iconElement = event.currentTarget.querySelector("i");
    if (iconElement) {
      iconElement.classList.toggle("fa-flip-vertical");
    }

    const collapsibleContainer = event.currentTarget.closest(".collapsible");
    const installedRow = collapsibleContainer.querySelector(
      `div[data-items-wrapper-for-parent="${itemId}"]`
    );

    installedRow.classList.toggle("item-hidden");

    // Wait for the expand/collapse animation to complete before updating the installFlags (because it re-renders the handlebars)
    installedRow.addEventListener(
      "transitionend",
      async () => {
        // Update the installFlags.
        if (installFlags) {
          installFlags[itemId] = !installFlags[itemId];
          await this.actor.setFlag(
            game.system.id,
            "showInstalled",
            installFlags
          );
        } else {
          await this.actor.setFlag(game.system.id, "showInstalled", {
            [itemId]: true,
          });
        }
      },
      { once: true }
    );
  }

  /**
   * Dispatcher that executes a roll based on the "type" passed in the event
   *
   * @private
   * @callback
   * @param {Object} event - object with details of the event
   */
  async _onRoll(event, rollTypeOverride = null) {
    let rollType =
      rollTypeOverride ?? SystemUtils.GetEventDatum(event, "data-roll-type");
    let cprRoll;
    let item = null;
    switch (rollType) {
      case CPRRolls.rollTypes.DEATHSAVE:
      case CPRRolls.rollTypes.FACEDOWN:
      case CPRRolls.rollTypes.STAT: {
        const rollName = SystemUtils.GetEventDatum(event, "data-roll-title");
        cprRoll = this.actor.createRoll(rollType, rollName);
        break;
      }
      case CPRRolls.rollTypes.ROLEABILITY: {
        const itemId = CPRActorSheet._getItemId(event);
        const rollSubType = SystemUtils.GetEventDatum(
          event,
          "data-roll-subtype"
        );
        const subRoleName = SystemUtils.GetEventDatum(event, "data-roll-title");
        const rollInfo = {
          rollSubType,
          subRoleName,
        };
        item = this.actor.getOwnedItem(itemId);
        cprRoll = item.createRoll(rollType, this.actor, rollInfo);
        break;
      }
      case CPRRolls.rollTypes.SKILL: {
        const itemId = CPRActorSheet._getItemId(event);
        item = this.actor.getOwnedItem(itemId);
        cprRoll = item.createRoll(rollType, this.actor);
        break;
      }
      case CPRRolls.rollTypes.DAMAGE: {
        const itemId = CPRActorSheet._getItemId(event);
        item = this.actor.getOwnedItem(itemId);
        const damageType = this._getFireCheckbox(event);
        cprRoll = item.createRoll(rollType, this.actor, { damageType });
        if (rollType === CPRRolls.rollTypes.AIMED) {
          cprRoll.location =
            this.actor.getFlag(game.system.id, "aimedLocation") || "body";
        }
        break;
      }
      case CPRRolls.rollTypes.ATTACK: {
        const itemId = CPRActorSheet._getItemId(event);
        item = this.actor.getOwnedItem(itemId);
        rollType = this._getFireCheckbox(event);
        cprRoll = item.createRoll(rollType, this.actor);

        // For explosive weapons (grenade/rocket ammo), place the blast template
        // before the roll so players can see the intended target area.
        // On a miss the template can be bounced from the resulting chat card.
        if (canvas?.scene) {
          const ammoVariety = item._getLoadedAmmoProp
            ? item._getLoadedAmmoProp("variety")
            : undefined;
          const { weaponType } = item.system;
          const isExplosive =
            ammoVariety === "grenade" ||
            ammoVariety === "rocket" ||
            weaponType === "grenadeLauncher" ||
            weaponType === "rocketLauncher";

          if (isExplosive) {
            // eslint-disable-next-line no-await-in-loop
            const templateData =
              await AdditionsTemplate.createExplosiveTemplate();
            if (templateData) {
              cprRoll.rollCardExtraArgs.isExplosive = true;
              cprRoll.rollCardExtraArgs.explosiveTemplateId = templateData.id;
              cprRoll.rollCardExtraArgs.explosiveCenterX = templateData.centerX;
              cprRoll.rollCardExtraArgs.explosiveCenterY = templateData.centerY;
              cprRoll.rollCardExtraArgs.explosiveTrueWidth =
                templateData.trueWidth;
              cprRoll.rollCardExtraArgs.explosiveGridSize =
                templateData.gridSize;
            }
          }
        }
        break;
      }
      case CPRRolls.rollTypes.INTERFACEABILITY: {
        const interfaceAbility = SystemUtils.GetEventDatum(
          event,
          "data-interface-ability"
        );
        const cyberdeckId = SystemUtils.GetEventDatum(
          event,
          "data-cyberdeck-id"
        );
        const cyberdeck = this.actor.getOwnedItem(cyberdeckId);
        item = cyberdeck;
        const netRoleItem = this.actor.itemTypes.role.find(
          (r) => r.id === this.actor.system.roleInfo.activeNetRole
        );
        if (!netRoleItem) {
          const error = SystemUtils.Localize(
            "CPR.messages.noNetrunningRoleConfigured"
          );
          SystemUtils.DisplayMessage("error", error);
          return;
        }
        cprRoll = cyberdeck.createRoll(rollType, this.actor, {
          interfaceAbility,
          cyberdeck,
          netRoleItem,
        });
        break;
      }
      case CPRRolls.rollTypes.CYBERDECKPROGRAM: {
        const programId = SystemUtils.GetEventDatum(event, "data-program-id");
        const cyberdeckId = SystemUtils.GetEventDatum(
          event,
          "data-cyberdeck-id"
        );
        const executionType = SystemUtils.GetEventDatum(
          event,
          "data-execution-type"
        );
        const cyberdeck = this.actor.getOwnedItem(cyberdeckId);
        item = cyberdeck;
        const netRoleItem = this.actor.itemTypes.role.find(
          (r) => r.id === this.actor.system.roleInfo.activeNetRole
        );
        if (!netRoleItem) {
          const error = SystemUtils.Localize(
            "CPR.messages.noNetrunningRoleConfigured"
          );
          SystemUtils.DisplayMessage("error", error);
          return;
        }
        const extraData = {
          cyberdeckId,
          programId,
          executionType,
          netRoleItem,
        };
        cprRoll = cyberdeck.createRoll(rollType, this.actor, extraData);
        break;
      }
      default:
    }

    if (!cprRoll) {
      LOGGER.warn(
        `Unable to create roll for type "${rollType ?? "unknown"}" on ${
          this.actor.name
        }`
      );
      return;
    }

    // note: for aimed shots this is where location is set
    const keepRolling = await cprRoll.handleRollDialog(event, this.actor, item);
    if (!keepRolling) {
      return;
    }

    if (item !== null) {
      // Do any actions that need to be done as part of a roll, like ammo decrementing
      cprRoll = await item.confirmRoll(cprRoll);
    }

    // Let's roll!
    await cprRoll.roll();

    // Post roll tasks
    if (cprRoll instanceof CPRRolls.CPRDeathSaveRoll) {
      cprRoll.saveResult = this.actor.processDeathSave(cprRoll);
    }

    // "Consume" LUCK if used
    if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
      const luckStat = this.actor.system.stats.luck.value;
      this.actor.update({
        "system.stats.luck.value":
          luckStat - (cprRoll.luck > luckStat ? luckStat : cprRoll.luck),
      });
    }

    // output to chat
    const token = this.token === null ? null : this.token._id;
    const targetedTokens = SystemUtils.getUserTargetedOrSelected("targeted"); // get user targeted tokens for output to chat

    cprRoll.entityData = {
      actor: this.actor.id,
      token,
      tokens: targetedTokens,
    };
    if (item) {
      cprRoll.entityData.item = item.id;
    }
    CPRChat.RenderRollCard(cprRoll);

    // save the location so subsequent damage rolls hit/show the same place
    if (cprRoll instanceof CPRRolls.CPRAimedAttackRoll) {
      this.actor.setFlag(game.system.id, "aimedLocation", cprRoll.location);
    }
  }

  /**
   * Callback for the checkboxes that control weapon fire modes
   *
   * @callback
   * @private
   * @param {Object} event - object with details of the event
   * @returns {CPRRoll}
   */
  _getFireCheckbox(event) {
    const weaponID = SystemUtils.GetEventDatum(event, "data-item-id");
    const box = this.actor.getFlag(game.system.id, `firetype-${weaponID}`);
    if (box) {
      return box;
    }
    return CPRRolls.rollTypes.ATTACK;
  }

  /**
   * Callback for increasing an actor's death save
   *
   * @callback
   * @private
   */
  _increaseDeathSave() {
    this.actor.increaseDeathPenalty();
  }

  /**
   * Callback for reseting an actor's death save
   *
   * @callback
   * @private
   */
  _resetDeathSave() {
    this.actor.resetDeathPenalty();
  }

  /**
   * Callback for ablating armor
   *
   * @async
   * @private
   * @callback
   * @param {Object} event - object with details of the event
   */
  async _ablateArmor(event) {
    const location = SystemUtils.GetEventDatum(event, "data-location");
    this.actor._ablateArmor(location, 1);
  }

  /**
   * As a first step to re-organizing the methods to the appropriate, objects (Actor/Item),
   * we filter calls to manipulate items through here.  Things such as:
   *  Weapon: Load, Unload
   *  Armor: Ablate, Repair
   *
   * @async
   * @private
   * @callback
   * @param {event} event - object capturing event data (what was clicked and where?)
   */
  async _itemAction(event) {
    const item = this.actor.getOwnedItem(CPRActorSheet._getItemId(event));
    const actionType = SystemUtils.GetEventDatum(event, "data-action-type");
    if (item) {
      switch (actionType) {
        case "delete": {
          await this._deleteOwnedItem(item);
          break;
        }
        case "ablate-armor": {
          item.ablateArmor();
          break;
        }
        case "favorite": {
          item.toggleFavorite();
          break;
        }
        case "manage-upgrades": {
          await item.sheet._manageInstalledItems("itemUpgrade");
          break;
        }
        case "manage-programs": {
          await item.sheet._manageInstalledItems("program");
          break;
        }
        case "split": {
          this._splitItem(item);
          break;
        }
        case "cycle-equip": {
          if (typeof this._cycleEquipState === "function") {
            event.preventDefault?.();
            this._cycleEquipState(event);
          }
          return;
        }
        case "repair-armor": {
          if (typeof this._repairArmor === "function") {
            event.preventDefault?.();
            this._repairArmor(event);
          }
          return;
        }
        case "snort": {
          // consume a drug
          item.snort();
          break;
        }
        case "install-item": {
          item.install();
          break;
        }
        case "uninstall-item": {
          item.uninstall();
          break;
        }
        case "dv-ruler": {
          if (item.system?.dvTable !== "") {
            await item.doAction(this.actor, event.currentTarget.attributes);
            await this._setDvIconState(item);
            if (!this._resolveDvTargetToken()) {
              SystemUtils.DisplayMessage(
                "warn",
                SystemUtils.Localize(
                  "CPR.messages.warningTokenNotSelectedForDV"
                )
              );
            }
          }

          break;
        }
        default: {
          item.doAction(this.actor, event.currentTarget.attributes);
        }
      }
      // Only update if we aren't deleting the item.  Item deletion is handled in this._deleteOwnedItem()
      if (actionType !== "delete") {
        this.actor.updateEmbeddedDocuments("Item", [
          { _id: item.id, system: item.system },
        ]);
      }
    }
  }

  /**
   * When clicking the DV ruler, we want to highlight the active ruler.
   *
   * @async
   * @private
   * @callback
   * @param {CPRItem} item - item we are activating the DV Ruler for
   */
  async _setDvIconState(item) {
    const sheetRoot = resolveSheetRoot(this.element);
    if (!sheetRoot) return this.render();

    const dvGlyphs = sheetRoot.querySelectorAll(".dv-glyph");
    const targetToken = this._resolveDvTargetToken();
    const tokenDocument = targetToken?.document ?? this.token ?? null;
    const dvFlag = tokenDocument?.getFlag(game.system.id, "cprDvTable");
    const dvFlagSet = dvFlag?.name !== "";

    for (const glyphNode of dvGlyphs) {
      const weaponId = glyphNode.getAttribute("data-item-id");
      if (weaponId === item._id && dvFlagSet) {
        glyphNode.classList.add("dv-active");
      } else {
        glyphNode.classList.remove("dv-active");
      }
    }

    return this.render();
  }

  _resolveDvTargetToken() {
    const sheetTokenId = this.token?.id ?? this.token?._id;
    if (sheetTokenId) {
      return canvas.tokens?.get(sheetTokenId) ?? this.token?.object ?? null;
    }

    const matchingControlled = canvas?.tokens?.controlled?.filter(
      (token) => token.actor?.id === this.actor?.id
    );
    if (matchingControlled?.length === 1) {
      return matchingControlled[0];
    }

    return null;
  }

  /**
   * This is the callback for setting armor as "current", which is the star glyph. Setting this enables
   * the SP of the armor to be tracked as a resource bar on the corresponding token.
   *
   * @callback
   * @private
   * @param {} event - object capturing event data (what was clicked and where?)
   */
  _makeArmorCurrentTrack(event) {
    const location = SystemUtils.GetEventDatum(event, "data-location");
    const id = SystemUtils.GetEventDatum(event, "data-item-id");
    this.actor.updateTrackedArmor(location, id);
  }

  /**
   * This is the callback for setting armor as untracked, which is the star glyph. This
   * removes the tracking of the armor from the token.
   *
   * @callback
   * @private
   * @param {} event - object capturing event data (what was clicked and where?)
   */
  _makeArmorCurrentUntrack(event) {
    const location = SystemUtils.GetEventDatum(event, "data-location");
    this.actor.updateTrackedArmor(location);
  }

  /**
   * Update a property of an Item that is owned by this actor. There is a round trip to the
   * Foundry server with this call, so do not over use it.
   *
   * @private
   * @param {Item} item - object to be updated
   * @param {String} prop - property to be updated in a dot notation (e.g. "item.name")
   * @param {*} value - value to set the property to
   */
  static _updateOwnedItemProp(item, prop, value) {
    item.update({ [prop]: value });
  }

  /**
   * Update an Item owned by this actor. There is a round trip to the Foundry server with this
   * call, so do not over use it in your code.
   *
   * @private
   * @param {Item} item - the updated object to replace in-line
   * @returns - the updated object (document) or array of entities
   */
  _updateOwnedItem(item) {
    return this.actor.updateEmbeddedDocuments("Item", [
      { _id: item.id, system: item.system },
    ]);
  }

  /**
   * Render the item card (chat message) when ctrl-click happens on an item link, or display
   * the item sheet if ctrl was not pressed.
   * To support shift-click in the cpr-mook-sheet, it expects any other event to not be a shift key.
   *
   * @private
   * @callback
   * @param {Object} event - object capturing event data (what was clicked and where?)
   */
  _renderItemCard(event) {
    const itemId = CPRActorSheet._getItemId(event);
    const item = this.actor.getOwnedItem(itemId);
    if (event.ctrlKey) {
      CPRChat.RenderItemCard(item);
      return;
    }
    if (!event.shiftKey) {
      item.sheet.render(true, { editable: true });
    }
  }

  /**
   * Render an item sheet in read-only mode, which is used on installed cyberware. This is to
   * prevent a user from editing data while it is installed, such as the foundation type.
   *
   * @private
   * @callback
   * @param {Object} event - object capturing event data (what was clicked and where?)
   */
  _renderReadOnlyItemCard(event) {
    const itemId = CPRActorSheet._getItemId(event);
    const item = this.actor.getOwnedItem(itemId);
    if (event.ctrlKey) {
      CPRChat.RenderItemCard(item);
      return;
    }
    if (!event.shiftKey) {
      item.sheet.render(true, { editable: false });
    }
  }

  /**
   * Get an itemId if specified as an attribute of a clicked link.
   * TODO: this may belong in a cpr-templateutils.js library
   *
   * @private
   * @static
   * @param {Object} event - the event object to inspect
   * @returns {String} - the string Id of the item
   */
  static _getItemId(event) {
    let id = SystemUtils.GetEventDatum(event, "data-item-id");
    if (id == null) {
      id =
        event?.currentTarget
          ?.closest?.("[data-item-id]")
          ?.getAttribute("data-item-id") ?? undefined;
    }
    if (id == null) {
      LOGGER.debug(`Could not find data-item-id in the event data!`);
    }
    return id;
  }

  /**
   * Often clickable elements in a sheet reference a complex object on the actor or item.
   * When a property deep in the object needs to be retrieved, a "property-string" is provided
   * for use with the object. This method retrieve that property-string from an attribute in
   * the link. Therefore this method is often pared with _getItemId since it is the first step
   * to getting the object with the property we want.
   *
   * TODO: this may belong in a cpr-templateutils.js library
   *
   * @private
   * @static
   * @param {Object} event - the event object to inspect
   * @returns {String} - the property string
   */
  static _getObjProp(event) {
    return SystemUtils.GetEventDatum(event, "data-item-prop");
  }

  /**
   * Delete an Item owned by the actor.
   *
   * @private
   * @async
   * @param {Item} item - the item to be deleted
   * @param {Boolean} skipConfirm - bypass rendering the confirmation dialog box
   * @returns {null}
   */
  async _deleteOwnedItem(item, skipConfirm = false) {
    const setting = game.settings.get(game.system.id, "deleteItemConfirmation");
    // If item is installed, show dialog to make sure user understands it will be uninstalled
    if (item.system.isInstalled && !skipConfirm) {
      // Create list of names of items that this item is installed in..
      const installedInSlug = item.system.installedIn
        .map((id) => this.actor.getOwnedItem(id))
        .map((i) => i.name)
        .reduce((accumulator, name) => `${accumulator}, ${name}`);
      const dialogMessage = `${SystemUtils.Localize(
        "CPR.dialog.deleteInstalledConfirmation.message"
      )} ${installedInSlug}`;

      // Show "Default" dialog.
      const confirmDelete = await CPRDialog.showDialog(
        { dialogMessage },
        // Set the options for the dialog.
        {
          title: SystemUtils.Localize(
            "CPR.dialog.deleteInstalledConfirmation.title"
          ),
        }
      ).catch((err) => LOGGER.debug(err));

      if (!confirmDelete) {
        return;
      }
      // If item isn't installed, the setting is on, and internally we do not want to skip it,
      // show the delete confirmation.
    } else if (setting && !skipConfirm) {
      const dialogMessage = `${SystemUtils.Localize(
        "CPR.dialog.deleteConfirmation.message"
      )} ${item.name}?`;

      // Show "Default" dialog.
      const confirmDelete = await CPRDialog.showDialog(
        { dialogMessage },
        // Set the options for the dialog.
        { title: SystemUtils.Localize("CPR.dialog.deleteConfirmation.title") }
      ).catch((err) => LOGGER.debug(err));

      if (!confirmDelete) {
        return;
      }
    }

    // `updateTrackedArmor` doesn't exist on Container Actors
    if (item.type === "armor" && this.actor.type !== "container") {
      if (item.system.isTracked) {
        if (item.system.isHeadLocation) {
          // Removes armor values for head armor if the body armor is deleted.
          this.actor.updateTrackedArmor("head");
        } else if (item.system.isBodyLocation) {
          // Removes armor values for body armor if the head armor is deleted.
          this.actor.updateTrackedArmor("body");
        } else if (item.system.isShield) {
          // Removes armor values for shield if the shield is deleted.
          this.actor.updateTrackedArmor("shield");
        }
      }
    }

    if (item.type === "cyberdeck") {
      // Set all of the owned programs that were installed on
      // this cyberdeck to unrezzed.
      const programs = item.system.installedPrograms;
      const updateList = [];
      programs.forEach((p) => {
        const program = this.actor.getOwnedItem(p.id);
        updateList.push({
          _id: program._id,
          "system.isRezzed": false,
        });
      });
      await this.actor.updateEmbeddedDocuments("Item", updateList);
    }

    let deleteInstalled = false;
    let deleteList = [item.id];
    if (item.system.hasInstalled) {
      const formData = await ContainerUtils.confirmContainerDelete(item);
      if (!formData) return;
      deleteInstalled = formData.deleteInstalled;
      if (deleteInstalled) {
        const deleteItems = item
          .recursiveGetAllInstalledItems()
          .map((i) => i.id);
        deleteList = deleteList.concat(deleteItems);
      }
    }

    await this.actor.deleteEmbeddedDocuments("Item", deleteList, {
      deleteInstalled,
    });
  }

  /**
   * Handle a fire mode checkbox being clicked. This will clear the others and set a Flag on the actor
   * to indicate what was selected when an attack was made. Flags are a Foundry feature on Actors/Items.
   *
   * @private
   * @callback
   * @param {Object} event - object capturing event data (what was clicked and where?)
   */
  async _fireCheckboxToggle(event) {
    const weaponID = SystemUtils.GetEventDatum(event, "data-item-id");
    const firemode = SystemUtils.GetEventDatum(event, "data-fire-mode");
    const flag = foundry.utils.getProperty(
      this.actor,
      `flags.${game.system.id}.firetype-${weaponID}`
    );

    LOGGER.debug(`firemode is ${firemode}`);
    LOGGER.debug(`weaponID is ${weaponID}`);
    LOGGER.debug(`flag is ${flag}`);

    if (this.token && firemode === "autofire") {
      const weapon = this.actor.items.get(weaponID);
      const weaponDvTable = weapon?.system.dvTable ?? "";
      const currentDvTable =
        weaponDvTable === ""
          ? foundry.utils.getProperty(this.token.document, "flags.cprDvTable")
          : weaponDvTable;

      if (currentDvTable) {
        const dvTableName = currentDvTable.replace(" (Autofire)", "");
        const dvTables = await SystemUtils.GetDvTables();
        const afTable = dvTables.find(
          (table) =>
            table.name.includes(dvTableName) && table.name.includes("Autofire")
        );

        let newDvTable = currentDvTable;
        if (afTable) {
          newDvTable = flag === firemode ? dvTableName : afTable.name;
        }
        await this.token.update({ "flags.cprDvTable": newDvTable });
      }
    }

    if (flag === firemode) {
      // if the flag was already set to firemode, that means we unchecked a box
      await this.actor.unsetFlag(game.system.id, `firetype-${weaponID}`);
    } else {
      await this.actor.setFlag(
        game.system.id,
        `firetype-${weaponID}`,
        firemode
      );
    }
  }

  /**
   * Pop up a dialog box asking which critical injury table to use and return the user's answer.
   *
   * @async
   * @private
   * @returns {String} - chosen name of the rollable table to be used for critical injuries
   */
  static async _setCriticalInjuryTable(tableSetting) {
    const critInjuryTables = await SystemUtils.GetCompendiumDocs(tableSetting);
    const tableNames = critInjuryTables.map((t) => t.name).sort();
    const currentTable = 0;

    // Show "Roll Critical Injury" dialog.
    const formData = await CPRDialog.showDialog(
      { tableNames, currentTable },
      {
        // Set options for the dialog.
        title: SystemUtils.Localize(
          "CPR.dialog.rollCriticalInjury.criticalinjurytitleprompt"
        ),
        template: `systems/${game.system.id}/templates/dialog/cpr-roll-critical-injury-prompt.hbs`,
      }
    ).catch((err) => LOGGER.debug(err));
    if (formData === undefined) {
      return undefined;
    }
    return tableNames[formData.currentTable];
  }

  /**
   * Roll a critical injury. This is the top-level event handler for the sheet.
   *
   * @async
   * @callback
   * @private
   */
  async _rollCriticalInjury() {
    const tableSetting = game.settings.get(
      game.system.id,
      "criticalInjuryRollTableCompendium"
    );
    const tableName = await CPRActorSheet._setCriticalInjuryTable(tableSetting);
    if (tableName === undefined) {
      return;
    }
    const rollTable = await SystemUtils.GetCompendiumDoc(
      tableSetting,
      tableName
    );
    const injuryCompName = SystemUtils.GetCompendiumIdByLabel(tableName);
    this._drawCriticalInjuryTable(rollTable, injuryCompName, 0);
  }

  /**
   * Roll on the given critical injury table. Some heuristics are going on to handle user settings where
   * they do not want duplicate results on a character. When that happens, reroll by recursively calling
   * this method. There is cap to prevent recursing too much or if there are unreachable entries on the
   * table.
   *
   * @param {RollTable} table - the rollable table to draw from (roll on), pulled from a compendium
   * @param {Number} iteration - the number of times the injury table has been rolled. This is here as
   *                             a safety mechanism for malformed custom tables that have unreachable
   *                             results. This can happen if the formula is wrong.
   * @returns {null}
   */
  async _drawCriticalInjuryTable(table, injuryCompName, iteration) {
    const dupeSetting = game.settings.get(
      game.system.id,
      "preventDuplicateCriticalInjuries"
    );

    // check how many times we've been rolling. If this gets excessive maybe something is wrong with the table.
    if (iteration > 1000) {
      SystemUtils.DisplayMessage(
        "error",
        SystemUtils.Localize("CPR.messages.criticalInjuryDuplicateLoopWarning")
      );
      return;
    }

    // check that the table has critical injuries that could still be applied
    let hurts = 0;
    for (const injury of table.results) {
      if (
        this.actor.itemTypes.criticalInjury.filter(
          (i) => i.name === injury.text
        ).length > 0
      ) {
        hurts += 1;
      } else {
        // there is at least 1 injury on this table the actor does not have yet
        break;
      }
    }
    if (hurts === table.results.size && dupeSetting === "reroll") {
      // actor has every injury already, we cannot reroll for more
      SystemUtils.DisplayMessage(
        "warn",
        SystemUtils.Localize("CPR.messages.criticalInjuryDuplicateAllWarning")
      );
      return;
    }

    let injury;
    table.draw({ displayChat: false }).then(async (res) => {
      if (res.results.length !== 1) {
        return;
      }
      // find the critical injury item that turned up in the roll
      const injuryName = res.results[0].text;
      injury = await SystemUtils.GetCompendiumDoc(injuryCompName, injuryName);
      if (!injury) {
        SystemUtils.DisplayMessage(
          "warn",
          SystemUtils.Localize(
            "CPR.dialog.rollCriticalInjury.criticalInjuryNoneWarning"
          )
        );
        return;
      }

      // check whether the actor has this injury already
      if (
        this.actor.itemTypes.criticalInjury.find((i) => i.name === injuryName)
      ) {
        if (dupeSetting === "reroll") {
          await this._drawCriticalInjuryTable(
            table,
            injuryCompName,
            iteration + 1
          );
          return;
        }
        if (dupeSetting === "warn") {
          SystemUtils.DisplayMessage(
            "warn",
            SystemUtils.Localize("CPR.messages.criticalInjuryDuplicateWarning")
          );
        }
      }

      const cprItemData = {
        name: injury.name,
        type: injury.type,
        img: injury.img,
        system: foundry.utils.duplicate(injury.system),
        effects: foundry.utils.duplicate(injury.effects),
      };
      const result = await this.actor.createEmbeddedDocuments("Item", [
        cprItemData,
      ]);
      const cprRoll = new CPRRolls.CPRTableRoll(
        injury.name,
        res.roll,
        `systems/${game.system.id}/templates/chat/cpr-critical-injury-rollcard.hbs`
      );

      // Creates card data for critical injury, entityData.actor and entityData.token are vestigial since they're
      // not used in the critical injury rollcard but are required for the CPRChat.RenderRollCard function
      cprRoll.rollCardExtraArgs.tableName = table.name;
      cprRoll.rollCardExtraArgs.itemName = result[0].name;
      cprRoll.rollCardExtraArgs.itemImg = result[0].img;
      if (this.token) {
        cprRoll.entityData = {
          actor: this.actor.id,
          token: this.token.id,
          item: injury.name,
          comp: injuryCompName,
        };
      } else {
        cprRoll.entityData = {
          actor: this.actor.id,
          item: injury.name,
          comp: injuryCompName,
        };
      }
      CPRChat.RenderRollCard(cprRoll);
    });
  }

  /**
   * Ledger methods
   * For the most part ledgers are character-specific - they provide records of change to EB, IP and Reputation.
   * Mooks use this for Reputation too, and that's the only reason these remain here.
   */

  /**
   * Provide an Array of values and reasons the EB has changed. Together this is the "ledger", a
   * collection of records for EB changes.
   *
   * @private
   * @returns {Array} - the records
   */
  _listEbRecords() {
    return this.actor.listRecords("wealth");
  }

  /**
   * Clear all EB records, effectively setting it back to 0.
   *
   * @private
   * @returns - any empty Array, or null if unsuccessful
   */
  _clearEbRecords() {
    return this.actor.clearLedger("wealth");
  }

  /**
   * Set the value in a ledger on the actor to a specific value, with a reason.
   *
   * @private
   * @param {String} ledgerName - The name of the ledger
   * @param {Number} value - the value to set IP to
   * @param {String} reason - a freeform comment of why the IP is changing to the given value
   * @returns - the modified property or null if it was unsuccessful
   */
  _setLedger(ledgerName, value, reason) {
    LOGGER.debug(`setting ${ledgerName} to ${value}`);
    return this.actor.setLedgerProperty(ledgerName, value, reason);
  }

  /**
   * Increase ledger value by an amount, with a reason
   *
   * @private
   * @param {String} ledgerName - The name of the ledger
   * @param {Number} value - the value to increase IP by
   * @param {String} reason - a freeform comment of why the IP is changing to the given value
   * @returns - the modified property or null if it was unsuccessful
   */
  _gainLedger(ledgerName, value, reason) {
    return this.actor.deltaLedgerProperty(ledgerName, value, reason);
  }

  /**
   * Reduce ledger value by an amount, with a reason
   *
   * @private
   * @param {String} ledgerName - The name of the ledger
   * @param {Number} value - the value to reduce IP to
   * @param {String} reason - a freeform comment of why the IP is changing to the given value
   * @returns - the modified property or null if it was unsuccessful
   */
  _loseLedger(ledgerName, value, reason) {
    const resultantValue = this.actor.system[ledgerName].value - value;
    let rulesWarning = "";
    switch (ledgerName) {
      case "improvementPoints": {
        rulesWarning = "CPR.messages.warningNotEnoughIp";
        break;
      }
      case "wealth": {
        rulesWarning = "CPR.messages.warningNotEnoughEb";
        break;
      }
      case "reputation": {
        rulesWarning = "CPR.messages.warningNotEnoughReputation";
        break;
      }
      default: {
        break;
      }
    }
    Rules.lawyer(resultantValue > 0, rulesWarning);
    let tempVal = value;
    if (tempVal > 0) {
      tempVal = -tempVal;
    }

    const ledgerProp = this.actor.deltaLedgerProperty(
      ledgerName,
      tempVal,
      reason
    );
    return ledgerProp;
  }

  /**
   * Pop up a dialog box with ledger records for a given property.
   *
   * @param {String} prop - name of the property that has a ledger
   */
  async showLedger(prop) {
    if (this.actor.isLedgerProperty(prop)) {
      await CPRLedger.showDialog(this.actor, prop).catch((err) =>
        LOGGER.debug(err)
      );
    } else {
      SystemUtils.DisplayMessage(
        "error",
        SystemUtils.Localize("CPR.messages.ledgerErrorIsNoLedger")
      );
    }
  }

  /**
   * Provide an Array of values and reasons IP has changed. Together this is the "ledger", a
   * collection of records for IP changes.
   *
   * @private
   * @returns {Array} - the records
   */
  _listIpRecords() {
    return this.actor.listRecords("improvementPoints");
  }

  /**
   * Clear all IP records, effectively setting it back to 0.
   *
   * @private
   * @returns - any empty Array, or null if unsuccessful
   */
  _clearIpRecords() {
    return this.actor.clearLedger("improvementPoints");
  }

  /**
   * Called when an Item is dragged on the ActorSheet. This "stringifies" the Item into attributes
   * that can be inspected later. Doing so allows the system to make changes to the item before/after it
   * is added to the Actor's inventory.
   *
   * @private
   * @param {Object} event - an object capturing event details
   */
  _onDragItemStart(event) {
    const itemId = SystemUtils.GetEventDatum(event, "data-item-id");
    const item = this.actor.getEmbeddedDocument("Item", itemId);
    const tokenId = this.token === null ? null : this.token.id;
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        type: "Item",
        uuid: item.uuid,
        system: {
          actorId: this.actor._id,
          tokenId,
          data: item,
          root: SystemUtils.GetEventDatum(event, "root"),
        },
      })
    );
  }

  /**
   * _onDrop is provided by Foundry and extended here. When an Item is dragged to an ActorSheet a new copy is created.
   * This extension ensure that the copy is owned by the right actor afterward. In the case that an item is dragged from
   * one Actor sheet to another, the item on the source sheet is deleted, simulating an actor giving an item to another
   * actor.
   *
   * @private
   * @override
   * @param {Object} event - an object capturing event details
   * @returns {null}
   */
  async _onDrop(event) {
    const dragData = TextEditor.getDragEventData(event);
    return dragData.type === "Item"
      ? this._cprOnItemDrop(event)
      : super._onDrop(event);
  }

  async _cprOnItemDrop(event) {
    const dragData = TextEditor.getDragEventData(event);
    let sourceActor;
    const sourceItem = fromUuidSync(dragData.uuid);
    if (!sourceItem) {
      return super._onDrop(event);
    }
    if (sourceItem.type === "cyberware" && sourceItem.system?.isInstalled) {
      SystemUtils.DisplayMessage(
        "error",
        SystemUtils.Localize("CPR.messages.tradeDragInstalledCyberwareError")
      );
      return null;
    }
    const transferItem =
      dragData.system && dragData.system.actorId !== undefined;
    if (transferItem) {
      // Transfer ownership from one player to another
      sourceActor = Object.keys(game.actors.tokens).includes(
        dragData.system.tokenId
      )
        ? game.actors.tokens[dragData.system.tokenId]
        : game.actors.find((a) => a.id === dragData.system.actorId);
      if (sourceActor.type === "container" && !game.user.isGM) {
        SystemUtils.DisplayMessage(
          "warn",
          SystemUtils.Localize("CPR.messages.tradeDragOutWarn")
        );
        return null;
      }
      if (sourceActor) {
        // Do not move if the data is moved to itself
        if (sourceActor._id === this.actor._id) {
          return null;
        }

        // If the cyberware is marked as core, or is installed, throw an error message.
        if (
          sourceItem.system.core === true ||
          (sourceItem.system.type === "cyberware" &&
            sourceItem.system.isInstalled)
        ) {
          SystemUtils.DisplayMessage(
            "error",
            SystemUtils.Localize("CPR.messages.cannotDropInstalledCyberware")
          );
          return null;
        }
      }
    }

    const deleteList = transferItem ? [sourceItem._id] : [];
    const containerTypes = SystemUtils.getDocTypesFromMixin("container");
    const safeContainerTypes = Array.isArray(containerTypes)
      ? containerTypes
      : [];

    const itemCountBefore = this.actor.items.size;
    const dropResult = await super._onDrop(event);
    const newItem = Array.isArray(dropResult)
      ? dropResult[0]
      : dropResult ?? null;
    const itemCountAfter = this.actor.items.size;
    LOGGER.warn(
      `_cprOnItemDrop: super._onDrop returned ${
        newItem ? `item "${newItem.name}" [${newItem.type}]` : "nothing"
      } for actor "${this.actor.name}" (type=${
        this.actor.type
      }); item count before=${itemCountBefore}, after=${itemCountAfter}`
    );
    // If nothing was returned but an item count didn't change even after a
    // short delay, creation genuinely never happened (vs. a fire-and-forget
    // creation that finishes slightly after this promise resolves).
    if (!newItem) {
      setTimeout(() => {
        LOGGER.warn(
          `_cprOnItemDrop: (delayed check) actor "${this.actor.name}" item count is now ${this.actor.items.size} (was ${itemCountBefore} before drop)`
        );
      }, 1000);
    }

    // If we created a new item and the sourceItem is a container type the createItem hook ensures all of the
    // installed items are also created on the target actor. We need to ensure that those items are
    // deleted from the source actor.
    if (
      newItem &&
      safeContainerTypes.includes(sourceItem.type) &&
      sourceItem.isOwned &&
      sourceItem.system.hasInstalled
    ) {
      const deleteItemList = sourceItem.recursiveGetAllInstalledItems();
      const safeDeleteItemList = Array.isArray(deleteItemList)
        ? deleteItemList
        : [];
      for (const item of safeDeleteItemList) {
        // Delete non-ammo items.
        if (item.type !== "ammo") deleteList.push(item._id);
        // Only delete ammo items if they have a non-zero stack size.
        if (item.type === "ammo" && item.system.amount === 0)
          deleteList.push(item._id);
      }
    }

    if (newItem && transferItem) {
      await sourceActor.deleteEmbeddedDocuments("Item", deleteList, {
        // Don't unload the ammo when we are transferring weapons. Leave ammo stack as-is.
        unloadAmmo: false,
        // Delete nested installed items.
        deleteInstalled: true,
      });
    }

    return newItem;
  }

  /**
   * _splitItem splits an item into multiple items if possible.
   * It also adjusts the price accordingly.
   *
   * @param {Object} item - an object containing the new item
   * @returns {null}
   */
  async _splitItem(item) {
    if (item.system.installedUpgrades?.length !== 0) {
      SystemUtils.DisplayMessage(
        "warn",
        SystemUtils.Format("CPR.dialog.splitItem.warningUpgrade")
      );
    }

    // Prepare data for dialog.
    const dialogData = {
      header: SystemUtils.Format("CPR.dialog.splitItem.text", {
        amount: item.system.amount,
        itemName: item.name,
      }),
      splitAmount: Math.ceil(item.system.amount / 2),
    };

    // Show "Split Item" dialog.
    const formData = await CPRDialog.showDialog(
      dialogData,
      // Set options for the dialog.
      {
        title: SystemUtils.Localize("CPR.dialog.splitItem.title"),
        template: `systems/${game.system.id}/templates/dialog/cpr-split-item-prompt.hbs`,
      }
    ).catch((err) => LOGGER.debug(err));
    if (formData === undefined) {
      return;
    }
    const oldAmount = parseInt(item.system.amount, 10);
    if (formData.splitAmount <= 0 || formData.splitAmount >= oldAmount) {
      const warningMessage = SystemUtils.Format(
        "CPR.dialog.splitItem.warningAmount",
        {
          amountSplit: formData.splitAmount,
          amountOld: oldAmount,
          itemName: item.name,
        }
      );
      SystemUtils.DisplayMessage("warn", warningMessage);
      return;
    }
    const newAmount = oldAmount - formData.splitAmount;
    const cprNewItemData = foundry.utils.duplicate(item.system);
    cprNewItemData.amount = formData.splitAmount;
    delete cprNewItemData._id;
    const cprNewItemEffects = foundry.utils.duplicate(item.effects);
    delete cprNewItemEffects._id;
    await this.actor.updateEmbeddedDocuments("Item", [
      { _id: item.id, "system.amount": newAmount },
    ]);
    await this.actor.createEmbeddedDocuments(
      "Item",
      [
        {
          name: item.name,
          type: item.type,
          img: item.img,
          system: cprNewItemData,
          effects: cprNewItemEffects,
        },
      ],
      { CPRsplitStack: true }
    );
  }

  /**
   * Sets up a ContextMenu that appears when the Actor's image is right clicked.
   * Enables the user to share the image with other players.
   *
   * @param {Object} html - The DOM object
   * @returns {ContextMenu} The created ContextMenu
   */
  _createActorImageContextMenu(html) {
    const root = resolveSheetRoot(html) ?? resolveSheetRoot(this.element);
    if (!root) return undefined;
    return createImageContextMenu([root], ".image-block", this.actor);
  }

  /**
   * _applyContentFilter is used to filter data content on the actor sheet
   * to make locating things, such as skills or gear easier
   *
   * @private
   * @param {Object} event - an object capturing event details
   */
  async _applyContentFilter(event) {
    const filterValue = event.currentTarget.value;
    const sheetRoot =
      resolveSheetRoot(this.element) ??
      (this.element instanceof HTMLElement ? this.element : null);
    const num = sheetRoot?.querySelector(".filter-contents")?.value ?? "";
    this.cprContentFilter = filterValue;
    await this.render(true);
    const sheetRootAfter =
      resolveSheetRoot(this.element) ??
      (this.element instanceof HTMLElement ? this.element : null);
    const inp = sheetRootAfter?.querySelector(".filter-contents");
    if (inp) {
      inp.focus();
      inp.value = "";
      inp.value = num;
    }
  }

  /**
   * _clearContentFilter is used to clear the filter used on the sheet
   * This is called when the tabs change if a filter is set.
   *
   * @private
   * @param {Object} event - an object capturing event details
   */
  async _clearContentFilter() {
    if (
      typeof this.cprContentFilter !== "undefined" &&
      this.cprContentFilter !== ""
    ) {
      this.cprContentFilter = "";
      await this.render(true);
    }
  }

  /**
   * Create an item in the inventory of the actor. The templates will hide this functionality
   * if the GMs does not want to permit players to create their own items.
   *
   * @private
   * @callback
   * @param {Object} event - object capturing event data (what was clicked and where?)
   */
  async _createInventoryItem(event) {
    const itemType = SystemUtils.GetEventDatum(event, "data-item-type");
    const itemString = `TYPES.Item.${itemType}`;
    const itemName = SystemUtils.Format("CPR.actorSheets.commonActions.new", {
      item: SystemUtils.Localize(itemString),
    });
    const itemImage = SystemUtils.GetDefaultImage("Item", itemType);
    const itemData = { img: itemImage, name: itemName, type: itemType };
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Called when the uninstall item glyph is clicked (the minus folder).
   *
   * @param {*} event - object capturing event data (what was clicked and where?)
   * @returns {Promise<null>}
   */
  async _uninstallSingleItem(event) {
    // Get the item being uninstalled.
    const installedItemId = SystemUtils.GetEventDatum(event, "data-item-id");
    const installedItem = this.actor.getOwnedItem(installedItemId);

    // Get the container item that has has the above item installed, if provided.
    const containerId = SystemUtils.GetEventDatum(event, "data-direct-parent");
    const container = this.actor.getOwnedItem(containerId);

    // If a specific container item is provided, uninistall just from that container.
    // Else, uninstall from all locations.
    return container
      ? installedItem.uninstall({ providedContainers: [container] })
      : installedItem.uninstall();
  }

  /**
   * Header menu: import character data from cyberpunkred.com onto this actor.
   *
   * @param {PointerEvent} event
   */
  static async #onImportCyberpunkRedCom(event) {
    event?.preventDefault();
    if (!game.user.can("FILES_UPLOAD")) return;
    const actor = this.document;
    if (!actor || (actor.type !== "character" && actor.type !== "mook")) {
      return;
    }
    try {
      if (!game.cpr?.api?.import?.runImportFlow) {
        ui.notifications.error(
          SystemUtils.Localize("CPR.import.cyberpunkredCom.apiUnavailable")
        );
        return;
      }
      const imported = await game.cpr.api.import.runImportFlow({
        mode: "import",
        actor,
      });
      if (imported) {
        imported.sheet?.render(true);
      }
    } catch (err) {
      LOGGER.error(err);
      ui.notifications.error(
        SystemUtils.Localize("CPR.import.cyberpunkredCom.failed", {
          name: actor.name,
        })
      );
    }
  }

  /**
   * Add cyberpunkred.com import to the sheet header menu (character/mook only).
   *
   * @protected
   * @returns {foundry.applications.types.ApplicationHeaderControlsEntry[]}
   */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (!game.user.can("FILES_UPLOAD")) {
      return controls;
    }
    const actor = this.document;
    if (!actor || (actor.type !== "character" && actor.type !== "mook")) {
      return controls;
    }
    if (controls.some((c) => c.action === "importCyberpunkRedCom")) {
      return controls;
    }
    return [
      {
        icon: "fa-solid fa-cloud-download-alt",
        label: "CPR.import.cyberpunkredCom.menuLabel",
        action: "importCyberpunkRedCom",
      },
      ...controls,
    ];
  }
}
