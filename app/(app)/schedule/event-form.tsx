"use client";

import { useState } from "react";

import { dayKeyToUtcDate, localDayKey, type CalendarEvent } from "@/lib/calendar";

export type EventDraft = {
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  note: string | null;
};

/** "2026-07-25T14:30" — the value shape a datetime-local input wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Interprets a datetime-local value in the phone's own timezone. */
function fromLocalInput(value: string): Date {
  return new Date(value);
}

function addHour(value: string): string {
  const d = fromLocalInput(value);
  if (Number.isNaN(d.getTime())) return value;
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

/**
 * Add / edit sheet for one event.
 *
 * All-day events are stored at UTC midnight and timed ones as real instants —
 * see lib/calendar.ts for why — so switching the toggle converts between the
 * two representations rather than reusing the raw value.
 */
export function EventForm({
  existing,
  defaultDayKey,
  onSave,
  onDelete,
  onCancel,
}: {
  existing?: CalendarEvent;
  /** Day the user tapped, used as the starting date for a new event. */
  defaultDayKey: string;
  onSave: (draft: EventDraft) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const initialAllDay = existing?.all_day ?? false;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [allDay, setAllDay] = useState(initialAllDay);
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timed events keep datetime-local values; all-day events keep date-only.
  const [startAt, setStartAt] = useState(() => {
    if (existing && !existing.all_day) return toLocalInput(existing.starts_at);
    const base = new Date(`${defaultDayKey}T09:00:00`);
    return toLocalInput(base.toISOString());
  });
  const [endAt, setEndAt] = useState(() => {
    if (existing && !existing.all_day) return toLocalInput(existing.ends_at);
    const base = new Date(`${defaultDayKey}T10:00:00`);
    return toLocalInput(base.toISOString());
  });
  const [startDay, setStartDay] = useState(() =>
    existing?.all_day ? existing.starts_at.slice(0, 10) : defaultDayKey,
  );
  const [endDay, setEndDay] = useState(() =>
    existing?.all_day ? existing.ends_at.slice(0, 10) : defaultDayKey,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please give the event a title.");
      return;
    }

    let starts: string;
    let ends: string;

    if (allDay) {
      if (!startDay) {
        setError("Please pick a date.");
        return;
      }
      const effectiveEnd = endDay && endDay >= startDay ? endDay : startDay;
      starts = dayKeyToUtcDate(startDay).toISOString();
      ends = dayKeyToUtcDate(effectiveEnd).toISOString();
    } else {
      const s = fromLocalInput(startAt);
      const eDate = fromLocalInput(endAt);
      if (Number.isNaN(s.getTime())) {
        setError("Please pick a start time.");
        return;
      }
      if (Number.isNaN(eDate.getTime()) || eDate < s) {
        setError("The end time can't be before the start time.");
        return;
      }
      starts = s.toISOString();
      ends = eDate.toISOString();
    }

    setBusy(true);
    const message = await onSave({
      title: title.trim(),
      starts_at: starts,
      ends_at: ends,
      all_day: allDay,
      note: note.trim() ? note.trim() : null,
    });
    setBusy(false);
    if (message) setError(message);
  }

  async function remove() {
    if (!onDelete) return;
    if (!window.confirm("Delete this event?")) return;
    setBusy(true);
    const message = await onDelete();
    setBusy(false);
    if (message) setError(message);
  }

  /** Keep the two representations in step when the toggle flips. */
  function toggleAllDay(next: boolean) {
    if (next) {
      const from = fromLocalInput(startAt);
      if (!Number.isNaN(from.getTime())) {
        const key = localDayKey(from);
        setStartDay(key);
        setEndDay(key);
      }
    } else {
      const base = new Date(`${startDay}T09:00:00`);
      const value = toLocalInput(base.toISOString());
      setStartAt(value);
      setEndAt(addHour(value));
    }
    setAllDay(next);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="title" className="mb-2 block text-sm font-medium">
          What is it?
        </label>
        <input
          id="title"
          className="input"
          placeholder="Dinner with the Parks"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          // See the note on the end-time field: validation lives in submit() so
          // the inline message always shows.
          aria-required="true"
          autoFocus={!existing}
        />
      </div>

      <label className="flex items-center justify-between gap-3 py-1">
        <span className="text-sm font-medium">All day</span>
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => toggleAllDay(e.target.checked)}
          className="h-6 w-6 shrink-0"
          style={{ accentColor: "var(--accent)" }}
        />
      </label>

      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startDay" className="mb-2 block text-sm font-medium">
              From
            </label>
            <input
              id="startDay"
              type="date"
              className="input"
              value={startDay}
              onChange={(e) => {
                setStartDay(e.target.value);
                if (endDay < e.target.value) setEndDay(e.target.value);
              }}
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="endDay" className="mb-2 block text-sm font-medium">
              To
            </label>
            <input
              id="endDay"
              type="date"
              className="input"
              value={endDay}
              min={startDay}
              onChange={(e) => setEndDay(e.target.value)}
              aria-required="true"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="startAt" className="mb-2 block text-sm font-medium">
              Starts
            </label>
            <input
              id="startAt"
              type="datetime-local"
              className="input"
              value={startAt}
              onChange={(e) => {
                setStartAt(e.target.value);
                // Keep the end after the start without nagging the user.
                if (!endAt || endAt < e.target.value) {
                  setEndAt(addHour(e.target.value));
                }
              }}
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="endAt" className="mb-2 block text-sm font-medium">
              Ends
            </label>
            {/*
              Deliberately no `min` here. A min on a datetime-local makes the
              browser block submission with its own terse tooltip, which
              suppresses the clearer inline message below and is easy to miss on
              a phone. The check in submit() handles it instead.
            */}
            <input
              id="endAt"
              type="datetime-local"
              className="input"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              aria-required="true"
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="note" className="mb-2 block text-sm font-medium">
          Note <span className="muted font-normal">(optional)</span>
        </label>
        <textarea
          id="note"
          className="input min-h-[72px] resize-none py-2"
          placeholder="Bring dessert"
          value={note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Saving…" : existing ? "Save changes" : "Add event"}
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
          onClick={remove}
          disabled={busy}
        >
          Delete event
        </button>
      )}
    </form>
  );
}
