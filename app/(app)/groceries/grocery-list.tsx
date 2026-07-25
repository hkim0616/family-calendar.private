"use client";

import { useState } from "react";

import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import { LiveBadge } from "@/components/live-badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeList } from "@/lib/use-realtime-list";

export type GroceryItem = {
  id: string;
  name: string;
  checked: boolean;
  added_by: string | null;
  created_at: string;
};

/** Unchecked first, then oldest-added within each group. */
const shoppingOrder = (a: GroceryItem, b: GroceryItem) => {
  if (a.checked !== b.checked) return a.checked ? 1 : -1;
  return a.created_at.localeCompare(b.created_at);
};

export function GroceryList({
  familyId,
  currentMemberId,
  initialItems,
}: {
  familyId: string;
  currentMemberId: string;
  initialItems: GroceryItem[];
}) {
  const { rows, status, upsert, remove } = useRealtimeList<GroceryItem>({
    table: "grocery_items",
    familyId,
    initial: initialItems,
    sort: shoppingOrder,
  });

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    // Clear straight away so you can keep typing the next item.
    setDraft("");

    const { data, error } = await supabase
      .from("grocery_items")
      .insert({ family_id: familyId, added_by: currentMemberId, name })
      .select("id, name, checked, added_by, created_at")
      .single();

    setBusy(false);
    if (error) {
      setError(error.message);
      setDraft(name);
      return;
    }
    if (data) upsert(data as GroceryItem);
  }

  async function toggleChecked(item: GroceryItem) {
    const next = !item.checked;
    // Optimistic — ticking things off while standing in a shop should be instant.
    upsert({ ...item, checked: next });

    const { error } = await supabase
      .from("grocery_items")
      .update({ checked: next })
      .eq("id", item.id);

    if (error) {
      upsert(item);
      setError(error.message);
    }
  }

  async function clearChecked() {
    const checkedItems = rows.filter((i) => i.checked);
    if (checkedItems.length === 0) return;
    if (
      !window.confirm(
        `Remove ${checkedItems.length} bought item${checkedItems.length === 1 ? "" : "s"} from the list?`,
      )
    )
      return;

    setClearing(true);
    setError(null);

    // Remove locally first, then delete server-side. Other phones get the
    // deletions through realtime.
    checkedItems.forEach((i) => remove(i.id));

    const { error } = await supabase
      .from("grocery_items")
      .delete()
      .in(
        "id",
        checkedItems.map((i) => i.id),
      );

    setClearing(false);
    if (error) {
      checkedItems.forEach((i) => upsert(i)); // Put them back.
      setError(error.message);
    }
  }

  const remaining = rows.filter((i) => !i.checked).length;
  const checkedCount = rows.length - remaining;

  return (
    <main className={`mx-auto max-w-md px-5 py-6 ${BOTTOM_NAV_SPACER}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groceries</h1>
          <p className="muted mt-0.5 text-xs">
            {rows.length === 0
              ? "Nothing on the list"
              : `${remaining} to buy${checkedCount > 0 ? ` · ${checkedCount} in basket` : ""}`}
          </p>
        </div>
        <LiveBadge status={status} />
      </header>

      <form onSubmit={addItem} className="mb-5">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add an item…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            aria-label="New grocery item"
          />
          <button
            type="submit"
            className="btn btn-primary shrink-0"
            disabled={busy || draft.trim().length === 0}
          >
            Add
          </button>
        </div>
      </form>

      {error && (
        <p
          className="mb-4 text-sm"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="muted py-10 text-center text-sm">
          The list is empty. Add the first item above.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="card">
              {/* Whole row is the tap target — easy to hit one-handed. */}
              <button
                type="button"
                onClick={() => toggleChecked(item)}
                aria-pressed={item.checked}
                className="flex w-full items-center gap-3 px-3 text-left"
                style={{
                  minHeight: 52,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  className="flex shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    width: 22,
                    height: 22,
                    borderColor: item.checked
                      ? "var(--success)"
                      : "var(--border)",
                    background: item.checked ? "var(--success)" : "transparent",
                  }}
                >
                  {item.checked && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M20 6 9 17l-5-5"
                        fill="none"
                        stroke="var(--surface)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>

                <span
                  className="min-w-0 flex-1 py-2 text-sm"
                  style={{
                    textDecoration: item.checked ? "line-through" : "none",
                    color: item.checked ? "var(--text-muted)" : "var(--text)",
                  }}
                >
                  {item.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {checkedCount > 0 && (
        <button
          type="button"
          className="btn btn-secondary mt-5 w-full"
          onClick={clearChecked}
          disabled={clearing}
        >
          {clearing
            ? "Clearing…"
            : `Clear ${checkedCount} bought item${checkedCount === 1 ? "" : "s"}`}
        </button>
      )}
    </main>
  );
}
