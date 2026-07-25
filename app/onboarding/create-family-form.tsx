"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { createFamilyAction, joinFamilyAction } from "./actions";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function CreateFamilyForm({ suggestedName }: { suggestedName: string }) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [createState, createAction] = useFormState(createFamilyAction, {
    error: null,
  });
  const [joinState, joinAction] = useFormState(joinFamilyAction, {
    error: null,
  });

  const error = tab === "create" ? createState.error : joinState.error;

  return (
    <div>
      {/* Segmented control */}
      <div
        className="mb-5 flex rounded-xl p-1"
        style={{ background: "var(--bg)" }}
        role="tablist"
      >
        {(
          [
            ["create", "Start a family"],
            ["join", "Join with a code"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="flex-1 rounded-lg text-sm font-medium"
            style={{
              minHeight: 38,
              background: tab === value ? "var(--surface)" : "transparent",
              color: tab === value ? "var(--text)" : "var(--text-muted)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <form action={createAction} className="space-y-4">
          <div>
            <label
              htmlFor="familyName"
              className="mb-2 block text-sm font-medium"
            >
              Family name
            </label>
            <input
              id="familyName"
              name="familyName"
              className="input"
              placeholder="The Kim Family"
              maxLength={60}
              required
            />
            <p className="muted mt-2 text-xs">
              Just a label everyone sees at the top of the app.
            </p>
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="mb-2 block text-sm font-medium"
            >
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              className="input"
              placeholder={suggestedName || "Alex"}
              defaultValue={suggestedName}
              maxLength={40}
              required
            />
            <p className="muted mt-2 text-xs">
              How your memos and list items will be signed.
            </p>
          </div>

          <SubmitButton label="Create family" pendingLabel="Creating…" />
        </form>
      ) : (
        <form action={joinAction} className="space-y-4">
          <div>
            <label
              htmlFor="inviteCode"
              className="mb-2 block text-sm font-medium"
            >
              Invite code
            </label>
            <input
              id="inviteCode"
              name="inviteCode"
              className="input text-center text-lg tracking-[0.3em]"
              placeholder="A3F91C2B"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={16}
              required
            />
            <p className="muted mt-2 text-xs">
              Ask whoever set up the family — it&apos;s on their Home screen.
            </p>
          </div>

          <div>
            <label
              htmlFor="joinDisplayName"
              className="mb-2 block text-sm font-medium"
            >
              Your name
            </label>
            <input
              id="joinDisplayName"
              name="displayName"
              className="input"
              placeholder={suggestedName || "Alex"}
              defaultValue={suggestedName}
              maxLength={40}
              required
            />
          </div>

          <SubmitButton label="Join family" pendingLabel="Joining…" />
        </form>
      )}

      {error && (
        <p
          className="mt-4 text-sm"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
