/**
 * Regression tests for ChatMessage author helpers.
 * Run: node .github/workflows/pipeline_tests/test-chat-message-author.mjs
 */
import assert from "node:assert/strict";
import {
  isChatMessageAuthor,
  isWhisperedChatMessage,
  resolveChatMessageAuthorId,
} from "../../../src/modules/hooks/foundry/chat-message-author.js";

assert.equal(resolveChatMessageAuthorId("user1"), "user1");
assert.equal(resolveChatMessageAuthorId({ id: "user1" }), "user1");
assert.equal(resolveChatMessageAuthorId(undefined), undefined);

assert.equal(
  isChatMessageAuthor({ author: "user1", isAuthor: false }, "user1"),
  true
);
assert.equal(isChatMessageAuthor({ author: "user1" }, "user1"), true);
assert.equal(isChatMessageAuthor({ author: "user2" }, "user1"), false);
assert.equal(isChatMessageAuthor({ isAuthor: true }, "user1"), true);
assert.equal(isChatMessageAuthor(undefined, "user1"), false);

assert.equal(isWhisperedChatMessage({ whisper: ["user1"] }), true);
assert.equal(isWhisperedChatMessage({ whisper: [] }), false);
assert.equal(isWhisperedChatMessage({}), false);
assert.equal(isWhisperedChatMessage(undefined), false);

console.log("✅ chat message author regression tests passed");
