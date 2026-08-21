/**
 * Live Timing 表の列定義。
 *
 * フロント `frontend/src/lib/liveColumns.ts` と同じキー・既定ラベルを持つ。
 * 幅や sticky はフロントが既定を使うので、サーバーは並び・表示・名称・
 * プルダウンだけを保存・検証する。
 */

export const LIVE_COLUMN_KEYS = [
    "status",
    "pos",
    "chg",
    "pic",
    "nr",
    "class",
    "driver",
    "car",
    "laps",
    "gap",
    "best",
    "s1",
    "s2",
    "s3",
    "pit",
] as const;

export type LiveColumnKey = (typeof LIVE_COLUMN_KEYS)[number];

export interface LiveColumnOption {
    value: string;
    label: string;
    visible: boolean;
}

export interface LiveColumnToggle {
    defaultValue: string;
    options: LiveColumnOption[];
}

export interface LiveColumnDef {
    key: LiveColumnKey;
    label: string;
    visible: boolean;
    raceOnly: boolean;
    toggle?: LiveColumnToggle;
}

interface DefaultColumn {
    key: LiveColumnKey;
    label: string;
    raceOnly?: boolean;
    toggle?: LiveColumnToggle;
}

const DEFAULTS: DefaultColumn[] = [
    { key: "status", label: "" },
    { key: "pos", label: "P" },
    { key: "chg", label: "", raceOnly: true },
    { key: "pic", label: "PIC" },
    { key: "nr", label: "No." },
    { key: "class", label: "Class" },
    { key: "driver", label: "Name" },
    {
        key: "car",
        label: "Car",
        toggle: {
            defaultValue: "car",
            options: [
                { value: "car", label: "Car", visible: true },
                { value: "team", label: "Team", visible: true },
            ],
        },
    },
    {
        key: "laps",
        label: "Laps",
        toggle: {
            defaultValue: "laps",
            options: [
                { value: "laps", label: "Laps", visible: true },
                { value: "time", label: "Time", visible: true },
                { value: "last", label: "Last", visible: true },
            ],
        },
    },
    {
        key: "gap",
        label: "Behind",
        toggle: {
            defaultValue: "gap",
            options: [
                { value: "gap", label: "Behind", visible: true },
                { value: "int", label: "Gap", visible: true },
            ],
        },
    },
    {
        key: "best",
        label: "Best",
        toggle: {
            defaultValue: "best",
            options: [
                { value: "best", label: "Best", visible: true },
                { value: "bestlap", label: "BestLap", visible: true },
            ],
        },
    },
    { key: "s1", label: "S1" },
    { key: "s2", label: "S2" },
    { key: "s3", label: "S3" },
    {
        key: "pit",
        label: "PIT",
        toggle: {
            defaultValue: "count",
            options: [
                { value: "count", label: "PIT", visible: true },
                { value: "time", label: "PIT Time", visible: true },
            ],
        },
    },
];

const MAX_LABEL = 24;

export function defaultLiveColumns(): LiveColumnDef[] {
    return DEFAULTS.map(toDef);
}

export function resolveLiveColumns(stored: unknown): LiveColumnDef[] {
    const defaults = defaultLiveColumns();
    const byKey = new Map(defaults.map((c) => [c.key, c]));
    const seen = new Set<LiveColumnKey>();
    const out: LiveColumnDef[] = [];
    const items = Array.isArray(stored) ? stored : [];
    for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const rec = raw as Record<string, unknown>;
        if (typeof rec.key !== "string" || !isLiveColumnKey(rec.key)) continue;
        const def = byKey.get(rec.key);
        if (!def || seen.has(rec.key)) continue;
        seen.add(rec.key);
        out.push(overlay(def, rec));
    }
    for (const def of defaults) {
        if (!seen.has(def.key)) out.push(def);
    }
    return out;
}

/**
 * 管理画面からの保存値を検証して正規化する。
 * 不正なら Error (日本語) を投げる。
 */
export function sanitizeLiveColumns(input: unknown): LiveColumnDef[] {
    if (!Array.isArray(input)) throw new Error("columns は配列にしてください");
    if (input.length > LIVE_COLUMN_KEYS.length + 4) {
        throw new Error("columns の件数が多すぎます");
    }

    const resolved = resolveLiveColumns(input);
    const alwaysVisible = resolved.filter((c) => c.visible && !c.raceOnly);
    if (alwaysVisible.length === 0) {
        throw new Error("決勝以外でも出る列を、少なくとも 1 つは表示にしてください");
    }
    for (const col of resolved) {
        if (col.label.length > MAX_LABEL) {
            throw new Error(`${col.key} の名称が長すぎます`);
        }
        if (!col.visible || !col.toggle) continue;
        const vis = col.toggle.options.filter((o) => o.visible);
        if (vis.length === 0) {
            throw new Error(`${col.key} のプルダウンは、少なくとも 1 つの値を表示にしてください`);
        }
        for (const opt of col.toggle.options) {
            if (opt.label.length === 0) {
                throw new Error(`${col.key} の「${opt.value}」に名称を入れてください`);
            }
            if (opt.label.length > MAX_LABEL) {
                throw new Error(`${col.key} のプルダウン名称が長すぎます`);
            }
        }
    }
    return resolved;
}

function toDef(src: DefaultColumn): LiveColumnDef {
    return {
        key: src.key,
        label: src.label,
        visible: true,
        raceOnly: src.raceOnly ?? false,
        toggle: src.toggle
            ? {
                  defaultValue: src.toggle.defaultValue,
                  options: src.toggle.options.map((o) => ({ ...o })),
              }
            : undefined,
    };
}

function overlay(def: LiveColumnDef, rec: Record<string, unknown>): LiveColumnDef {
    const next: LiveColumnDef = {
        key: def.key,
        label: def.label,
        visible: def.visible,
        raceOnly: def.raceOnly,
        toggle: def.toggle
            ? {
                  defaultValue: def.toggle.defaultValue,
                  options: def.toggle.options.map((o) => ({ ...o })),
              }
            : undefined,
    };
    if (typeof rec.label === "string") next.label = rec.label.trim().slice(0, MAX_LABEL);
    if (typeof rec.visible === "boolean") next.visible = rec.visible;
    if (def.toggle && rec.toggle && typeof rec.toggle === "object") {
        next.toggle = overlayToggle(def.toggle, rec.toggle as Record<string, unknown>);
    }
    return next;
}

function overlayToggle(def: LiveColumnToggle, rec: Record<string, unknown>): LiveColumnToggle {
    const overlayOpts = Array.isArray(rec.options) ? rec.options : [];
    const options = def.options.map((opt) => {
        const found = overlayOpts.find(
            (item) =>
                item &&
                typeof item === "object" &&
                (item as { value?: unknown }).value === opt.value,
        ) as { label?: unknown; visible?: unknown } | undefined;
        return {
            value: opt.value,
            label:
                found && typeof found.label === "string"
                    ? found.label.trim().slice(0, MAX_LABEL)
                    : opt.label,
            visible: found && typeof found.visible === "boolean" ? found.visible : opt.visible,
        };
    });
    const visibleValues = options.filter((o) => o.visible).map((o) => o.value);
    let defaultValue =
        typeof rec.defaultValue === "string" ? rec.defaultValue : def.defaultValue;
    if (!visibleValues.includes(defaultValue)) {
        defaultValue = visibleValues[0] ?? def.defaultValue;
    }
    return { defaultValue, options };
}

function isLiveColumnKey(value: string): value is LiveColumnKey {
    return (LIVE_COLUMN_KEYS as readonly string[]).includes(value);
}
