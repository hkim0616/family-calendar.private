"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";

import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import { LiveBadge } from "@/components/live-badge";
import {
  dayKeyToDate,
  eventDayKeys,
  groupByDay,
  monthMatrix,
  shiftMonth,
  todayKey,
  type CalendarEvent,
} from "@/lib/calendar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeList } from "@/lib/use-realtime-list";

import { EventForm, type EventDraft } from "./event-form";
import { SubscribeCard } from "./subscribe-card";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  a.starts_at.localeCompare(b.starts_at);

/** "14:30", or "All day" for all-day events. */
function timeLabel(event: CalendarEvent): string {
  if (event.all_day) return "All day";
  const d = new Date(event.starts_at);
  return Number.isNaN(d.getTime()) ? "" : format(d, "HH:mm");
}

export function ScheduleView({
  familyId,
  currentMemberId,
  calendarToken,
  initialEvents,
}: {
  familyId: string;
  currentMemberId: string;
  calendarToken: string;
  initialEvents: CalendarEvent[];
}) {
  const { rows, status, upsert, remove } = useRealtimeList<CalendarEvent>({
    table: "events",
    familyId,
    initial: initialEvents,
    sort: byStart,
  });

  const [view, setView] = useState<"month" | "agenda">("month");
  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(today);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();
  const byDay = useMemo(() => groupByDay(rows), [rows]);
  const cells = useMemo(
    () => monthMatrix(cursor.year, cursor.monthIndex),
    [cursor],
  );

  /** Upcoming events for the agenda, grouped by day. */
  const agenda = useMemo(() => {
    const days = new Map<string, CalendarEvent[]>();
    for (const key of [...byDay.keys()].sort()) {
      if (key >= today) days.set(key, byDay.get(key)!);
    }
    return [...days.entries()];
  }, [byDay, today]);

  async function saveEvent(draft: EventDraft): Promise<string | null> {
    if (editing) {
      const previous = editing;
      const optimistic = { ...previous, ...draft };
      upsert(optimistic);
      setEditing(null);

      const { error } = await supabase
        .from("events")
        .update(draft)
        .eq("id", previous.id);

      if (error) {
        upsert(previous); // Roll back.
        return error.message;
      }
      return null;
    }

    const { data, error } = await supabase
      .from("events")
      .insert({ ...draft, family_id: familyId, created_by: currentMemberId })
      .select("id, title, starts_at, ends_at, all_day, note")
      .single();

    if (error) return error.message;

    if (data) {
      const created = data as CalendarEvent;
      upsert(created);
      // Jump to the day it landed on, so it's visible straight away.
      const [firstDay] = eventDayKeys(created);
      if (firstDay) {
        setSelectedDay(firstDay);
        const d = dayKeyToDate(firstDay);
        setCursor({ year: d.getFullYear(), monthIndex: d.getMonth() });
      }
    }
    setAdding(false);
    return null;
  }

  async function deleteEvent(): Promise<string | null> {
    if (!editing) return null;
    const victim = editing;
    remove(victim.id);
    setEditing(null);

    const { error } = await supabase.from("events").delete().eq("id", victim.id);
    if (error) {
      upsert(victim);
      return error.message;
    }
    return null;
  }

  const selectedEvents = byDay.get(selectedDay) ?? [];
  const monthLabel = format(
    new Date(cursor.year, cursor.monthIndex, 1),
    "MMMM yyyy",
  );

  return (
    <main className={`mx-auto max-w-md px-5 py-6 ${BOTTOM_NAV_SPACER}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <LiveBadge status={status} />
      </header>

      {/* Month / Agenda toggle */}
      <div
        className="mb-4 flex rounded-xl p-1"
        style={{ background: "var(--bg)" }}
        role="tablist"
      >
        {(
          [
            ["month", "Month"],
            ["agenda", "Agenda"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className="flex-1 rounded-lg text-sm font-medium"
            style={{
              minHeight: 38,
              background: view === value ? "var(--surface)" : "transparent",
              color: view === value ? "var(--text)" : "var(--text-muted)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {view === "month" ? (
        <>
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              className="btn btn-secondary px-3"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex, -1))}
            >
              ‹
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold">{monthLabel}</p>
              <button
                type="button"
                className="text-[11px] underline"
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  const now = new Date();
                  setCursor({ year: now.getFullYear(), monthIndex: now.getMonth() });
                  setSelectedDay(today);
                }}
              >
                Today
              </button>
            </div>
            <button
              type="button"
              aria-label="Next month"
              className="btn btn-secondary px-3"
              onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex, 1))}
            >
              ›
            </button>
          </div>

          {/* Weekday headings */}
          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((d, i) => (
              <div
                key={i}
                className="muted text-center text-[11px] font-medium"
                aria-hidden="true"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const dayEvents = byDay.get(cell.key) ?? [];
              const isToday = cell.key === today;
              const isSelected = cell.key === selectedDay;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(cell.key);
                    // Tapping a greyed-out day from the neighbouring month
                    // moves to that month, the way phone calendars do —
                    // otherwise the selection sits outside the visible grid.
                    if (!cell.inMonth) {
                      setCursor({
                        year: cell.date.getFullYear(),
                        monthIndex: cell.date.getMonth(),
                      });
                    }
                  }}
                  aria-label={`${format(cell.date, "d MMMM yyyy")}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                  aria-pressed={isSelected}
                  className="flex flex-col items-center justify-start rounded-lg pt-1"
                  style={{
                    minHeight: 46,
                    background: isSelected ? "var(--accent)" : "transparent",
                    color: isSelected
                      ? "var(--accent-text)"
                      : cell.inMonth
                        ? "var(--text)"
                        : "var(--text-muted)",
                    opacity: cell.inMonth ? 1 : 0.45,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span
                    className={`text-sm ${isToday ? "font-bold" : ""}`}
                    style={
                      isToday && !isSelected ? { color: "var(--accent)" } : undefined
                    }
                  >
                    {cell.date.getDate()}
                  </span>
                  {/* Up to three dots, so a busy day doesn't overflow the cell. */}
                  <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="h-1 w-1 rounded-full"
                        style={{
                          background: isSelected
                            ? "var(--accent-text)"
                            : "var(--accent)",
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected day's events */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                {format(dayKeyToDate(selectedDay), "EEEE d MMMM")}
              </h2>
              {selectedDay === today && (
                <span className="muted text-[11px]">Today</span>
              )}
            </div>

            {selectedEvents.length === 0 ? (
              <p className="muted py-4 text-center text-sm">
                Nothing planned this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={() => setEditing(event)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div>
          {agenda.length === 0 ? (
            <p className="muted py-10 text-center text-sm">
              Nothing coming up. Add the first event below.
            </p>
          ) : (
            <div className="space-y-5">
              {agenda.map(([key, dayEvents]) => (
                <div key={key}>
                  <h2 className="mb-2 text-sm font-semibold">
                    {format(dayKeyToDate(key), "EEEE d MMMM")}
                    {key === today && (
                      <span className="muted ml-2 text-[11px] font-normal">
                        Today
                      </span>
                    )}
                  </h2>
                  <ul className="space-y-2">
                    {dayEvents.map((event) => (
                      <EventRow
                        key={`${key}-${event.id}`}
                        event={event}
                        onEdit={() => setEditing(event)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / edit */}
      {adding || editing ? (
        <div className="card mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {editing ? "Edit event" : "New event"}
          </h2>
          <EventForm
            existing={editing ?? undefined}
            defaultDayKey={selectedDay}
            onSave={saveEvent}
            onDelete={editing ? deleteEvent : undefined}
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
          Add event
        </button>
      )}

      <div className="mt-6">
        <SubscribeCard initialToken={calendarToken} />
      </div>
    </main>
  );
}

function EventRow({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: () => void;
}) {
  return (
    <li className="card">
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
        style={{ minHeight: 52, WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums"
          style={{ color: "var(--accent)", minWidth: 48 }}
        >
          {timeLabel(event)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{event.title}</span>
          {event.note && (
            <span className="muted mt-0.5 block whitespace-pre-wrap text-xs">
              {event.note}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
