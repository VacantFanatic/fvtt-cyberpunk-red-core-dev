import SystemUtils from "../../../utils/cpr-systemUtils.js";

const PersistSectionViews = () => {
  /**
   * Persist collapsed sections of a character when it is closed. That way they
   * are not lost when it is re-opened.
   *
   * @public
   * @memberof hookEvents
   * @param {CPRActorSheet} actorSheet - application object (the sheet)
   */
  Hooks.on("closeActorSheetV2", (actorSheet) => {
    if (!Array.isArray(actorSheet.collapsedSections)) return;

    SystemUtils.SetUserSetting(
      "sheetConfig",
      "sheetCollapsedSections",
      actorSheet.collapsedSections,
      actorSheet.id
    );
  });
};

export default PersistSectionViews;
