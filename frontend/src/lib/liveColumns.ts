/**
 * Live Timing 表の列定義。
 *
 * 既定値は現行の TimingTable と一致させる。管理画面で並び・名称・表示/
 * プルダウンを変えた結果はサーバーが保存し、ここへマージして使う。
 * レイアウト (幅・sticky・決勝専用) はコード側の既定を常に優先する。
 *
 * サーバー側の正本: server/src/display/live-columns.ts
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
  /** 固定ヘッダー名。トグル列では未使用 (各 option.label を出す)。 */
  label: string;
  visible: boolean;
  raceOnly: boolean;
  sticky: boolean;
  minW: number;
  pct: string;
  pctRace: string;
  align: string;
  toggle?: LiveColumnToggle;
}

/** 管理画面の説明用。表には出さない。 */
export const LIVE_COLUMN_GUIDE: Record<LiveColumnKey, string> = {
  status: "ピット中などの状態ランプ",
  pos: "総合順位 (P)",
  chg: "順位変動。決勝のときだけ出る",
  pic: "クラス内順位 (PIC)",
  nr: "車番 (No.)",
  class: "クラス",
  driver: "ドライバー名",
  car: "車両名 / チーム名の切替",
  laps: "周回数 / 通過時刻 / 前回タイム",
  gap: "Behind (先頭差) / Gap (前車差)",
  best: "ベストタイム / ベスト周",
  s1: "セクター 1",
  s2: "セクター 2",
  s3: "セクター 3",
  pit: "ピット回数 / ピットタイム",
};

const STICKY_KEYS = new Set<LiveColumnKey>(["status", "pos", "chg", "pic", "nr", "class"]);

export const DEFAULT_LIVE_COLUMNS: LiveColumnDef[] = [
  col("status", "", { minW: 20, pct: "1.8%", pctRace: "1.8%", align: "text-center" }),
  col("pos", "P", { minW: 28, pct: "2.5%", pctRace: "2.2%", align: "text-center" }),
  col("chg", "", {
    minW: 28,
    pct: "2.2%",
    pctRace: "2.2%",
    align: "text-center",
    raceOnly: true,
  }),
  col("pic", "PIC", { minW: 28, pct: "2.5%", pctRace: "2.5%", align: "text-center" }),
  col("nr", "No.", { minW: 30, pct: "3%", pctRace: "3%", align: "text-center" }),
  col("class", "Class", { minW: 48, pct: "5%", pctRace: "5%", align: "text-center" }),
  col("driver", "Name", {
    minW: 100,
    pct: "16%",
    pctRace: "14.5%",
    align: "text-left pl-2",
    sticky: false,
  }),
  col("car", "Car", {
    minW: 120,
    pct: "26%",
    pctRace: "24.5%",
    align: "text-left pl-2",
    sticky: false,
    toggle: {
      defaultValue: "car",
      options: [
        { value: "car", label: "Car", visible: true },
        { value: "team", label: "Team", visible: true },
      ],
    },
  }),
  col("laps", "Laps", {
    minW: 40,
    pct: "4%",
    pctRace: "4%",
    align: "text-center",
    sticky: false,
    toggle: {
      defaultValue: "laps",
      options: [
        { value: "laps", label: "Laps", visible: true },
        { value: "time", label: "Time", visible: true },
        { value: "last", label: "Last", visible: true },
      ],
    },
  }),
  col("gap", "Behind", {
    minW: 80,
    pct: "8%",
    pctRace: "8%",
    align: "text-right pr-3",
    sticky: false,
    toggle: {
      defaultValue: "gap",
      options: [
        { value: "gap", label: "Behind", visible: true },
        { value: "int", label: "Gap", visible: true },
      ],
    },
  }),
  col("best", "Best", {
    minW: 88,
    pct: "8%",
    pctRace: "8%",
    align: "text-right pr-3",
    sticky: false,
    toggle: {
      defaultValue: "best",
      options: [
        { value: "best", label: "Best", visible: true },
        { value: "bestlap", label: "BestLap", visible: true },
      ],
    },
  }),
  col("s1", "S1", { minW: 72, pct: "6.5%", pctRace: "6.5%", align: "text-right pr-3", sticky: false }),
  col("s2", "S2", { minW: 72, pct: "6.5%", pctRace: "6.5%", align: "text-right pr-3", sticky: false }),
  col("s3", "S3", { minW: 64, pct: "6%", pctRace: "6%", align: "text-right pr-3", sticky: false }),
  col("pit", "PIT", {
    minW: 60,
    pct: "5.5%",
    pctRace: "5.5%",
    align: "text-right pr-3",
    sticky: false,
    toggle: {
      defaultValue: "count",
      options: [
        { value: "count", label: "PIT", visible: true },
        { value: "time", label: "PIT Time", visible: true },
      ],
    },
  }),
];

function col(
  key: LiveColumnKey,
  label: string,
  extra: {
    minW: number;
    pct: string;
    pctRace: string;
    align: string;
    sticky?: boolean;
    raceOnly?: boolean;
    toggle?: LiveColumnToggle;
  },
): LiveColumnDef {
  return {
    key,
    label,
    visible: true,
    raceOnly: extra.raceOnly ?? false,
    sticky: extra.sticky ?? STICKY_KEYS.has(key),
    minW: extra.minW,
    pct: extra.pct,
    pctRace: extra.pctRace,
    align: extra.align,
    ...(extra.toggle ? { toggle: extra.toggle } : {}),
  };
}

export function isLiveColumnKey(value: string): value is LiveColumnKey {
  return (LIVE_COLUMN_KEYS as readonly string[]).includes(value);
}

/** 保存値を既定へマージする。未知キーは捨て、足りない列は末尾に足す。 */
export function resolveLiveColumns(stored: unknown): LiveColumnDef[] {
  const defaults = DEFAULT_LIVE_COLUMNS;
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
    out.push(overlayColumn(def, rec));
  }
  for (const def of defaults) {
    if (!seen.has(def.key)) out.push(cloneColumn(def));
  }
  return out;
}

function overlayColumn(def: LiveColumnDef, rec: Record<string, unknown>): LiveColumnDef {
  const next = cloneColumn(def);
  if (typeof rec.label === "string") next.label = rec.label.slice(0, 24);
  if (typeof rec.visible === "boolean") next.visible = rec.visible;
  if (def.toggle && rec.toggle && typeof rec.toggle === "object") {
    next.toggle = overlayToggle(def.toggle, rec.toggle as Record<string, unknown>);
  }
  return next;
}

function overlayToggle(def: LiveColumnToggle, rec: Record<string, unknown>): LiveColumnToggle {
  const optionByValue = new Map(def.options.map((o) => [o.value, o]));
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
        found && typeof found.label === "string" ? found.label.slice(0, 24) : opt.label,
      visible: found && typeof found.visible === "boolean" ? found.visible : opt.visible,
    };
  });
  // 既定に無い value は無視する
  void optionByValue;
  const visibleValues = options.filter((o) => o.visible).map((o) => o.value);
  let defaultValue =
    typeof rec.defaultValue === "string" ? rec.defaultValue : def.defaultValue;
  if (!visibleValues.includes(defaultValue)) {
    defaultValue = visibleValues[0] ?? def.defaultValue;
  }
  return { defaultValue, options };
}

function cloneColumn(col: LiveColumnDef): LiveColumnDef {
  return {
    ...col,
    toggle: col.toggle
      ? {
          defaultValue: col.toggle.defaultValue,
          options: col.toggle.options.map((o) => ({ ...o })),
        }
      : undefined,
  };
}

export function visibleLiveColumns(
  columns: LiveColumnDef[],
  isRaceMode: boolean,
): LiveColumnDef[] {
  return columns.filter((c) => c.visible && (isRaceMode || !c.raceOnly));
}

export function visibleToggleOptions(col: LiveColumnDef | undefined): LiveColumnOption[] {
  return (col?.toggle?.options ?? []).filter((o) => o.visible);
}

export function resolvedToggleValue(
  col: LiveColumnDef | undefined,
  current: string | undefined,
): string {
  const options = visibleToggleOptions(col);
  if (options.length === 0) return col?.toggle?.defaultValue ?? "";
  if (current && options.some((o) => o.value === current)) return current;
  const fallback = col?.toggle?.defaultValue;
  if (fallback && options.some((o) => o.value === fallback)) return fallback;
  return options[0]!.value;
}
