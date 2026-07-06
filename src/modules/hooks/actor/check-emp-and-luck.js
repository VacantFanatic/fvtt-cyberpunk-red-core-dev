import SystemUtils from "../../utils/cpr-systemUtils.js";

const CheckEmpAndLuck = () => {
  /**
   * Check that EMP and LUCK values are not > 3 digits so that display on sheet
   * doesn't get messed up.
   *
   *
   * @public
   * @memberof hookEvents
   * @param {CPRCharacterActor} actor - The pending document which is requested for creation
   * @param {object} updatedData      - The changed data object provided to the document creation request
   */
  Hooks.on("preUpdateActor", async (_, updatedData) => {
    const statsUpdate = updatedData.system?.stats;
    if (!statsUpdate) return;
    ["emp", "luck"].forEach((statName) => {
      const stat = statsUpdate[statName];
      if (!stat) return;
      if (stat.value && Number(stat.value) > 99) {
        SystemUtils.DisplayMessage(
          "warn",
          SystemUtils.Localize("CPR.messages.tripleDigitStatValueWarn")
        );
      }
      if (stat.max && Number(stat.max) > 99) {
        SystemUtils.DisplayMessage(
          "warn",
          SystemUtils.Localize("CPR.messages.tripleDigitStatMaxWarn")
        );
      }
    });
  });
};

export default CheckEmpAndLuck;
