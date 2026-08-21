"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LIVE_COLUMNS,
  resolveLiveColumns,
  type LiveColumnDef,
} from "./liveColumns";

type Listener = (columns: LiveColumnDef[]) => void;

const listeners = new Set<Listener>();
let current: LiveColumnDef[] = DEFAULT_LIVE_COLUMNS.map((c) => ({
  ...c,
  toggle: c.toggle
    ? { defaultValue: c.toggle.defaultValue, options: c.toggle.options.map((o) => ({ ...o })) }
    : undefined,
}));

export function getLiveDisplayColumns(): LiveColumnDef[] {
  return current;
}

export function setLiveDisplayColumns(columns: LiveColumnDef[]): void {
  current = columns;
  for (const fn of listeners) fn(columns);
}

export function subscribeLiveDisplayColumns(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function fetchLiveDisplayColumns(signal?: AbortSignal): Promise<LiveColumnDef[]> {
  const res = await fetch("/api/display/live", { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { columns?: unknown };
  const columns = resolveLiveColumns(body.columns);
  setLiveDisplayColumns(columns);
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
