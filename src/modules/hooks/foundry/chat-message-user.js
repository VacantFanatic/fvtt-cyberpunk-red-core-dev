/**
 * Resolve a ChatMessage author to a User-like object for legacy module APIs.
 *
 * @param {string|object|undefined} author - ChatMessage author id or document
 * @param {(id: string) => object|undefined} getUser
 * @returns {object|undefined}
 */
export function resolveChatMessageUser(author, getUser) {
  const authorId = typeof author === "string" ? author : author?.id;
  if (!authorId) return undefined;

  const user = getUser(authorId);
  if (user) return user;

  // Automated Animations and other legacy modules only need `.id`.
  return { id: authorId };
}

/**
 * Install ChatMessage#user on Foundry v14+ for modules that still read msg.user.
 *
 * @param {object} proto - ChatMessage prototype
 * @param {(id: string) => object|undefined} getUser
 */
export function installChatMessageUserCompat(proto, getUser) {
  Object.defineProperty(proto, "user", {
    get() {
      return resolveChatMessageUser(this.author, getUser);
    },
    configurable: true,
  });
}
