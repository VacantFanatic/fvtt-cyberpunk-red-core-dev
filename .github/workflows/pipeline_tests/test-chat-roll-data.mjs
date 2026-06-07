/**
 * Regression tests for chat message and dice-roll integration data.
 * Run: node .github/workflows/pipeline_tests/test-chat-roll-data.mjs
 */
import assert from "node:assert/strict";
import {
  buildChatMessageData,
  resolveSpeaker,
} from "../../../src/modules/chat/cpr-chat-message-data.js";

const mockSpeaker = {
  scene: "scene1",
  actor: "actor1",
  token: "token1",
  alias: "V",
};

const deps = {
  getSpeaker(options) {
    if (!options) return { ...mockSpeaker };
    const { actor, token } = options;
    return {
      scene: "scene1",
      actor: actor?.id ?? actor ?? null,
      token: token?.id ?? token ?? null,
      alias: token?.name ?? actor?.name ?? "Unknown",
    };
  },
  getWhisperRecipients(type) {
    if (type === "GM") {
      return [{ id: "gm1" }, { id: "gm2" }];
    }
    return [{ id: "user2" }];
  },
  getActor(id) {
    if (id === "actor1") return { id: "actor1", name: "Actor One" };
    return null;
  },
  getToken(id) {
    if (id === "token1") {
      return {
        id: "token1",
        name: "Token One",
        actor: { id: "actor1", name: "Actor One" },
        document: { id: "token1", name: "Token One" },
      };
    }
    return null;
  },
  diceSound: "sounds/dice.wav",
};

const publicChat = buildChatMessageData(
  { content: "<p>roll</p>", userId: "user1", rollMode: "roll" },
  deps
);
assert.equal(publicChat.author, "user1");
assert.equal(publicChat.user, undefined);
assert.equal(publicChat.content, "<p>roll</p>");

const selfChat = buildChatMessageData(
  { content: "<p>self</p>", userId: "user1", rollMode: "selfroll" },
  deps
);
assert.deepEqual(selfChat.whisper, ["user1"]);

const gmChat = buildChatMessageData(
  { content: "<p>gm</p>", userId: "user1", rollMode: "gmroll" },
  deps
);
assert.deepEqual(gmChat.whisper, ["gm1", "gm2"]);

const forcedWhisper = buildChatMessageData(
  {
    content: "<p>w</p>",
    userId: "user1",
    rollMode: "roll",
    forceWhisper: "GM",
  },
  deps
);
assert.deepEqual(forcedWhisper.whisper, ["gm1", "gm2"]);

const fromEntity = resolveSpeaker({ actor: "actor1", token: "token1" }, deps);
assert.equal(fromEntity.actor, "actor1");
assert.equal(fromEntity.token, "token1");
assert.equal(fromEntity.alias, "Token One");

const fromMacroSpeaker = resolveSpeaker(
  { actor: "actor1", token: null, alias: "Macro Alias", scene: "scene1" },
  deps
);
assert.equal(fromMacroSpeaker.actor, "actor1");
assert.equal(fromMacroSpeaker.alias, "Actor One");

const fallback = resolveSpeaker(null, deps);
assert.equal(fallback.actor, "actor1");

console.log("✅ chat roll data regression tests passed");
