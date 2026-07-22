"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SessionInfo } from "@/types/smis";
import { formatRemainingTime } from "@/lib/format";

interface TimingHeaderProps {
  sessionInfo: SessionInfo;
  /** @deprecated sessionInfo.sessionStartedAt から計算。互換のため残す。 */
  elapsedSec?: number | null;
  /** セッション総時間(秒)。>0 なら残時間カウントダウン、0/未指定なら経過時間。 */
  durationSec?: number;
  /** リーダーの周回数。 */
  leaderLap?: number;
  /** 総周回数 (>0 で "n/max" 表示)。 */
  maxLaps?: number;
  /** ライブデータ受信中か。 */
  isLive?: boolean;
}

export default function TimingHeader({
  sessionInfo,
  durationSec = 0,
  leaderLap = 0,
  maxLaps = 0,
  isLive = false,
}: TimingHeaderProps) {
  const { competition, category, round, session, remainingTime, localTime, sessionStartedAt } =
    sessionInfo;

  const startedAtMs = (() => {
    if (!sessionStartedAt) return null;
    const t = Date.parse(sessionStartedAt);
    return Number.isNaN(t) ? null : t;
  })();
  const hasStart = startedAtMs !== null;

  // Start があるときだけ壁時計で秒を進める（途中参加・再表示・終了後も同じ）。
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isLive || !hasStart) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isLive, hasStart, sessionStartedAt]);

  let bigTime: string;
  let timeLabel = "";
  if (isLive && hasStart && startedAtMs !== null) {
    void tick;
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    if (durationSec > 0) {
      bigTime = formatRemainingTime(Math.max(0, durationSec - elapsed));
      timeLabel = "REMAINING";
    } else {
      bigTime = formatRemainingTime(elapsed);
      timeLabel = "ELAPSED";
    }
  } else if (isLive) {
    // Start 前: 0:00 のまま止め、Select 直後などに動かない
    bigTime = formatRemainingTime(0);
    timeLabel = "ELAPSED";
  } else {
    bigTime = formatRemainingTime(remainingTime);
  }

  const lapText =
    isLive && leaderLap > 0
      ? maxLaps > 0
        ? `LAP ${leaderLap}/${maxLaps}`
        : `LAP ${leaderLap}`
      : null;

  const roundLabel = round.nameE || round.nameJ || "";
  const sessionLabel =
    category.nameE ||
    category.nameJ ||
    session.nameE ||
    session.nameJ ||
    "";
  // スマホ1行用: ラウンド + 短いセッション識別（全文は title で確認）
  const mobileSessionLine = [roundLabel, sessionLabel].filter(Boolean).join(" · ");

  return (
    <header className="bg-zinc-900 border-b border-zinc-700">
      {/* 上段: イベント名 (左) ... ロゴ (右) */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-0.5 sm:py-1 border-b border-zinc-800/50">
        <div
          className="flex items-center gap-2 min-w-0 flex-1 leading-none"
          style={{ fontSize: "var(--timing-fs-sm)" }}
        >
          <span className="text-zinc-300 uppercase tracking-wider truncate whitespace-nowrap">
            {competition.nameJ || competition.nameE}
          </span>
          <span className="text-zinc-600 hidden sm:inline flex-shrink-0">|</span>
          <span className="text-zinc-400 uppercase tracking-wider hidden sm:inline truncate whitespace-nowrap">
            {roundLabel} {sessionLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <Image
            src="/images/okayama-logo.png"
            alt="Okayama International Circuit"
            width={120}
            height={28}
            className="hidden sm:block object-contain h-6 w-auto"
            priority
          />
          <Image
            src="/images/mola-logo.png"
            alt="MOLA"
            width={72}
            height={24}
            className="object-contain h-5 sm:h-6 w-auto invert brightness-90"
            priority
          />
        </div>
      </div>

      {/* スマホ: セッション名を下段に（1行 truncate） */}
      <div className="sm:hidden px-3 py-1 border-b border-zinc-800/40 min-w-0">
        <p
          className="text-zinc-400 uppercase tracking-wider truncate whitespace-nowrap leading-tight"
          style={{ fontSize: "var(--timing-fs-sm)" }}
          title={mobileSessionLine}
        >
          {mobileSessionLine}
        </p>
      </div>

      {/* 下段: タイマー */}
      <div className="flex items-end justify-between px-3 sm:px-5 py-3 sm:py-5 gap-2">
        <div className="flex items-end gap-3 sm:gap-4 min-w-0">
          <div className="flex flex-col flex-shrink-0">
            {timeLabel ? (
              <span
                className="text-zinc-500 uppercase tracking-widest leading-none mb-1"
                style={{ fontSize: "var(--timing-fs-sm)" }}
              >
                {timeLabel}
              </span>
            ) : null}
            <span
              className="font-bold font-mono text-white tracking-wider leading-none whitespace-nowrap"
              style={{ fontSize: "var(--timing-fs-xl)" }}
            >
              {bigTime}
            </span>
          </div>
          {lapText ? (
            <div className="flex flex-col flex-shrink-0">
              <span
                className="text-zinc-500 uppercase tracking-widest leading-none mb-1"
                style={{ fontSize: "var(--timing-fs-sm)" }}
              >
                &nbsp;
              </span>
              <span
                className="font-bold font-mono text-emerald-400 tracking-wider leading-none whitespace-nowrap"
                style={{ fontSize: "var(--timing-fs-lg)" }}
              >
                {lapText}
              </span>
            </div>
          ) : null}
        </div>
        <span
          className="font-bold font-mono text-emerald-400 tracking-wider leading-none whitespace-nowrap flex-shrink-0"
          style={{ fontSize: "var(--timing-fs-xl)" }}
        >
          {localTime}
        </span>
      </div>
    </header>
  );
}
