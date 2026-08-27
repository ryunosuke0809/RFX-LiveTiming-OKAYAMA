"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LIVE_COLUMNS,
  resolveLiveColumns,
  type LiveColumnDef,
} from "./liveColumns";
import {
  DEFAULT_ELAPSED_IDLE,
  sanitizeElapsedIdle,
  type ElapsedIdleConfig,
} from "./elapsedIdle";

type ColumnListener = (columns: LiveColumnDef[]) => void;
type ElapsedListener = (elapsed: ElapsedIdleConfig) => void;

const columnListeners = new Set<ColumnListener>();
const elapsedListeners = new Set<ElapsedListener>();

let currentColumns: LiveColumnDef[] = DEFAULT_LIVE_COLUMNS.map((c) => ({
  ...c,
  toggle: c.toggle
    ? { defaultValue: c.toggle.defaultValue, options: c.toggle.options.map((o) => ({ ...o })) }
    : undefined,
}));

let currentElapsed: ElapsedIdleConfig = { ...DEFAULT_ELAPSED_IDLE };

export function getLiveDisplayColumns(): LiveColumnDef[] {
  return currentColumns;
}

export function setLiveDisplayColumns(columns: LiveColumnDef[]): void {
  currentColumns = columns;
  for (const fn of columnListeners) fn(columns);
}

export function subscribeLiveDisplayColumns(fn: ColumnListener): () => void {
  columnListeners.add(fn);
  return () => {
    columnListeners.delete(fn);
  };
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
  const body = (await res.json()) as { columns?: unknown; elapsed?: unknown };
  const columns = resolveLiveColumns(body.columns);
  setLiveDisplayColumns(columns);
  setElapsedIdleConfig(sanitizeElapsedIdle(body.elapsed));
  return columns;
}

/** Live 表が使う列設定。未取得・失敗時は現行の既定列。 */
export function useLiveDisplayColumns(): LiveColumnDef[] {
  const [columns, setColumns] = useState<LiveColumnDef[]>(getLiveDisplayColumns);

  useEffect(() => {
    const unsub = subscribeLiveDisplayColumns(setColumns);
    const ac = new AbortController();
    void fetchLiveDisplayColumns(ac.signal).catch(() => {
      /* サーバー未起動のローカルでは既定のまま */
    });
    return () => {
      unsub();
      ac.abort();
    };
  }, []);

  return columns;
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
