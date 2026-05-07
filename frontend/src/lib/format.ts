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
 * 現在時刻をHH:MM:SS形式で取得
 */
export function formatLocalTime(): string {
  const now = new Date();
  return now.toLocaleTimeString("ja-JP", { hour12: false });
}
