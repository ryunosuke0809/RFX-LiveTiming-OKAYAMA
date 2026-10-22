"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LIVE_COLUMNS,
  resolveLiveColumns,
  resolveLivePresets,
  selectLiveColumns,
  type LiveColumnDef,
  type LiveColumnPresets,
  type LivePresetMode,
} from "./liveColumns";
import {
  DEFAULT_ELAPSED_IDLE,
  sanitizeElapsedIdle,
  type ElapsedIdleConfig,
} from "./elapsedIdle";

export interface LiveDisplayBundle {
  columns: LiveColumnDef[];
  presets: LiveColumnPresets;
  autoPreset: boolean;
  pinnedPreset: LivePresetMode;
}

type BundleListener = (bundle: LiveDisplayBundle) => void;
type ElapsedListener = (elapsed: ElapsedIdleConfig) => void;

const bundleListeners = new Set<BundleListener>();
const elapsedListeners = new Set<ElapsedListener>();

function cloneDefaults(): LiveColumnDef[] {
  return DEFAULT_LIVE_COLUMNS.map((c) => ({
    ...c,
    toggle: c.toggle
      ? { defaultValue: c.toggle.defaultValue, options: c.toggle.options.map((o) => ({ ...o })) }
      : undefined,
  }));
}

let currentBundle: LiveDisplayBundle = {
  columns: cloneDefaults(),
  presets: { time: cloneDefaults(), race: cloneDefaults() },
  autoPreset: true,
  pinnedPreset: "time",
};

let currentElapsed: ElapsedIdleConfig = { ...DEFAULT_ELAPSED_IDLE };

export function getLiveDisplayBundle(): LiveDisplayBundle {
  return currentBundle;
}

export function setLiveDisplayBundle(bundle: LiveDisplayBundle): void {
  currentBundle = bundle;
  for (const fn of bundleListeners) fn(bundle);
}

export function subscribeLiveDisplayBundle(fn: BundleListener): () => void {
  bundleListeners.add(fn);
  return () => {
    bundleListeners.delete(fn);
  };
}

export function getLiveDisplayColumns(): LiveColumnDef[] {
  return currentBundle.columns;
}

export function setLiveDisplayColumns(columns: LiveColumnDef[]): void {
  setLiveDisplayBundle({ ...currentBundle, columns });
}

export function applyDisplayLivePatch(patch: {
  columns?: unknown;
  elapsed?: unknown;
  presets?: unknown;
  autoPreset?: unknown;
  pinnedPreset?: unknown;
}): void {
  const prev = currentBundle;
  const columns = patch.columns !== undefined ? resolveLiveColumns(patch.columns) : prev.columns;
  const presets =
    patch.presets !== undefined ? resolveLivePresets(patch.presets, columns) : prev.presets;
  const autoPreset = typeof patch.autoPreset === "boolean" ? patch.autoPreset : prev.autoPreset;
  const pinnedPreset: LivePresetMode =
    patch.pinnedPreset === "race" || patch.pinnedPreset === "time"
      ? patch.pinnedPreset
      : prev.pinnedPreset;
  setLiveDisplayBundle({ columns, presets, autoPreset, pinnedPreset });
  if (patch.elapsed !== undefined) {
    setElapsedIdleConfig(sanitizeElapsedIdle(patch.elapsed));
  }
}

export function getElapsedIdleConfig(): ElapsedIdleConfig {
  return currentElapsed;
}

export function setElapsedIdleConfig(elapsed: ElapsedIdleConfig): void {
  currentElapsed = elapsed;
  for (const fn of elapsedListeners) fn(elapsed);
}

export function subscribeElapsedIdleConfig(fn: ElapsedListener): () => void {
  elapsedListeners.add(fn);
  return () => {
    elapsedListeners.delete(fn);
  };
}

export async function fetchLiveDisplayColumns(signal?: AbortSignal): Promise<LiveColumnDef[]> {
  const res = await fetch("/api/display/live", { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    columns?: unknown;
    elapsed?: unknown;
    presets?: unknown;
    autoPreset?: unknown;
    pinnedPreset?: unknown;
  };
  const columns = resolveLiveColumns(body.columns);
  const presets = resolveLivePresets(body.presets, columns);
  const autoPreset = typeof body.autoPreset === "boolean" ? body.autoPreset : true;
  const pinnedPreset: LivePresetMode = body.pinnedPreset === "race" ? "race" : "time";
  setLiveDisplayBundle({ columns, presets, autoPreset, pinnedPreset });
  setElapsedIdleConfig(sanitizeElapsedIdle(body.elapsed));
  return columns;
}

/** Live 表が使う列。自動切替オンなら予選/決勝のプリセット、オフなら固定した並び。 */
export function useLiveDisplayColumns(isRace = false): LiveColumnDef[] {
  const [bundle, setBundle] = useState<LiveDisplayBundle>(getLiveDisplayBundle);

  useEffect(() => {
    const unsub = subscribeLiveDisplayBundle(setBundle);
    const ac = new AbortController();
    void fetchLiveDisplayColumns(ac.signal).catch(() => {
      /* サーバー未起動のローカルでは既定のまま */
    });
    return () => {
      unsub();
      ac.abort();
    };
  }, []);

  return selectLiveColumns(bundle, isRace);
}

/** ELAPSED の Passing 停止設定。未取得時は既定（90秒でフリーズ）。 */
export function useElapsedIdleConfig(): ElapsedIdleConfig {
  const [elapsed, setElapsed] = useState<ElapsedIdleConfig>(getElapsedIdleConfig);

  useEffect(() => {
    const unsub = subscribeElapsedIdleConfig(setElapsed);
    const ac = new AbortController();
    void fetchLiveDisplayColumns(ac.signal).catch(() => {
      /* 既定のまま */
    });
    return () => {
      unsub();
      ac.abort();
    };
  }, []);

  return elapsed;
}
