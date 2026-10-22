/**
 * Live 表の表示設定。
 *
 * columns は「いま Live に出している並び」（単一レイアウトの互換）。
 * presets は予選・練習 (time) と決勝 (race) の2本。autoPreset がオンのとき、
 * MOLA のラウンド名から決めた sessionMode に合わせて columns を差し替える。
 */

import type { AdminStore } from "../admin/store.js";
import type { ElapsedIdleConfig } from "./elapsed-idle.js";
import { sanitizeElapsedIdle } from "./elapsed-idle.js";
import {
    activeLiveColumns,
    isLivePresetMode,
    resolveLiveColumns,
    resolveLivePresets,
    sameLiveColumns,
    sanitizeLiveColumns,
    sanitizeLivePresets,
    type LiveColumnDef,
    type LiveColumnPresets,
    type LivePresetMode,
} from "./live-columns.js";
import type { LiveStatePatch } from "../state/types.js";

export interface LiveDisplayConfig {
    columns: LiveColumnDef[];
    elapsed: ElapsedIdleConfig;
    presets: LiveColumnPresets;
    autoPreset: boolean;
    pinnedPreset: LivePresetMode;
}

export function readLiveDisplay(store: AdminStore): LiveDisplayConfig {
    const cfg = store.getDisplayConfig("live");
    const columns = resolveLiveColumns(cfg["columns"]);
    const presets = resolveLivePresets(cfg["presets"], columns);
    const autoPreset = typeof cfg["autoPreset"] === "boolean" ? cfg["autoPreset"] : true;
    const pinnedPreset = isLivePresetMode(cfg["pinnedPreset"]) ? cfg["pinnedPreset"] : "time";
    return { columns, elapsed: sanitizeElapsedIdle(cfg["elapsed"]), presets, autoPreset, pinnedPreset };
}

export function toDisplayLivePatch(cfg: LiveDisplayConfig): LiveStatePatch {
    return {
        kind: "display_live",
        columns: cfg.columns,
        elapsed: cfg.elapsed,
        presets: cfg.presets,
        autoPreset: cfg.autoPreset,
        pinnedPreset: cfg.pinnedPreset,
    };
}

export interface SaveLiveDisplayInput {
    columns?: unknown;
    presets?: unknown;
    elapsed?: unknown;
    autoPreset?: unknown;
    pinnedPreset?: unknown;
}

/**
 * 管理画面からの保存。
 * presets があれば予選・決勝を別々に保存する。
 * columns だけの古い保存は、2本がまだ同じなら両方をその並びに揃える。
 */
export function saveLiveDisplay(
    store: AdminStore,
    input: SaveLiveDisplayInput,
    isRace: boolean,
): LiveDisplayConfig {
    const current = readLiveDisplay(store);
    let presets = current.presets;
    let autoPreset = current.autoPreset;
    let pinnedPreset = current.pinnedPreset;
    let columnsTouched = false;

    if (input.presets !== undefined) {
        presets = sanitizeLivePresets(input.presets);
        if (input.autoPreset !== undefined && typeof input.autoPreset !== "boolean") {
            throw new Error("自動切替はオンかオフで指定してください");
        }
        if (typeof input.autoPreset === "boolean") autoPreset = input.autoPreset;
        if (input.pinnedPreset !== undefined) {
            if (!isLivePresetMode(input.pinnedPreset)) {
                throw new Error("固定する並びは予選か決勝にしてください");
            }
            pinnedPreset = input.pinnedPreset;
        }
        columnsTouched = true;
    } else if (input.columns !== undefined) {
        const columns = sanitizeLiveColumns(input.columns);
        const storedPresets = store.getDisplayConfig("live")["presets"];
        const hadDistinct =
            storedPresets !== undefined &&
            storedPresets !== null &&
            !sameLiveColumns(current.presets.time, current.presets.race);
        if (hadDistinct) {
            presets = {
                time: pinnedPreset === "time" ? columns : current.presets.time,
                race: pinnedPreset === "race" ? columns : current.presets.race,
            };
        } else {
            presets = { time: columns, race: columns };
        }
        columnsTouched = true;
    }

    const elapsed =
        input.elapsed !== undefined ? sanitizeElapsedIdle(input.elapsed) : current.elapsed;

    const columns = columnsTouched
        ? activeLiveColumns(presets, autoPreset, pinnedPreset, isRace)
        : current.columns;

    if (columnsTouched) {
        store.setDisplayConfig("live", "presets", presets);
        store.setDisplayConfig("live", "autoPreset", autoPreset);
        store.setDisplayConfig("live", "pinnedPreset", pinnedPreset);
        store.setDisplayConfig("live", "columns", columns);
    }
    if (input.elapsed !== undefined) {
        store.setDisplayConfig("live", "elapsed", elapsed);
    }

    return { columns, presets, autoPreset, pinnedPreset, elapsed };
}

/**
 * 自動切替がオンのとき、現在のセッション種別に合う並びを columns に書き戻す。
 * 変わらなければ null（配信しない）。
 */
export function syncActiveColumns(store: AdminStore, isRace: boolean): LiveDisplayConfig | null {
    const current = readLiveDisplay(store);
    if (!current.autoPreset) return null;
    const next = activeLiveColumns(current.presets, true, current.pinnedPreset, isRace);
    if (sameLiveColumns(current.columns, next)) return null;
    store.setDisplayConfig("live", "columns", next);
    return { ...current, columns: next };
}
