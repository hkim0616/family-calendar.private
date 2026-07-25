"use client";

import { useFormState, useFormStatus } from "react-dom";

import { createFamilyAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Creating…" : "Create family"}
    </button>
  );
}

export function CreateFamilyForm({ suggestedName }: { suggestedName: string }) {
  const [state, formAction] = useFormState(createFamilyAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="familyName" className="mb-2 block text-sm font-medium">
          Family name
        </label>
        <input
          id="familyName"
          name="familyName"
          className="input"
          placeholder="The Kim Family"
          maxLength={60}
          required
          autoFocus
        />
        <p className="muted mt-2 text-xs">
          Just a label everyone sees at the top of the app.
        </p>
      </div>

      <div>
        <label htmlFor="displayName" className="mb-2 block text-sm font-medium">
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

      <SubmitButton />

      {state.error && (
        <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
