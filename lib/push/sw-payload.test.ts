import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

/**
 * Tests the service worker's payload handling by loading public/sw.js directly.
 *
 * This matters more than it looks: iOS requires every push to result in a
 * visible notification. If the handler throws — on an empty body, or something
 * that isn't JSON — the phone can revoke the app's push permission entirely.
 * So the rule under test is "always produce something showable".
 */
const require_ = createRequire(import.meta.url);

// sw.js registers its event listeners at load time, so stand in for the worker
// globals before requiring it. Nothing here is exercised by the tests below —
// they only call the pure payload helper.
(globalThis as unknown as { self: unknown }).self = {
  addEventListener: () => {},
  registration: { showNotification: () => {} },
  clients: { matchAll: async () => [], openWindow: async () => {} },
  skipWaiting: async () => {},
  location: { origin: "https://example.test" },
};
(globalThis as unknown as { caches: unknown }).caches = {
  open: async () => ({}),
  keys: async () => [],
  delete: async () => true,
};

// The worker guards its own exports, so requiring it outside a browser is safe.
const { notificationFromPayload } = require_("../../public/sw.js") as {
  notificationFromPayload: (raw: string) => {
    title: string;
    options: {
      body: string;
      tag?: string;
      icon?: string;
      badge?: string;
      data: { url: string };
    };
  };
};

test("uses the fields the scheduler sends", () => {
  const result = notificationFromPayload(
    JSON.stringify({
      title: "Mina's birthday",
      body: "7 days away (8 years).",
      url: "/anniversaries",
      tag: "ann-a1-2026-05-05",
    }),
  );
  assert.equal(result.title, "Mina's birthday");
  assert.equal(result.options.body, "7 days away (8 years).");
  assert.equal(result.options.data.url, "/anniversaries");
  assert.equal(result.options.tag, "ann-a1-2026-05-05");
});

test("always sets an icon and badge", () => {
  const result = notificationFromPayload(JSON.stringify({ title: "x" }));
  assert.ok(result.options.icon, "icon");
  assert.ok(result.options.badge, "badge");
});

test("an empty push still produces a showable notification", () => {
  const result = notificationFromPayload("");
  assert.ok(result.title.length > 0);
  assert.ok(result.options.body.length > 0);
  assert.equal(result.options.data.url, "/");
});

test("a non-JSON body is shown rather than dropped", () => {
  const result = notificationFromPayload("just some text");
  assert.ok(result.title.length > 0);
  assert.equal(result.options.body, "just some text");
});

test("malformed JSON does not throw", () => {
  assert.doesNotThrow(() => notificationFromPayload('{"title": '));
  const result = notificationFromPayload('{"title": ');
  assert.ok(result.options.body.length > 0);
});

test("JSON that isn't an object falls back", () => {
  for (const raw of ["null", "42", '"a string"', "[]"]) {
    const result = notificationFromPayload(raw);
    assert.ok(result.title.length > 0, `title for ${raw}`);
    assert.equal(typeof result.options.data.url, "string");
  }
});

test("a missing title falls back to the app name", () => {
  const result = notificationFromPayload(JSON.stringify({ body: "no title" }));
  assert.equal(result.title, "Family Hub");
  assert.equal(result.options.body, "no title");
});

test("a missing url taps through to the dashboard", () => {
  const result = notificationFromPayload(JSON.stringify({ title: "x" }));
  assert.equal(result.options.data.url, "/");
});

test("a very long non-JSON body is truncated", () => {
  const result = notificationFromPayload("x".repeat(5000));
  assert.ok(
    result.options.body.length <= 200,
    `body should be trimmed (was ${result.options.body.length})`,
  );
});

test("non-ASCII content passes through unchanged", () => {
  const result = notificationFromPayload(
    JSON.stringify({ title: "가족 여행 🎉", body: "Busan — 3일" }),
  );
  assert.equal(result.title, "가족 여행 🎉");
  assert.equal(result.options.body, "Busan — 3일");
});
