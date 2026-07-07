"use client";

import type { Standing, Team, CarClass, DriverPersonalData } from "@/types/smis";
import { getDriverName } from "@/data/mock";
import { formatTime } from "@/lib/format";
import { TIME_COLORS } from "@/lib/colors";

interface DriverDetailPanelProps {
  standing: Standing;
  team: Team | undefined;
  carClass: CarClass | undefined;
  personalData: DriverPersonalData;
  onClose: () => void;
}

export default function DriverDetailPanel({
  standing,
  team,
  carClass,
  personalData,
  onClose,
}: DriverDetailPanelProps) {
  if (!team) return null;

  const driverName = getDriverName(standing, team);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative w-full max-w-3xl mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 bg-zinc-800/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg font-bold"
              style={{ backgroundColor: carClass?.color || "#71717a" }}
            >
              {team.no}
            </span>
            <div>
              <div className="text-white font-bold text-sm">{team.nameE}</div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>{driverName}</span>
                <span className="text-zinc-600">|</span>
                <span>{carClass?.nameE}</span>
                <span className="text-zinc-600">|</span>
                <span>{team.machine}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <SummaryCard label="Position" value={`P${standing.position}`} sub={`PIC ${standing.classPosition}`} />
          <SummaryCard
            label="Best Lap"
            value={formatTime(personalData.bestLapTime)}
            sub={personalData.bestLap > 0 ? `Lap ${personalData.bestLap}` : "---"}
            valueColor="text-fuchsia-400"
          />
          <SummaryCard label="Laps" value={String(personalData.laps.length)} sub={`${personalData.totalPits} pit stops`} />
          <SummaryCard
            label="Average"
            value={formatTime(personalData.avgLapTime)}
            sub="valid laps"
          />
        </div>

        {/* ベストセクター */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-zinc-800 flex-shrink-0 text-xs">
          <span className="text-zinc-500 font-semibold uppercase tracking-wider">Best Sectors</span>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">S1</span>
            <span className="text-fuchsia-400 font-mono font-bold">{formatTime(personalData.bestS1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">S2</span>
            <span className="text-fuchsia-400 font-mono font-bold">{formatTime(personalData.bestS2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">S3</span>
            <span className="text-fuchsia-400 font-mono font-bold">{formatTime(personalData.bestS3)}</span>
          </div>
        </div>

        {/* ラップデータテーブル */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-800 border-b border-zinc-700">
                <th className="py-2 px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider">Lap</th>
                <th className="py-2 px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">Time</th>
                <th className="py-2 px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S1</th>
                <th className="py-2 px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S2</th>
                <th className="py-2 px-3 text-right text-zinc-400 font-semibold uppercase tracking-wider">S3</th>
                <th className="py-2 px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider">P</th>
                <th className="py-2 px-3 text-center text-zinc-400 font-semibold uppercase tracking-wider w-8"></th>
              </tr>
            </thead>
            <tbody>
              {personalData.laps.map((lap) => (
                <tr
                  key={lap.lap}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors ${
                    lap.lap % 2 === 0 ? "bg-zinc-900/40" : ""
                  } ${lap.isPit ? "bg-blue-900/10" : ""}`}
                >
                  <td className="py-1.5 px-3 text-center font-mono text-zinc-400">{lap.lap}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-bold ${TIME_COLORS[lap.lapTimeType]}`}>
                    {formatTime(lap.lapTime)}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-mono ${TIME_COLORS[lap.s1Type]}`}>
                    {formatTime(lap.s1)}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-mono ${TIME_COLORS[lap.s2Type]}`}>
                    {formatTime(lap.s2)}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-mono ${TIME_COLORS[lap.s3Type]}`}>
                    {formatTime(lap.s3)}
                  </td>
                  <td className="py-1.5 px-3 text-center font-mono text-zinc-500">
                    {lap.position > 0 ? lap.position : ""}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    {lap.isPit && (
                      <span className="text-cyan-400 font-bold text-[10px]">P</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  valueColor = "text-white",
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-lg font-bold font-mono ${valueColor} mt-0.5 leading-none`}>{value || "---"}</div>
      <div className="text-[10px] text-zinc-600 mt-1">{sub}</div>
    </div>
  );
}
