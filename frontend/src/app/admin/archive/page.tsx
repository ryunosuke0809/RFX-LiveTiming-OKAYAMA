"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminListDays,
  adminListSessions,
  adminSetDayActive,
  adminUpdateSession,
  type AdminArchiveDay,
  type AdminArchiveSession,
  type ArchiveSessionNames,
} from "@/lib/adminApi";

/**
 * 履歴データ管理。
 *
 * 「削除」は生データを消さず、公開表示から外すだけの論理削除。
 * 日付単位でもセッション単位でも切り替えられ、いつでも再表示できる。
 */

type NameDraft = Record<keyof ArchiveSessionNames, string>;

const NAME_FIELDS: Array<{ key: keyof ArchiveSessionNames; label: string }> = [
  { key: "categoryName", label: "カテゴリ" },
  { key: "roundName", label: "ラウンド" },
  { key: "sessionName", label: "セッション" },
  { key: "competitionName", label: "大会" },
];

export default function AdminArchivePage() {
  const [days, setDays] = useState<AdminArchiveDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AdminArchiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadDays = useCallback(async () => {
    setDaysLoading(true);
    try {
      const { days: rows } = await adminListDays();
      // 新しい日付を上に出す
      setDays([...rows].sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      setError(describe(err));
    } finally {
      setDaysLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async (date: string) => {
    setSessionsLoading(true);
    setError(null);
    try {
      const { sessions: rows } = await adminListSessions(date);
      setSessions(rows);
    } catch (err) {
      setSessions([]);
      setError(describe(err));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { days: rows } = await adminListDays();
        if (cancelled) return;
        setDays([...rows].sort((a, b) => b.date.localeCompare(a.date)));
      } catch (err) {
        if (!cancelled) setError(describe(err));
      } finally {
        if (!cancelled) setDaysLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectDate = (date: string) => {
    const next = selectedDate === date ? null : date;
    setSelectedDate(next);
    setEditingKey(null);
    if (!next) {
      setSessions([]);
      return;
    }
    void loadSessions(next);
  };

  const toggleDay = async (date: string, nextActive: boolean) => {
    setBusyKey(`day:${date}`);
    setError(null);
    try {
      await adminSetDayActive(date, nextActive);
      setDays((prev) =>
        prev.map((d) => (d.date === date ? { ...d, active: nextActive } : d)),
      );
      setNotice(
        nextActive
          ? `${date} を再表示しました`
          : `${date} を非表示にしました（データは残っています）`,
      );
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSession = async (session: AdminArchiveSession, nextActive: boolean) => {
    if (!selectedDate) return;
    setBusyKey(session.sessionKey);
    setError(null);
    try {
      await adminUpdateSession({
        date: selectedDate,
        sessionKey: session.sessionKey,
        active: nextActive,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionKey === session.sessionKey ? { ...s, active: nextActive } : s,
        ),
      );
      setNotice(
        nextActive
          ? "セッションを再表示しました"
          : "セッションを非表示にしました（データは残っています）",
      );
      await loadDays();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyKey(null);
    }
  };

  const saveNames = async (session: AdminArchiveSession, draft: NameDraft) => {
    if (!selectedDate) return;
    setBusyKey(session.sessionKey);
    setError(null);
    try {
      await adminUpdateSession({
        date: selectedDate,
        sessionKey: session.sessionKey,
        names: draft,
      });
      setEditingKey(null);
      setNotice("表示名を保存しました");
      await loadSessions(selectedDate);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-4">
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        非表示にしたデータは Result のカレンダーと一覧から消え、直接 URL を叩いても取得できなくなります。
        生データは削除されないため、いつでも再表示できます。
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold tracking-wider text-zinc-400 uppercase">
          日付
        </h2>
        <div className="divide-y divide-zinc-800/50 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80">
          {daysLoading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">読み込み中…</div>
          ) : days.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">
              まだ記録された日付がありません。
            </div>
          ) : (
            days.map((day) => (
              <div
                key={day.date}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 transition-colors sm:px-4 ${
                  selectedDate === day.date ? "bg-amber-600/10" : "hover:bg-zinc-800/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectDate(day.date)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`font-mono text-sm ${day.active ? "text-zinc-200" : "text-zinc-500 line-through"}`}
                  >
                    {day.date}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    {day.active ? "公開中" : "非表示"}
                    {day.hasHiddenSessions ? " · 一部セッション非表示" : ""}
                  </span>
                </button>
                <ActiveToggle
                  active={day.active}
                  busy={busyKey === `day:${day.date}`}
                  onChange={(next) => void toggleDay(day.date, next)}
                />
              </div>
            ))
          )}
        </div>
      </section>

      {selectedDate && (
        <section>
          <h2 className="mb-2 text-xs font-bold tracking-wider text-zinc-400 uppercase">
            {selectedDate} のセッション
          </h2>
          <div className="divide-y divide-zinc-800/50 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80">
            {sessionsLoading ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">読み込み中…</div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-600">
                この日にセッションはありません。
              </div>
            ) : (
              sessions.map((session) => (
                <SessionRow
                  key={session.sessionKey}
                  session={session}
                  editing={editingKey === session.sessionKey}
                  busy={busyKey === session.sessionKey}
                  onToggleEdit={() =>
                    setEditingKey(editingKey === session.sessionKey ? null : session.sessionKey)
                  }
                  onToggleActive={(next) => void toggleSession(session, next)}
                  onSaveNames={(draft) => void saveNames(session, draft)}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SessionRow({
  session,
  editing,
  busy,
  onToggleEdit,
  onToggleActive,
  onSaveNames,
}: {
  session: AdminArchiveSession;
  editing: boolean;
  busy: boolean;
  onToggleEdit: () => void;
  onToggleActive: (next: boolean) => void;
  onSaveNames: (draft: NameDraft) => void;
}) {
  const title =
    [session.roundName, session.sessionName].filter(Boolean).join(" · ") ||
    session.categoryName ||
    session.sessionKey;
  const hasOverride = NAME_FIELDS.some(({ key }) => session.overrides[key] !== null);

  return (
    <div className={`px-3 py-3 sm:px-4 ${session.active ? "" : "bg-zinc-950/40"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${session.active ? "text-zinc-200" : "text-zinc-500 line-through"}`}
          >
            {title}
          </span>
          <span className="block truncate text-xs text-zinc-500">
            {session.categoryName || session.competitionName || "OKAYAMA"}
            {session.carCount > 0 ? ` · ${session.carCount} 台` : ""}
            {session.isRace ? " · 決勝" : ""}
            {hasOverride ? " · 表示名を上書き中" : ""}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleEdit}
            className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
          >
            {editing ? "閉じる" : "表示名"}
          </button>
          <ActiveToggle active={session.active} busy={busy} onChange={onToggleActive} />
        </div>
      </div>

      {/* 編集を開いたときにマウントされるので、初期値は props からそのまま取れる */}
      {editing && (
        <NameEditor
          session={session}
          busy={busy}
          onCancel={onToggleEdit}
          onSave={onSaveNames}
        />
      )}
    </div>
  );
}

function NameEditor({
  session,
  busy,
  onCancel,
  onSave,
}: {
  session: AdminArchiveSession;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: NameDraft) => void;
}) {
  const [draft, setDraft] = useState<NameDraft>(() => toDraft(session));

  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        空欄にすると上書きを解除し、計測データそのままの名前に戻ります。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {NAME_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label
              className="mb-1 block text-[11px] font-semibold text-zinc-400"
              htmlFor={`${session.sessionKey}-${key}`}
            >
              {label}
            </label>
            <input
              id={`${session.sessionKey}-${key}`}
              type="text"
              value={draft[key]}
              placeholder={session.originalNames[key] || "(元データなし)"}
              onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(draft)}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

function ActiveToggle({
  active,
  busy,
  onChange,
}: {
  active: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onChange(!active)}
      className={`rounded-md px-3 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-zinc-700 text-zinc-200 hover:bg-red-700 hover:text-white"
          : "bg-emerald-700 text-white hover:bg-emerald-600"
      }`}
    >
      {busy ? "…" : active ? "非表示にする" : "再表示する"}
    </button>
  );
}

function toDraft(session: AdminArchiveSession): NameDraft {
  return {
    competitionName: session.overrides.competitionName ?? "",
    categoryName: session.overrides.categoryName ?? "",
    sessionName: session.overrides.sessionName ?? "",
    roundName: session.overrides.roundName ?? "",
  };
}

function describe(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return "通信に失敗しました";
}
