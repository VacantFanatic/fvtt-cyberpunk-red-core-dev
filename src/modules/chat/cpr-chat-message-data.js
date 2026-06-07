/**
 * Pure helpers for building Foundry ChatMessage data from CPR roll cards.
 * Extracted for unit testing and v14 API compatibility (author, speaker IDs).
 */

/**
 * Build base chat message fields for a CPR roll or item card.
 *
 * @param {object} params
 * @param {string} params.content - HTML message body
 * @param {string} params.userId - authoring user id
 * @param {string} params.rollMode - core messageMode setting value
 * @param {string} [params.forceWhisper] - optional whisper recipient group
 * @param {boolean} [params.isRoll=false] - whether to attach the dice sound
 * @param {object} deps - injectable Foundry helpers for tests
 * @returns {object}
 */
export function buildChatMessageData(
  { content, userId, rollMode, forceWhisper, isRoll = false },
  deps
) {
  const { getSpeaker, getWhisperRecipients, diceSound } = deps;
  const chatData = {
    author: userId,
    messageMode: rollMode,
    content,
  };

  if (isRoll && diceSound) {
    chatData.sound = diceSound;
  }

  if (["gmroll", "blindroll"].includes(rollMode)) {
    chatData.whisper = getWhisperRecipients("GM").map((u) => u.id);
  }

  if (rollMode === "blindroll") {
    chatData.blind = true;
  } else if (rollMode === "selfroll") {
    chatData.whisper = [userId];
  }

  if (forceWhisper) {
    chatData.speaker = getSpeaker();
    chatData.whisper = getWhisperRecipients(forceWhisper).map((u) => u.id);
  }

  return chatData;
}

/**
 * Resolve ChatSpeakerData from CPR entityData or the current scene context.
 *
 * @param {object|null|undefined} entityData
 * @param {object} deps - injectable Foundry helpers for tests
 * @returns {object}
 */
export function resolveSpeaker(entityData, deps) {
  const { getSpeaker, getActor, getToken } = deps;

  if (!entityData) {
    return getSpeaker();
  }

  const actorId =
    typeof entityData.actor === "string"
      ? entityData.actor
      : entityData.actor?.id;
  const tokenId = entityData.token ?? null;

  const actor = actorId ? getActor(actorId) : null;
  const token = tokenId ? getToken(tokenId) : null;

  if (!actor && !token) {
    return getSpeaker();
  }

  return getSpeaker({
    actor: actor ?? token?.actor,
    token: token?.document ?? token,
  });
}
