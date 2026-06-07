/**
 * Regression tests for ChatMessage#user compatibility helper.
 * Run: node .github/workflows/pipeline_tests/test-chat-message-user.mjs
 */
import assert from "node:assert/strict";
import { resolveChatMessageUser } from "../../../src/modules/hooks/foundry/chat-message-user.js";

const users = new Map([["user1", { id: "user1", name: "Player One" }]]);

const getUser = (id) => users.get(id);

assert.deepEqual(resolveChatMessageUser("user1", getUser), {
  id: "user1",
  name: "Player One",
});

assert.deepEqual(resolveChatMessageUser({ id: "user1" }, getUser), {
  id: "user1",
  name: "Player One",
});

assert.deepEqual(resolveChatMessageUser("missing-user", getUser), {
  id: "missing-user",
});

assert.equal(resolveChatMessageUser(undefined, getUser), undefined);
assert.equal(resolveChatMessageUser(null, getUser), undefined);

console.log("✅ chat message user regression tests passed");
