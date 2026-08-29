"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminListLiveEntries,
  adminPatchLiveEntry,
  type AdminLiveEntry,
} from "@/lib/adminApi";

/**
 * いまの走行エントリーを非表示にしたり、チーム名 / ドライバー名を直す。
 * SMIS が誤って送った車番を Live から消すための操作。
 */
export default function LiveEntryEditor() {
  const [entries, setEntries] = useState<AdminLiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, NameDraft>>({});
  const [quickNo, setQuickNo] = useState("");

  const load = useCallback(async () => {
    try {
      const { entries: next } = await adminListLiveEntries();
      setEntries(next);
      setDrafts((prev) => {
        const out: Record<string, NameDraft> = {};
        for (const e of next) {
          out[e.teamId] = prev[e.teamId] ?? {
            teamNameJ: e.teamNameJ,
            driverNameJ: e.driverNameJ,
          };
        }
        return out;
      });
      setError(null);
    } catch (err) {
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const apply = async (teamId: string, body: Parameters<typeof adminPatchLiveEntry>[1], ok: string) => {
    setBusyId(teamId);
    setError(null);
    try {
      const { entries: next } = await adminPatchLiveEntry(teamId, body);
      setEntries(next);
      setNotice(ok);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyId(null);
    }
  };

  const hideByNo = async () => {
    const no = quickNo.trim();
    if (!no) return;
    if (!window.confirm(`#${no} を Live から非表示にしますか？`)) return;
    await apply(no, { hidden: true }, `#${no} を非表示にしました`);
    setQuickNo("");
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-800/60 bg-zinc-900/80 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold tracking-wider text-amber-200 uppercase">
            エントリー（非表示・名前変更）
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            SMIS が誤って送った車を Live / Tracking から消します。履歴データは消えません。
            名前は上書きされ、SMIS が再送してもこちらが優先されます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-zinc-400 hover:text-white"
        >
          再読込
        </button>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mb-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void hideByNo();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wider text-zinc-500 uppercase">車番で非表示</span>
          <input
            value={quickNo}
            onChange={(e) => setQuickNo(e.target.value)}
            placeholder="54"
            className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-amber-500"
          />
        </label>
        <button
          type="submit"
          disabled={!quickNo.trim() || busyId !== null}
          className="rounded-md border border-red-800 bg-red-950/40 px-3 py-1.5 text-[11px] font-bold text-red-200 hover:border-red-600 hover:text-white disabled:opacity-50"
        >
          この車番を非表示
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-zinc-500">読み込み中…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-zinc-500">いまの走行エントリーはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-1 py-1 font-semibold">No</th>
                <th className="px-1 py-1 font-semibold">チーム名</th>
                <th className="px-1 py-1 font-semibold">ドライバー</th>
                <th className="px-1 py-1 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const draft = drafts[e.teamId] ?? {
                  teamNameJ: e.teamNameJ,
                  driverNameJ: e.driverNameJ,
                };
                const busy = busyId === e.teamId;
                return (
                  <tr
                    key={e.teamId}
                    className={`border-b border-zinc-800/80 ${e.hidden ? "opacity-50" : ""}`}
                  >
                    <td className="px-1 py-1.5 font-mono text-zinc-200">
                      {e.teamNo}
                      {e.hidden ? (
                        <span className="ml-1 text-[10px] text-red-400">非表示</span>
                      ) : null}
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        value={draft.teamNameJ}
                        disabled={busy}
                        onChange={(ev) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [e.teamId]: { ...draft, teamNameJ: ev.target.value },
                          }))
                        }
                        className="w-full min-w-[8rem] rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-zinc-100 outline-none focus:border-amber-500"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        value={draft.driverNameJ}
                        disabled={busy}
                        onChange={(ev) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [e.teamId]: { ...draft, driverNameJ: ev.target.value },
                          }))
                        }
                        className="w-full min-w-[8rem] rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-zinc-100 outline-none focus:border-amber-500"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void apply(
                              e.teamId,
                              { teamNameJ: draft.teamNameJ, driverNameJ: draft.driverNameJ },
                              `#${e.teamNo} の名前を保存しました`,
                            )
                          }
                          className="rounded border border-zinc-600 px-2 py-1 font-semibold text-zinc-200 hover:border-amber-500 hover:text-white disabled:opacity-50"
                        >
                          保存
                        </button>
                        {e.overridden ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void apply(e.teamId, { resetNames: true }, `#${e.teamNo} を SMIS の名前に戻しました`)
                            }
                            className="rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-50"
                          >
                            戻す
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void apply(
                              e.teamId,
                              { hidden: !e.hidden },
                              e.hidden ? `#${e.teamNo} を再表示しました` : `#${e.teamNo} を非表示にしました`,
                            )
                          }
                          className={`rounded border px-2 py-1 font-bold disabled:opacity-50 ${
                            e.hidden
                              ? "border-emerald-800 text-emerald-300 hover:border-emerald-500"
                              : "border-red-800 text-red-300 hover:border-red-500"
                          }`}
                        >
                          {e.hidden ? "再表示" : "非表示"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface NameDraft {
  teamNameJ: string;
  driverNameJ: string;
}

function describe(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "処理に失敗しました";
}
