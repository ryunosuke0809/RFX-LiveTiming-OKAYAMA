"use client";

import { useState, useEffect } from "react";
import { formatPitTime } from "@/lib/format";

/** 各車の In Pit 進入時刻から個別にカウントする。 */
export default function PitTimer({ startedAtMs }: { startedAtMs: number }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, (Date.now() - startedAtMs) / 1000),
  );

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, (Date.now() - startedAtMs) / 1000));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  return (
    <span className="text-yellow-400 font-mono font-bold animate-pulse">
      {formatPitTime(elapsed)}
    </span>
  );
}
