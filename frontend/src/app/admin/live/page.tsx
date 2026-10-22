"use client";

import { useEffect, useState } from "react";
import {
  AdminApiError,
  adminGetLiveDisplay,
  adminResetLiveDisplay,
  adminSaveLiveDisplay,
  type AdminElapsedIdle,
  type AdminLiveColumn,
  type AdminLiveColumnOption,
  type AdminLiveDisplay,
  type AdminLivePresetMode,
  type AdminLiveSession,
} from "@/lib/adminApi";
import {
  DEFAULT_LIVE_COLUMNS,
  LIVE_COLUMN_GUIDE,
  isLiveColumnKey,
  resolveLiveColumns,
  resolveLivePresets,
  type LiveColumnDef,
} from "@/lib/liveColumns";
import { DEFAULT_ELAPSED_IDLE, sanitizeElapsedIdle } from "@/lib/elapsedIdle";
import LiveEntryEditor from "@/components/admin/LiveEntryEditor";

/**
 * Live Timing 表の列を、並び・名称・表示/非表示・プルダウン内容まで編集する。
 * 予選・練習と決勝で別々に保存し、MOLA のラウンドに合わせて Live が切り替える。
 */

type Draft = AdminLiveColumn;
type PresetMode = AdminLivePresetMode;

const EMPTY_SESSION: AdminLiveSession = { mode: "time", roundName: "" };

export default function AdminLiveDisplayPage() {
  const [presets, setPresets] = useState<{ time: Draft[]; race: Draft[] }>({ time: [], race: [] });
  const [editing, setEditing] = useState<PresetMode>("time");
  const [autoPreset, setAutoPreset] = useState(true);
  const [pinnedPreset, setPinnedPreset] = useState<PresetMode>("time");
  const [liveSession, setLiveSession] = useState<AdminLiveSession>(EMPTY_SESSION);
  const [elapsed, setElapsed] = useState<AdminElapsedIdle>(DEFAULT_ELAPSED_IDLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const draft = presets[editing];

  const applyLoaded = (data: AdminLiveDisplay, jumpToLive: boolean) => {
    const columns = resolveLiveColumns(data.columns);
    const resolved = resolveLivePresets(data.presets, columns);
    setPresets({ time: clone(resolved.time), race: clone(resolved.race) });
    setElapsed(sanitizeElapsedIdle(data.elapsed));
    setAutoPreset(data.autoPreset !== false);
    setPinnedPreset(data.pinnedPreset === "race" ? "race" : "time");
    if (data.liveSession) setLiveSession(data.liveSession);
    if (jumpToLive && data.liveSession) setEditing(data.liveSession.mode);
    setDirty(false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await adminGetLiveDisplay();
        if (cancelled) return;
        applyLoaded(data, true);
      } catch (err) {
        if (cancelled) return;
        setError(describe(err));
        const fallback = clone(DEFAULT_LIVE_COLUMNS);
        setPresets({ time: fallback, race: clone(DEFAULT_LIVE_COLUMNS) });
        setElapsed(DEFAULT_ELAPSED_IDLE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void adminGetLiveDisplay()
        .then((data) => {
          if (!cancelled && data.liveSession) setLiveSession(data.liveSession);
        })
        .catch(() => {
          /* 表示中セッションの更新に失敗しても編集は続けられる */
        });
    };
    const id = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const update = (next: Draft[]) => {
    setPresets((prev) => ({ ...prev, [editing]: next }));
    setDirty(true);
    setNotice(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    update(next);
  };

  const patchColumn = (index: number, patch: Partial<Draft>) => {
    const next = [...draft];
    next[index] = { ...next[index]!, ...patch };
    update(next);
  };

  const patchOption = (colIndex: number, optIndex: number, patch: Partial<AdminLiveColumnOption>) => {
    const col = draft[colIndex];
    if (!col?.toggle) return;
    const options = col.toggle.options.map((opt, i) => (i === optIndex ? { ...opt, ...patch } : opt));
    const visible = options.filter((o) => o.visible);
    let defaultValue = col.toggle.defaultValue;
    if (!visible.some((o) => o.value === defaultValue)) {
      defaultValue = visible[0]?.value ?? defaultValue;
    }
    const next = [...draft];
    next[colIndex] = { ...col, toggle: { defaultValue, options } };
    update(next);
  };

  const setDefaultOption = (colIndex: number, value: string) => {
    const col = draft[colIndex];
    if (!col?.toggle) return;
    const next = [...draft];
    next[colIndex] = { ...col, toggle: { ...col.toggle, defaultValue: value } };
    update(next);
  };

  const patchElapsed = (patch: Partial<AdminElapsedIdle>) => {
    setElapsed((prev) => sanitizeElapsedIdle({ ...prev, ...patch }));
    setDirty(true);
    setNotice(null);
  };

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
  };

  const copyToOther = () => {
    const other: PresetMode = editing === "time" ? "race" : "time";
    setPresets((prev) => ({ ...prev, [other]: clone(prev[editing]) }));
    setDirty(true);
    setNotice(
      editing === "time"
        ? "予選の並びを決勝にコピーしました。保存するまで Live には出ません。"
        : "決勝の並びを予選にコピーしました。保存するまで Live には出ません。",
    );
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await adminSaveLiveDisplay({ presets, elapsed, autoPreset, pinnedPreset });
      applyLoaded(saved, false);
      setNotice("保存しました。接続中の Live 画面に反映されます。");
    } catch (err) {
      setError(describe(err));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setPresets((prev) => ({ ...prev, [editing]: clone(DEFAULT_LIVE_COLUMNS) }));
    setDirty(true);
    setNotice("この並びを既定に戻しました。保存するまで Live には反映されません。");
  };

  const resetLive = async () => {
    if (resetting) return;
    if (
      !window.confirm(
        "公開中の Live / Tracking に出ているタイムと経過時間を消します。履歴データは消えません。実行しますか？",
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await adminResetLiveDisplay();
      setNotice("Live 画面をリセットしました。次の Select が来れば通常どおり始まります。");
    } catch (err) {
      setError(describe(err));
    } finally {
      setResetting(false);
    }
  };

  const visibleCount = draft.filter((c) => c.visible).length;

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-4">
      <div className="mb-4">
        <h2 className="text-sm font-bold tracking-wider text-white uppercase">Live 表示</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          タイミング表の列の並び・名称・表示／非表示と、ヘッダーのプルダウン（Car / Behind など）を編集します。
          予選・練習と決勝で別の並びを保存しておくと、MOLA のラウンド名を見て Live が自動で切り替わります。
          経過時間は Passing が止まったあとの扱いもここで変えます（赤旗中断でも Passing は止まるので、セッション終了そのものではありません）。
        </p>
      </div>

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

      <LiveEntryEditor />

      <LiveResetCard resetting={resetting} onReset={() => void resetLive()} />

      <ElapsedIdleEditor elapsed={elapsed} disabled={loading} onChange={patchElapsed} />

      <PresetBar
        editing={editing}
        autoPreset={autoPreset}
        pinnedPreset={pinnedPreset}
        liveSession={liveSession}
        disabled={loading}
        onEditing={setEditing}
        onAuto={(next) => {
          setAutoPreset(next);
          markDirty();
        }}
        onPinned={(next) => {
          setPinnedPreset(next);
          markDirty();
        }}
        onCopy={copyToOther}
      />

      {loading ? (
        <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-500">
          読み込み中…
        </div>
      ) : (
        <HeaderPreview columns={draft} mode={editing} />
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          {editing === "race" ? "決勝" : "予選・練習"} · 表示 {visibleCount} / {draft.length} 列
          {dirty ? " · 未保存の変更あり" : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            disabled={loading}
            className="rounded-md border border-zinc-600 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white disabled:opacity-50"
          >
            この並びを既定に戻す
          </button>
          <button
            type="button"
            disabled={saving || loading || !dirty}
            onClick={() => void save()}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {saving ? "保存中…" : "保存して Live に反映"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">読み込み中…</div>
        ) : (
          draft.map((col, index) => (
            <ColumnEditor
              key={col.key}
              col={col}
              index={index}
              total={draft.length}
              open={openKey === col.key}
              onToggleOpen={() => setOpenKey(openKey === col.key ? null : col.key)}
              onMove={move}
              onPatch={patchColumn}
              onPatchOption={patchOption}
              onDefaultOption={setDefaultOption}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LiveResetCard({
  resetting,
  onReset,
}: {
  resetting: boolean;
  onReset: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
            Live 画面のリセット
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            いま出ているタイム・経過時間を消します。車番などのエントリーは残ります。
            計測の履歴は消えません。次に Select が来れば、通常どおり始まります。
          </p>
        </div>
        <button
          type="button"
          disabled={resetting}
          onClick={onReset}
          className="flex-shrink-0 rounded-md border border-red-800 bg-red-950/40 px-3 py-1.5 text-[11px] font-bold text-red-200 transition-colors hover:border-red-600 hover:bg-red-900/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? "リセット中…" : "Reset"}
        </button>
      </div>
    </div>
  );
}

function ElapsedIdleEditor({
  elapsed,
  disabled,
  onChange,
}: {
  elapsed: AdminElapsedIdle;
  disabled: boolean;
  onChange: (patch: Partial<AdminElapsedIdle>) => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 sm:p-4">
      <h3 className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
        経過時間（ELAPSED）
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Passing が途絶えてから止めるまでの秒数です。0 にすると従来どおり動き続けます。
        赤旗やセッション終了でも Passing は止まるので、終わったかどうかの判定には使いません。
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wider text-zinc-500 uppercase">停止までの秒</span>
          <input
            type="number"
            min={0}
            max={3600}
            step={1}
            disabled={disabled}
            value={elapsed.idleThresholdSec}
            onChange={(e) => onChange({ idleThresholdSec: Number(e.target.value) })}
            className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500 disabled:opacity-50"
          />
        </label>
        <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
          <legend className="text-[10px] tracking-wider text-zinc-500 uppercase">止めたあとの表示</legend>
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <input
              type="radio"
              name="elapsed-idle-display"
              checked={elapsed.idleDisplay === "freeze"}
              onChange={() => onChange({ idleDisplay: "freeze" })}
              className="accent-amber-500"
            />
            最後の経過時間のまま止める
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <input
              type="radio"
              name="elapsed-idle-display"
              checked={elapsed.idleDisplay === "blank"}
              onChange={() => onChange({ idleDisplay: "blank" })}
              className="accent-amber-500"
            />
            ---- にする
          </label>
        </fieldset>
      </div>
    </div>
  );
}

function presetName(mode: PresetMode): string {
  return mode === "race" ? "決勝" : "予選・練習";
}

function sessionStatus(session: AdminLiveSession, auto: boolean, pinned: PresetMode): string {
  if (!auto) {
    return `自動切替はオフです。Live には${presetName(pinned)}の並びを出します。`;
  }
  if (!session.roundName) {
    return "MOLA のラウンドが来ると、予選・練習か決勝かを見て並びを切り替えます。";
  }
  return `いまのラウンド「${session.roundName}」→ ${presetName(session.mode)}の並び`;
}

function PresetBar({
  editing,
  autoPreset,
  pinnedPreset,
  liveSession,
  disabled,
  onEditing,
  onAuto,
  onPinned,
  onCopy,
}: {
  editing: PresetMode;
  autoPreset: boolean;
  pinnedPreset: PresetMode;
  liveSession: AdminLiveSession;
  disabled: boolean;
  onEditing: (mode: PresetMode) => void;
  onAuto: (next: boolean) => void;
  onPinned: (mode: PresetMode) => void;
  onCopy: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 sm:p-4">
      <h3 className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
        予選と決勝の並び
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        予選・練習・専有と、決勝で列の並びを別々に保存します。
        MOLA のラウンド名（予選 / Qualifying、決勝 / Race など）を見て、Live が自動で切り替えます。
        管理画面を開いたままでいる必要はありません。
      </p>
      <p className="mt-2 text-[11px] text-amber-200/90">{sessionStatus(liveSession, autoPreset, pinnedPreset)}</p>

      <label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-zinc-200">
        <input
          type="checkbox"
          checked={autoPreset}
          disabled={disabled}
          onChange={(e) => onAuto(e.target.checked)}
          className="accent-amber-500"
        />
        セッションに合わせて自動で切り替える
      </label>

      {!autoPreset ? (
        <div className="mt-3">
          <p className="text-[10px] tracking-wider text-zinc-500 uppercase">自動を切っているあいだ出す並び</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <PresetTab
              active={pinnedPreset === "time"}
              disabled={disabled}
              onClick={() => onPinned("time")}
            >
              予選・練習
            </PresetTab>
            <PresetTab
              active={pinnedPreset === "race"}
              disabled={disabled}
              onClick={() => onPinned("race")}
            >
              決勝
            </PresetTab>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] tracking-wider text-zinc-500 uppercase">編集する並び</span>
        <PresetTab active={editing === "time"} disabled={disabled} onClick={() => onEditing("time")}>
          予選・練習
        </PresetTab>
        <PresetTab active={editing === "race"} disabled={disabled} onClick={() => onEditing("race")}>
          決勝
        </PresetTab>
        <button
          type="button"
          disabled={disabled}
          onClick={onCopy}
          className="rounded-md border border-zinc-600 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white disabled:opacity-50"
        >
          {editing === "time" ? "この並びを決勝にコピー" : "この並びを予選にコピー"}
        </button>
      </div>
    </div>
  );
}

function PresetTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
          : "rounded-md border border-zinc-600 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function HeaderPreview({ columns, mode }: { columns: Draft[]; mode: PresetMode }) {
  const shown = columns.filter((c) => c.visible && (mode === "race" || !c.raceOnly));
  const hidesRaceOnly = mode === "time" && columns.some((c) => c.visible && c.raceOnly);
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-950">
      <p className="px-3 pt-2 text-[10px] tracking-wider text-zinc-500 uppercase">
        プレビュー（{mode === "race" ? "決勝" : "予選"}で出る列）
      </p>
      {hidesRaceOnly ? (
        <p className="px-3 text-[10px] text-zinc-600">順位変動は決勝のときだけ出ます</p>
      ) : null}
      <div className="flex min-w-max gap-px px-2 py-2">
        {shown.length === 0 ? (
          <span className="px-2 text-xs text-zinc-600">表示列がありません</span>
        ) : (
          shown.map((col) => {
            const toggleLabel = col.toggle
              ? col.toggle.options.find((o) => o.value === col.toggle!.defaultValue && o.visible)?.label
                ?? col.toggle.options.find((o) => o.visible)?.label
                ?? col.label
              : col.label;
            return (
              <div
                key={col.key}
                className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] font-semibold tracking-wider text-white uppercase"
              >
                {toggleLabel || col.key}
                {col.raceOnly ? (
                  <span className="ml-1 font-normal normal-case tracking-normal text-zinc-500">決勝</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ColumnEditor({
  col,
  index,
  total,
  open,
  onToggleOpen,
  onMove,
  onPatch,
  onPatchOption,
  onDefaultOption,
}: {
  col: Draft;
  index: number;
  total: number;
  open: boolean;
  onToggleOpen: () => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onPatch: (index: number, patch: Partial<Draft>) => void;
  onPatchOption: (colIndex: number, optIndex: number, patch: Partial<AdminLiveColumnOption>) => void;
  onDefaultOption: (colIndex: number, value: string) => void;
}) {
  const guide = isLiveColumnKey(col.key) ? LIVE_COLUMN_GUIDE[col.key] : col.key;
  return (
    <div className={`border-b border-zinc-800/80 last:border-b-0 ${col.visible ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label="上へ"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            className="rounded px-1 text-[10px] text-zinc-400 hover:text-white disabled:text-zinc-700"
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="下へ"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            className="rounded px-1 text-[10px] text-zinc-400 hover:text-white disabled:text-zinc-700"
          >
            ▼
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
          <input
            type="checkbox"
            checked={col.visible}
            onChange={(e) => onPatch(index, { visible: e.target.checked })}
            className="accent-amber-500"
          />
          表示
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-500">{col.key}</span>
            {col.raceOnly ? (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">決勝のみ</span>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-zinc-500">{guide}</p>
        </div>

        <input
          type="text"
          value={col.label}
          maxLength={24}
          placeholder="ヘッダー名"
          onChange={(e) => onPatch(index, { label: e.target.value })}
          className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-500 sm:w-36"
        />

        {col.toggle ? (
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            {open ? "プルダウンを閉じる" : "プルダウン"}
          </button>
        ) : null}
      </div>

      {open && col.toggle ? (
        <div className="border-t border-zinc-800 bg-zinc-950/50 px-3 py-3 sm:pl-14">
          <p className="mb-2 text-[10px] tracking-wider text-zinc-500 uppercase">
            プルダウンの値 · 初期表示に使う項目を選ぶ
          </p>
          <div className="space-y-2">
            {col.toggle.options.map((opt, optIndex) => (
              <div key={opt.value} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                  <input
                    type="radio"
                    name={`default-${col.key}`}
                    checked={col.toggle?.defaultValue === opt.value}
                    disabled={!opt.visible}
                    onChange={() => onDefaultOption(index, opt.value)}
                    className="accent-amber-500"
                  />
                  初期
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={opt.visible}
                    onChange={(e) => onPatchOption(index, optIndex, { visible: e.target.checked })}
                    className="accent-amber-500"
                  />
                  出す
                </label>
                <span className="w-16 font-mono text-[10px] text-zinc-500">{opt.value}</span>
                <input
                  type="text"
                  value={opt.label}
                  maxLength={24}
                  onChange={(e) => onPatchOption(index, optIndex, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-500"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function clone(columns: LiveColumnDef[] | AdminLiveColumn[]): Draft[] {
  return columns.map((c) => ({
    key: c.key,
    label: c.label,
    visible: c.visible,
    raceOnly: "raceOnly" in c ? Boolean(c.raceOnly) : false,
    toggle: c.toggle
      ? {
          defaultValue: c.toggle.defaultValue,
          options: c.toggle.options.map((o) => ({ ...o })),
        }
      : undefined,
  }));
}

function describe(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "処理に失敗しました";
}
