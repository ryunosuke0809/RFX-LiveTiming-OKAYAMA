"use client";

import type { TrackFlag } from "@/types/smis";
import { FLAG_COLORS } from "@/lib/colors";

interface TrackStatusProps {
  flag: TrackFlag;
}

export default function TrackStatus({ flag }: TrackStatusProps) {
  const flagStyle = FLAG_COLORS[flag];

  if (flag === "chequered") {
    return (
      <div className="inline-flex items-center px-4 py-1.5 rounded text-xs font-bold bg-gradient-to-r from-zinc-900 via-white to-zinc-900 text-black border border-zinc-400">
        FINISH
      </div>
    );
  }

  if (flag === "black" || !flagStyle.label) return null;

  return (
    <div
      className={`inline-flex items-center px-4 py-1.5 rounded text-xs font-bold ${flagStyle.bg} ${flagStyle.text}`}
    >
      {flagStyle.label}
    </div>
  );
}
