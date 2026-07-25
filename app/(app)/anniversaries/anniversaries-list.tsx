"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";

import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import {
  countdownLabel,
  daysUntilNext,
  isWithinReminder,
  nextOccurrence,
  sortByUpcoming,
  todayKey,
  yearsAtNext,
  type Anniversary,
} from "@/lib/anniversaries";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const REMIND_CHOICES = [0, 1, 3, 7, 14, 30];

function remindLabel(days: number): string {
  if (days === 0) return "On the day";
  if (days === 1) return "1 day before";
  return `${days} days before`;
}

export function AnniversariesList({
  familyId,
  initialItems,
}: {
  familyId: string;
  initialItems: Anniversary[];
}) {
  const [items, setItems] = useState<Anniversary[]>(initialItems);
  const [editing, setEditing] = useState<Anniversary | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();
  const today = todayKey();
  const sorted = useMemo(() => sortByUpcoming(items, today), [items, today]);

  async function save(draft: Omit<Anniversary, "id">): Promise<string | null> {
    if (editing) {
      const previous = editing;
      setItems((current) =>
        current.map((a) => (a.id === previous.id ? { ...previous, ...draft } : a)),
      );
      setEditing(null);

      const { error } = await supabase
        .from("anniversaries")
        .update(draft)
        .eq("id", previous.id);

      if (error) {
        setItems((current) =>
          current.map((a) => (a.id === previous.id ? previous : a)),
        );
        return error.message;
      }
      return null;
    }

    const { data, error } = await supabase
      .from("anniversaries")
      .insert({ ...draft, family_id: familyId })
      .select("id, title, date, remind_days_before")
      .single();

    if (error) return error.message;
    if (data) setItems((current) => [...current, data as Anniversary]);
    setAdding(false);
    return null;
  }

  async function remove(): Promise<string | null> {
    if (!editing) return null;
    const victim = editing;
    setItems((current) => current.filter((a) => a.id !== victim.id));
    setEditing(null);

    const { error } = await supabase
      .from("anniversaries")
      .delete()
      .eq("id", victim.id);

    if (error) {
      setItems((current) => [...current, victim]);
      return error.message;
    }
    return null;
  }

  return (
    <main className={`mx-auto max-w-md px-5 py-6 ${BOTTOM_NAV_SPACER}`}>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dates</h1>
        <p className="muted mt-0.5 text-xs">
          Birthdays and anniversaries — these come round every year.
        </p>
      </header>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="muted py-10 text-center text-sm">
          No dates yet. Add a birthday or anniversary below.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => {
            const days = daysUntilNext(item.date, today);
            const soon = isWithinReminder(item, today);
            const years = yearsAtNext(item.date, today);
            const occurrence = nextOccurrence(item.date, today);

            return (
              <li
                key={item.id}
                className="card"
                // A soft accent outline for anything inside its reminder window.
                style={
                  soon
                    ? { borderColor: "var(--accent)", borderWidth: 2 }
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setAdding(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  style={{ minHeight: 56, WebkitTapHighlightColor: "transparent" }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="muted mt-0.5 block text-xs">
                      {format(new Date(`${occurrence}T00:00:00`), "d MMMM")}
                      {years !== null && ` · ${years} years`}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
                    style={
                      soon
                        ? { background: "var(--accent)", color: "var(--accent-text)" }
                        : { background: "var(--bg)", color: "var(--text-muted)" }
                    }
                  >
                    {countdownLabel(days)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding || editing ? (
        <div className="card mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {editing ? "Edit date" : "New date"}
          </h2>
          <AnniversaryForm
            existing={editing ?? undefined}
            onSave={save}
            onDelete={editing ? remove : undefined}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
              setError(null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary mt-5 w-full"
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
        >
          Add a date
        </button>
      )}

      <p className="muted mt-4 text-xs">
        Dates inside their reminder window are outlined here and appear on the
        Home screen. Family Hub shows them in the app — it doesn&apos;t send
        phone notifications.
      </p>
    </main>
  );
}

function AnniversaryForm({
  existing,
  onSave,
  onDelete,
  onCancel,
}: {
  existing?: Anniversary;
  onSave: (draft: Omit<Anniversary, "id">) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [remind, setRemind] = useState(existing?.remind_days_before ?? 7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please give the date a name.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Please pick a date.");
      return;
    }

    setBusy(true);
    const message = await onSave({
      title: title.trim(),
      date,
      remind_days_before: remind,
    });
    setBusy(false);
    if (message) setError(message);
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!window.confirm("Delete this date?")) return;
    setBusy(true);
    const message = await onDelete();
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="annTitle" className="mb-2 block text-sm font-medium">
          What is it?
        </label>
        <input
          id="annTitle"
          className="input"
          placeholder="Mina's birthday"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          // aria-required rather than `required`: the HTML attribute makes the
          // browser block submission with its own tooltip, which on iOS Safari
          // can read as "I tapped Add and nothing happened". submit() validates
          // and shows the inline message below instead.
          aria-required="true"
          autoFocus={!existing}
        />
      </div>

      <div>
        <label htmlFor="annDate" className="mb-2 block text-sm font-medium">
          Date
        </label>
        <input
          id="annDate"
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-required="true"
        />
        <p className="muted mt-2 text-xs">
          Use the original year — a birth or wedding year — and Family Hub will
          count the years for you.
        </p>
      </div>

      <div>
        <label htmlFor="annRemind" className="mb-2 block text-sm font-medium">
          Start reminding me
        </label>
        <select
          id="annRemind"
          className="input"
          value={remind}
          onChange={(e) => setRemind(Number(e.target.value))}
        >
          {REMIND_CHOICES.map((days) => (
            <option key={days} value={days}>
              {remindLabel(days)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Saving…" : existing ? "Save changes" : "Add date"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>

      {existing && onDelete && (
        <button
          type="button"
          className="btn w-full"
          style={{ color: "var(--danger)" }}
          onClick={handleDelete}
          disabled={busy}
        >
          Delete date
        </button>
      )}
    </form>
  );
}
