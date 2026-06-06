import SystemUtils from "../../utils/cpr-systemUtils.js";

const HideBlindRolls = () => {
  /**
   * Inject UI "tags" for rolls and whispers make it more clear that private
   * messages are being sent or received.
   *
   * @public
   * @memberof hookEvents
   * @param {ChatMessageData} (unused) - an instance of the ChatMessageData object
   * @param {object} html              - the HTML DOM of the chat card
   * @param {string} msg (unused)      - our simulation of the ChatData object
   */
  Hooks.on("renderChatMessageHTML", async (_, html) => {
    const $html = $(html); // NOTE: Replace jQuery when Foundry provides native DOM APIs.
    // Do not display "Blind" chat cards to non-gm
    // Foundry doesn't support blind chat messages so this is how we get around
    // that.
    if ($html.hasClass("blind") && !game.user.isGM) {
      const placeholder = SystemUtils.Localize("CPR.chat.blindRollHidden");
      $html
        .find(".message-content")
        .html(
          `<p class="blind-roll-placeholder text-normal">${placeholder}</p>`
        );
    }
  });
};

export default HideBlindRolls;
