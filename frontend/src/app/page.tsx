"use client";

import { useState, useEffect, useCallback } from "react";
import TimingHeader from "@/components/timing/TimingHeader";
import TimingTable from "@/components/timing/TimingTable";
import StatusBar from "@/components/timing/StatusBar";
import SidePanel from "@/components/timing/SidePanel";
import SideMenu from "@/components/layout/SideMenu";
import {
  mockSessionInfo,
  mockStandings,
  mockClasses,
  mockFastestLap,
  mockWeather,
  getMockTrackCount,
} from "@/data/mock";
import { formatLocalTime } from "@/lib/format";
import type { SessionInfo, Standing } from "@/types/smis";

function shufflePositions(standings: Standing[]): Standing[] {
  const arr = [...standings];
  const numSwaps = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < numSwaps; i++) {
    const idxA = Math.floor(Math.random() * (arr.length - 1));
    const idxB = idxA + 1 + Math.floor(Math.random() * Math.min(3, arr.length - idxA - 1));
    if (idxB >= arr.length) continue;
    [arr[idxA], arr[idxB]] = [arr[idxB], arr[idxA]];
  }

  const classPositions: Record<string, number> = {};
  return arr.map((s, idx) => {
    const classId = s.classId;
    if (!classPositions[classId]) classPositions[classId] = 0;
    classPositions[classId]++;

    const oldPos = s.position;
    const newPos = idx + 1;
    const change = oldPos - newPos;

    return {
      ...s,
      position: newPos,
      classPosition: classPositions[classId],
      positionChange: change,
      gap: newPos === 1 ? "LEADER" : `+${((Math.random() * 20 + idx * 0.5)).toFixed(3)}`,
      interval: newPos === 1 ? "" : `+${((Math.random() * 3 + 0.1)).toFixed(3)}`,
    };
  });
}

export default function TimingPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(mockSessionInfo);
  const [standings, setStandings] = useState<Standing[]>(mockStandings);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionInfo((prev) => ({
        ...prev,
        localTime: formatLocalTime(),
        remainingTime: Math.max(0, prev.remainingTime - 1),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleShuffle = useCallback(() => {
    setStandings((prev) => shufflePositions(prev));
    setFlashKey((k) => k + 1);
  }, []);

  const trackCount = getMockTrackCount(standings);

  return (
    <div className="h-full flex flex-col">
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(!menuOpen)} />

      <div className="pl-12">
        <TimingHeader sessionInfo={sessionInfo} />
      </div>

      {/* DEMOコントロール */}
      <div className="flex items-center gap-3 px-5 pl-14 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-zinc-600 uppercase tracking-wider" style={{ fontSize: "var(--timing-fs-sm)" }}>
          Demo
        </span>
        <button
          onClick={handleShuffle}
          className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
          style={{ fontSize: "var(--timing-fs-sm)" }}
        >
          ▶ Position Change
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <SidePanel
          classes={mockClasses}
          activeFilter={classFilter}
          onFilterChange={setClassFilter}
          isOpen={filterOpen}
          onToggle={() => setFilterOpen(!filterOpen)}
        />

        <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
          <TimingTable standings={standings} classFilter={classFilter} flashKey={flashKey} />
        </div>
      </div>

      <StatusBar
        fastestLap={mockFastestLap}
        weather={mockWeather}
        trackCount={trackCount}
      />
    </div>
  );
}
