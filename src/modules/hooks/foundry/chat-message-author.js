/**
 * Resolve a ChatMessage author id from Foundry v14 string ids or legacy objects.
 *
 * @param {string|object|undefined} author
 * @returns {string|undefined}
 */
export function resolveChatMessageAuthorId(author) {
  if (typeof author === "string") return author;
  return author?.id;
}

/**
 * Whether the given user created the chat message.
 *
 * @param {object|undefined} message
 * @param {string|undefined} userId
 * @returns {boolean}
 */
export function isChatMessageAuthor(message, userId) {
  if (!message || !userId) return false;
  if (message.isAuthor === true) return true;
  return resolveChatMessageAuthorId(message.author) === userId;
}

/**
 * Whether a chat message was whispered to specific users.
 *
 * @param {object|undefined} message
 * @returns {boolean}
 */
export function isWhisperedChatMessage(message) {
  return (message?.whisper?.length ?? 0) > 0;
}
