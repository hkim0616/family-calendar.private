import assert from "node:assert/strict";
import { test } from "node:test";

import { inviteUrl, normaliseInviteCode } from "./invite.ts";

test("accepts a well-formed code", () => {
  assert.equal(normaliseInviteCode("A3F91C2B"), "A3F91C2B");
});

test("uppercases lowercase codes", () => {
  // Links get lowercased by some messaging apps and email clients.
  assert.equal(normaliseInviteCode("a3f91c2b"), "A3F91C2B");
});

test("trims surrounding whitespace", () => {
  assert.equal(normaliseInviteCode("  A3F91C2B \n"), "A3F91C2B");
});

test("rejects anything that isn't 8 hex characters", () => {
  for (const bad of [
    "",
    "A3F91C2",
    "A3F91C2BB",
    "A3F91C2G",
    "../../etc/passwd",
    "<script>",
    "A3F9 1C2B",
    "'; drop table families;--",
  ]) {
    assert.equal(normaliseInviteCode(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("rejects null and undefined", () => {
  assert.equal(normaliseInviteCode(null), null);
  assert.equal(normaliseInviteCode(undefined), null);
});

test("builds the shareable link", () => {
  assert.equal(
    inviteUrl("https://family-hub.vercel.app", "A3F91C2B"),
    "https://family-hub.vercel.app/join/A3F91C2B",
  );
});

test("does not double the slash when the origin has a trailing one", () => {
  assert.equal(
    inviteUrl("https://family-hub.vercel.app/", "A3F91C2B"),
    "https://family-hub.vercel.app/join/A3F91C2B",
  );
});
