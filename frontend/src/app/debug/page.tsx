"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WsState = "idle" | "connecting" | "open" | "closing" | "closed";

interface DebugEntry {
    id: number;
    receivedAt: number;
    type: string;
    raw: unknown;
}

const DEFAULT_URL =
    typeof window !== "undefined"
        ? `ws://${window.location.hostname}:4000/ws`
        : "ws://localhost:4000/ws";

const TYPE_COLORS: Record<string, string> = {
    hello: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    state: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    patch: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    smis: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    snapshot: "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const MAX_ENTRIES = 500;

/**
 * クラウドサーバー `/ws` から流れてくる JSON をストリーム表示するデバッグページ。
 *
 * - 6 月のサーキットテストで、Receiver → クラウド → ブラウザの疎通を
 *   生 JSON レベルで確認するための画面。
 * - 後日、本物のタイミングテーブル UI を `state` + `patch` で結線する際の
 *   足がかりにもなる。
 */
export default function DebugPage() {
    const [url, setUrl] = useState<string>(DEFAULT_URL);
    const [token, setToken] = useState<string>("");
    const [wsState, setWsState] = useState<WsState>("idle");
    const [entries, setEntries] = useState<DebugEntry[]>([]);
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [filter, setFilter] = useState<Record<string, boolean>>({
        hello: true,
        state: true,
        patch: true,
        smis: true,
        snapshot: true,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const counterRef = useRef(0);
    const pausedRef = useRef(paused);
    const filterRef = useRef(filter);
    const listEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);
    useEffect(() => {
        filterRef.current = filter;
    }, [filter]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const e of entries) c[e.type] = (c[e.type] ?? 0) + 1;
        return c;
    }, [entries]);

    const connect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        setWsState("connecting");
        const target = token ? `${url}?token=${encodeURIComponent(token)}` : url;
        const ws = new WebSocket(target);
        wsRef.current = ws;

        ws.onopen = () => setWsState("open");
        ws.onclose = () => setWsState("closed");
        ws.onerror = () => setWsState("closed");
        ws.onmessage = (ev) => {
            if (pausedRef.current) return;
            try {
                const data = JSON.parse(ev.data as string);
                const type = typeof data?.type === "string" ? data.type : "unknown";
                if (filterRef.current[type] === false) return;
                const entry: DebugEntry = {
                    id: ++counterRef.current,
                    receivedAt: Date.now(),
                    type,
                    raw: data,
                };
                setEntries((prev) => {
                    const next = [...prev, entry];
                    if (next.length > MAX_ENTRIES) next.splice(0, next.length - MAX_ENTRIES);
                    return next;
                });
            } catch {
                /* ignore */
            }
        };
    }, [url, token]);

    const disconnect = useCallback(() => {
        if (!wsRef.current) return;
        setWsState("closing");
        wsRef.current.close();
        wsRef.current = null;
    }, []);

    const clearAll = useCallback(() => {
        setEntries([]);
        counterRef.current = 0;
    }, []);

    useEffect(() => {
        return () => {
            wsRef.current?.close();
        };
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [entries, autoScroll]);

    const toggleFilter = (k: string) =>
        setFilter((prev) => ({ ...prev, [k]: !prev[k] }));

    return (
        <main className="flex h-screen w-screen flex-col bg-[#0c0c0f] text-zinc-200">
            <header className="flex flex-col gap-2 border-b border-zinc-800 bg-[#15151a] px-4 py-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-base font-bold tracking-wider text-zinc-100">
                        WS Debug Stream
                    </h1>
                    <span className={statePill(wsState)}>{wsState.toUpperCase()}</span>
                    <span className="ml-auto text-xs text-zinc-500">
                        {entries.length}/{MAX_ENTRIES} entries
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1">
                        <span className="text-zinc-500">URL</span>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="w-80 rounded border border-zinc-700 bg-[#0c0c0f] px-2 py-1 font-mono text-zinc-200"
                        />
                    </label>
                    <label className="flex items-center gap-1">
                        <span className="text-zinc-500">Token</span>
                        <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="(optional)"
                            className="w-40 rounded border border-zinc-700 bg-[#0c0c0f] px-2 py-1 font-mono text-zinc-200"
                        />
                    </label>
                    {wsState === "open" ? (
                        <button
                            onClick={disconnect}
                            className="rounded bg-red-600/80 px-3 py-1 font-semibold hover:bg-red-600"
                        >
                            Disconnect
                        </button>
                    ) : (
                        <button
                            onClick={connect}
                            className="rounded bg-emerald-600/80 px-3 py-1 font-semibold hover:bg-emerald-600"
                        >
                            Connect
                        </button>
                    )}
                    <button
                        onClick={() => setPaused((p) => !p)}
                        className={`rounded px-3 py-1 font-semibold ${
                            paused ? "bg-amber-500/80 hover:bg-amber-500" : "bg-zinc-700 hover:bg-zinc-600"
                        }`}
                    >
                        {paused ? "Resume" : "Pause"}
                    </button>
                    <button
                        onClick={clearAll}
                        className="rounded bg-zinc-700 px-3 py-1 font-semibold hover:bg-zinc-600"
                    >
                        Clear
                    </button>
                    <label className="ml-2 flex items-center gap-1 text-zinc-400">
                        <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => setAutoScroll(e.target.checked)}
                        />
                        Auto scroll
                    </label>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                    {Object.keys(filter).map((k) => (
                        <button
                            key={k}
                            onClick={() => toggleFilter(k)}
                            className={`rounded border px-2 py-0.5 font-mono ${
                                filter[k]
                                    ? TYPE_COLORS[k] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600"
                                    : "border-zinc-800 bg-transparent text-zinc-600 line-through"
                            }`}
                        >
                            {k} ({counts[k] ?? 0})
                        </button>
                    ))}
                </div>
            </header>

            <section className="flex-1 overflow-auto bg-[#0c0c0f] font-mono text-xs">
                {entries.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                        {wsState === "open"
                            ? "Waiting for messages…"
                            : "Press Connect to start streaming"}
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-900">
                        {entries.map((e) => (
                            <li key={e.id} className="px-4 py-2 hover:bg-[#15151a]">
                                <div className="mb-1 flex items-center gap-2 text-[10px] text-zinc-500">
                                    <span className="tabular-nums">#{e.id}</span>
                                    <span>{new Date(e.receivedAt).toISOString().slice(11, 23)}</span>
                                    <span
                                        className={`rounded border px-1.5 py-0.5 font-bold ${
                                            TYPE_COLORS[e.type] ??
                                            "border-zinc-700 bg-zinc-800 text-zinc-300"
                                        }`}
                                    >
                                        {e.type}
                                    </span>
                                    <Summary entry={e} />
                                </div>
                                <details>
                                    <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                                        show payload
                                    </summary>
                                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-[#0a0a0d] p-2 text-[11px] text-zinc-300">
                                        {JSON.stringify(e.raw, null, 2)}
                                    </pre>
                                </details>
                            </li>
                        ))}
                        <div ref={listEndRef} />
                    </ul>
                )}
            </section>
        </main>
    );
}

function statePill(state: WsState): string {
    const base = "rounded border px-2 py-0.5 text-xs font-bold";
    switch (state) {
        case "open":
            return `${base} border-emerald-500/40 bg-emerald-500/20 text-emerald-300`;
        case "connecting":
            return `${base} border-amber-500/40 bg-amber-500/20 text-amber-300`;
        case "closing":
        case "closed":
            return `${base} border-zinc-700 bg-zinc-800 text-zinc-400`;
        default:
            return `${base} border-zinc-700 bg-zinc-800 text-zinc-400`;
    }
}

interface SummaryProps {
    entry: DebugEntry;
}

function Summary({ entry }: SummaryProps) {
    const r = entry.raw as Record<string, unknown> | null;
    if (!r) return null;

    switch (entry.type) {
        case "hello": {
            return (
                <span className="text-zinc-500">
                    serverTime={String(r["serverTime"] ?? "")} circuitId=
                    {String(r["circuitId"] ?? "")}
                </span>
            );
        }
        case "state": {
            const s = r["state"] as Record<string, unknown> | undefined;
            const standings = (s?.["standings"] as unknown[]) ?? [];
            const teams = (s?.["teams"] as unknown[]) ?? [];
            return (
                <span className="text-zinc-500">
                    standings={standings.length} teams={teams.length} circuit=
                    {String(s?.["circuitId"] ?? "")}
                </span>
            );
        }
        case "patch": {
            const patches = (r["patches"] as Array<Record<string, unknown>>) ?? [];
            const kinds = patches.map((p) => p["kind"]).join(",");
            return <span className="text-zinc-500">[{kinds}]</span>;
        }
        case "smis": {
            const env = r["envelope"] as Record<string, unknown> | undefined;
            return (
                <span className="text-zinc-500">
                    seq={String(env?.["seq"] ?? "")} kind={String(env?.["kind"] ?? "")}
                </span>
            );
        }
        default:
            return null;
    }
}
