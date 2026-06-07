/**
 * Foundry v14 removed ChatMessage#user in favor of ChatMessage#author.
 * Several community modules (e.g. Automated Animations) still read msg.user.
 */
export default function registerChatMessageV14Compat() {
  if (!foundry.utils.isNewerVersion(game.version, "13.9")) return;

  const proto = foundry.documents.ChatMessage.prototype;
  if (Object.getOwnPropertyDescriptor(proto, "user")) return;

  Object.defineProperty(proto, "user", {
    get() {
      return game.users.get(this.author);
    },
    configurable: true,
  });
}
