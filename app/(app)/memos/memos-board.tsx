"use client";

import { useState } from "react";

import { LiveBadge } from "@/components/live-badge";
import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { shortTime } from "@/lib/time";
import { useRealtimeList } from "@/lib/use-realtime-list";

export type Memo = {
  id: string;
  body: string;
  done: boolean;
  author_id: string | null;
  created_at: string;
};

const newestFirst = (a: Memo, b: Memo) =>
  b.created_at.localeCompare(a.created_at);

export function MemosBoard({
  familyId,
  currentMemberId,
  authorNames,
  initialMemos,
}: {
  familyId: string;
  currentMemberId: string;
  authorNames: Record<string, string>;
  initialMemos: Memo[];
}) {
  const { rows, status, upsert, remove } = useRealtimeList<Memo>({
    table: "memos",
    familyId,
    initial: initialMemos,
    sort: newestFirst,
  });

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function addMemo(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setBusy(true);
    setError(null);
    // Clear immediately so the field feels instant and is ready for the next note.
    setDraft("");

    const { data, error } = await supabase
      .from("memos")
      .insert({ family_id: familyId, author_id: currentMemberId, body })
      .select("id, body, done, author_id, created_at")
      .single();

    setBusy(false);
    if (error) {
      setError(error.message);
      setDraft(body); // Give the text back rather than losing it.
      return;
    }
    // The realtime echo would also add this; upsert is keyed by id so the row
    // never appears twice.
    if (data) upsert(data as Memo);
  }

  async function toggleDone(memo: Memo) {
    const next = !memo.done;
    // Optimistic: a checkbox that waits for the network feels broken.
    upsert({ ...memo, done: next });

    const { error } = await supabase
      .from("memos")
      .update({ done: next })
      .eq("id", memo.id);

    if (error) {
      upsert(memo); // Roll back.
      setError(error.message);
    }
  }

  async function saveEdit(memo: Memo, nextBody: string) {
    const body = nextBody.trim();
    setEditingId(null);
    if (!body || body === memo.body) return;

    upsert({ ...memo, body });

    const { error } = await supabase
      .from("memos")
      .update({ body })
      .eq("id", memo.id);

    if (error) {
      upsert(memo);
      setError(error.message);
    }
  }

  async function deleteMemo(memo: Memo) {
    if (!window.confirm("Delete this memo?")) return;

    remove(memo.id);

    const { error } = await supabase.from("memos").delete().eq("id", memo.id);
    if (error) {
      upsert(memo); // Put it back.
      setError(error.message);
    }
  }

  const open = rows.filter((m) => !m.done);
  const done = rows.filter((m) => m.done);

  return (
    <main className={`mx-auto max-w-md px-5 py-6 ${BOTTOM_NAV_SPACER}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Memos</h1>
        <LiveBadge status={status} />
      </header>

      {/* Quick capture */}
      <form onSubmit={addMemo} className="mb-5">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add a note or to-do…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            aria-label="New memo"
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

      {rows.length === 0 && (
        <p className="muted py-10 text-center text-sm">
          No memos yet. Add the first one above.
        </p>
      )}

      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((memo) => (
            <MemoRow
              key={memo.id}
              memo={memo}
              authorName={
                memo.author_id ? authorNames[memo.author_id] : undefined
              }
              editing={editingId === memo.id}
              onStartEdit={() => setEditingId(memo.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(body) => saveEdit(memo, body)}
              onToggle={() => toggleDone(memo)}
              onDelete={() => deleteMemo(memo)}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <h2 className="muted mb-2 mt-6 px-1 text-xs font-medium uppercase tracking-wide">
            Done ({done.length})
          </h2>
          <ul className="space-y-2">
            {done.map((memo) => (
              <MemoRow
                key={memo.id}
                memo={memo}
                authorName={
                  memo.author_id ? authorNames[memo.author_id] : undefined
                }
                editing={editingId === memo.id}
                onStartEdit={() => setEditingId(memo.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(body) => saveEdit(memo, body)}
                onToggle={() => toggleDone(memo)}
                onDelete={() => deleteMemo(memo)}
              />
            ))}
          </ul>
        </>
      )}

    </main>
  );
}

function MemoRow({
  memo,
  authorName,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggle,
  onDelete,
}: {
  memo: Memo;
  authorName?: string;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(memo.body);

  if (editing) {
    return (
      <li className="card p-3">
        <textarea
          className="input min-h-[76px] w-full resize-none py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          autoFocus
          aria-label="Edit memo"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => onSaveEdit(text)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={() => {
              setText(memo.body);
              onCancelEdit();
            }}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="card flex items-start gap-1 p-2">
      {/* Toggle done */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={memo.done ? "Mark as not done" : "Mark as done"}
        aria-pressed={memo.done}
        className="flex shrink-0 items-center justify-center"
        style={{ width: 44, height: 44, WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className="flex items-center justify-center rounded-full border-2"
          style={{
            width: 22,
            height: 22,
            borderColor: memo.done ? "var(--success)" : "var(--border)",
            background: memo.done ? "var(--success)" : "transparent",
          }}
        >
          {memo.done && (
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
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
      </button>

      {/* Body — tap to edit */}
      <button
        type="button"
        onClick={onStartEdit}
        className="min-w-0 flex-1 py-2 text-left"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className="block whitespace-pre-wrap text-sm"
          style={{
            textDecoration: memo.done ? "line-through" : "none",
            color: memo.done ? "var(--text-muted)" : "var(--text)",
          }}
        >
          {memo.body}
        </span>
        <span className="muted mt-1 block text-[11px]">
          {authorName ?? "Someone"} · {shortTime(memo.created_at)}
        </span>
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete memo"
        className="flex shrink-0 items-center justify-center"
        style={{ width: 44, height: 44, WebkitTapHighlightColor: "transparent" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
