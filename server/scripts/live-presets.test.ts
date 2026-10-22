/**
 * 予選 / 決勝の列プリセット。
 * 実行: npx tsx --test scripts/live-presets.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminStore } from "../src/admin/store.ts";
import {
    activeLiveColumns,
    defaultLiveColumns,
    resolveLivePresets,
    sameLiveColumns,
    type LiveColumnDef,
} from "../src/display/live-columns.ts";
import { readLiveDisplay, saveLiveDisplay, syncActiveColumns } from "../src/display/live-display.ts";
import { Logger } from "../src/logger.ts";
import { deriveSessionMode } from "../src/state/aggregator.ts";

function moveFirst(columns: LiveColumnDef[], key: LiveColumnDef["key"]): LiveColumnDef[] {
    const item = columns.find((c) => c.key === key);
    assert.ok(item);
    return [item, ...columns.filter((c) => c.key !== key)];
}

test("ラウンド名で予選と決勝を分ける", () => {
    assert.equal(deriveSessionMode("予選", "Qualifying", "Lap"), "time");
    assert.equal(deriveSessionMode("公式練習", "Practice", "Lap"), "time");
    assert.equal(deriveSessionMode("決勝", "Race", "Lap"), "race");
    assert.equal(deriveSessionMode("Final", "Final", null), "race");
});

test("プリセット未保存ならいまの並びを両方に使う", () => {
    const columns = defaultLiveColumns();
    const presets = resolveLivePresets(undefined, columns);
    assert.equal(sameLiveColumns(presets.time, columns), true);
    assert.equal(sameLiveColumns(presets.race, columns), true);
    assert.equal(sameLiveColumns(presets.time, presets.race), true);
});

test("自動切替はセッション種別の並びを選ぶ", () => {
    const base = defaultLiveColumns();
    const presets = {
        time: moveFirst(base, "best"),
        race: moveFirst(base, "laps"),
    };
    assert.equal(activeLiveColumns(presets, true, "time", false)[0]?.key, "best");
    assert.equal(activeLiveColumns(presets, true, "time", true)[0]?.key, "laps");
    assert.equal(activeLiveColumns(presets, false, "race", false)[0]?.key, "laps");
});

test("保存した予選と決勝をラウンドに合わせて columns に反映する", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rfx-live-presets-"));
    const store = new AdminStore(dir, new Logger("error"));
    try {
        const base = defaultLiveColumns();
        const time = moveFirst(base, "best");
        const race = moveFirst(base, "laps");
        saveLiveDisplay(
            store,
            { presets: { time, race }, autoPreset: true, pinnedPreset: "time", elapsed: { idleThresholdSec: 90, idleDisplay: "freeze" } },
            false,
        );

        const quali = readLiveDisplay(store);
        assert.equal(quali.autoPreset, true);
        assert.equal(quali.columns[0]?.key, "best");
        assert.equal(quali.presets.race[0]?.key, "laps");

        const switched = syncActiveColumns(store, true);
        assert.ok(switched);
        assert.equal(switched.columns[0]?.key, "laps");
        assert.equal(syncActiveColumns(store, true), null);

        const back = syncActiveColumns(store, false);
        assert.ok(back);
        assert.equal(back.columns[0]?.key, "best");
    } finally {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
