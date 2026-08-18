/**
 * 1/10000秒のタイムを表示用文字列に変換
 * 例: 935910 → "1:33.591"
 * 例: 321600 → "32.160"
 */
export function formatTime(time: number | null | undefined): string {
  if (time == null || time <= 0) return "";
  const totalMs = time / 10;
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${ms.toString().padStart(3, "0")}`;
}

/**
 * Gap/Intervalの表示用フォーマット
 * 例: "+1.234", "+1 Lap", "LEADER"
 */
export function formatGap(gap: string): string {
  return gap;
}

function formatSecondsDiff(diff10000: number): string {
  const seconds = diff10000 / 10000;
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const rem = seconds - m * 60;
    return `+${m}:${rem.toFixed(3).padStart(6, "0")}`;
  }
  return `+${seconds.toFixed(3)}`;
}

/** 周回レース: トップ（または前車）との差。同一周回は通過時刻差、周回差は +NL。 */
export function formatRaceGap(
  selfLap: number,
  selfLastPassing: number | null,
  refLap: number,
  refLastPassing: number | null,
): string {
  if (selfLap === refLap && selfLastPassing !== null && refLastPassing !== null) {
    const diff10000 = selfLastPassing - refLastPassing;
    if (diff10000 <= 0) return "—";
    return formatSecondsDiff(diff10000);
  }
  const lapDiff = refLap - selfLap;
  if (lapDiff <= 0) return "—";
  return `+${lapDiff}L`;
}

/** ベストタイムモード: 基準ベストとの差。 */
export function formatBestTimeGap(
  selfBest: number | null,
  refBest: number | null,
): string {
  if (selfBest == null || selfBest <= 0 || refBest == null || refBest <= 0) return "—";
  const diff = selfBest - refBest;
  if (diff <= 0) return "—";
  return formatSecondsDiff(diff);
}

/**
 * クラスフィルター後の表示用。先頭車をトップとして Behind / Gap を付け直し、
 * POS もクラス内順位にする。元の standing は変更しない。
 */
export function recomputeStandingsGaps<
  T extends {
    position: number;
    classPosition: number;
    order: number;
    lap: number;
    lastPassingTime: number | null;
    bestTime: number | null;
    gap: string;
    interval: string;
  },
>(standings: T[], isRaceMode: boolean): T[] {
  if (standings.length === 0) return standings;
  const ranked = [...standings].sort((a, b) => {
    const pa = a.position > 0 ? a.position : Number.MAX_SAFE_INTEGER;
    const pb = b.position > 0 ? b.position : Number.MAX_SAFE_INTEGER;
    return pa - pb || a.order - b.order;
  });
  const top = ranked[0];
  return ranked.map((cur, i) => {
    const prev = i === 0 ? top : ranked[i - 1]!;
    const classPos =
      cur.classPosition > 0 ? cur.classPosition : cur.position > 0 ? i + 1 : 0;
    if (isRaceMode) {
      return {
        ...cur,
        position: classPos,
        gap: formatRaceGap(cur.lap, cur.lastPassingTime, top.lap, top.lastPassingTime),
        interval: formatRaceGap(cur.lap, cur.lastPassingTime, prev.lap, prev.lastPassingTime),
      };
    }
    return {
      ...cur,
      position: classPos,
      gap: formatBestTimeGap(cur.bestTime, top.bestTime),
      interval: formatBestTimeGap(cur.bestTime, prev.bestTime),
    };
  });
}

/**
 * 残り時間(秒)をカウントダウン表示に変換
 * 例: 5400 → "1:30:00"
 */
export function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * ピット滞在時間(秒)を表示用に変換
 * 例: 32 → "32.0", 65 → "1:05.0"
 */
export function formatPitTime(seconds: number): string {
  if (seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) {
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }
  return s.toFixed(1);
}

/**
 * 現在時刻をHH:MM:SS形式で取得
 */
export function formatLocalTime(): string {
  const now = new Date();
  return now.toLocaleTimeString("ja-JP", { hour12: false });
}
