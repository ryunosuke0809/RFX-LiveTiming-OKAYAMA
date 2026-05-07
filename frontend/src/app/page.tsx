"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TimingHeader from "@/components/timing/TimingHeader";
import TimingTable from "@/components/timing/TimingTable";
import type { SectorFlash } from "@/components/timing/TimingTable";
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
import type { SessionInfo, Standing, TimeType, SectorTime } from "@/types/smis";

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
    return {
      ...s,
      position: newPos,
      classPosition: classPositions[classId],
      positionChange: oldPos - newPos,
      gap: newPos === 1 ? "LEADER" : `+${((Math.random() * 20 + idx * 0.5)).toFixed(3)}`,
      interval: newPos === 1 ? "" : `+${((Math.random() * 3 + 0.1)).toFixed(3)}`,
    };
  });
}

function randomTimeType(): TimeType {
  const r = Math.random();
  if (r < 0.08) return "overall_best";
  if (r < 0.25) return "personal_best";
  return "current";
}

export default function TimingPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(mockSessionInfo);
  const [standings, setStandings] = useState<Standing[]>(mockStandings);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [isRaceMode, setIsRaceMode] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [sectorFlashes, setSectorFlashes] = useState<SectorFlash[]>([]);
  const [sectorDemoRunning, setSectorDemoRunning] = useState(false);

  const posIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sfKeyRef = useRef(0);

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

  const doShuffle = useCallback(() => {
    setStandings((prev) => shufflePositions(prev));
    setFlashKey((k) => k + 1);
  }, []);

  const toggleAutoRun = useCallback(() => {
    if (autoRunning) {
      if (posIntervalRef.current) clearInterval(posIntervalRef.current);
      posIntervalRef.current = null;
      setAutoRunning(false);
    } else {
      setIsRaceMode(true);
      doShuffle();
      posIntervalRef.current = setInterval(doShuffle, 3000);
      setAutoRunning(true);
    }
  }, [autoRunning, doShuffle]);

  const doSectorFlash = useCallback(() => {
    setStandings((prev) => {
      const idx = Math.floor(Math.random() * prev.length);
      const car = prev[idx];
      const sector = (Math.floor(Math.random() * 4)) as 0 | 1 | 2 | 3; // 0=FL, 1=S1, 2=S2, 3=S3

      sfKeyRef.current++;
      setSectorFlashes([{ teamId: car.teamId, sector, key: sfKeyRef.current }]);

      if (sector >= 1 && sector <= 3) {
        const sIdx = sector - 1;
        const isGT500 = car.classId === "1:1:1";
        const base = isGT500 ? 260000 : 283000;
        const newTime = base + Math.floor(Math.random() * 10000) - 5000;
        const type = randomTimeType();
        const newSectors: SectorTime[] = [...car.sectors];
        newSectors[sIdx] = { time: newTime, type };
        const updated = [...prev];
        updated[idx] = { ...car, sectors: newSectors, sectorNo: sector };
        return updated;
      }

      if (sector === 0) {
        const updated = [...prev];
        updated[idx] = { ...car, lap: car.lap + 1 };
        return updated;
      }

      return prev;
    });

    setTimeout(() => setSectorFlashes([]), 1800);
  }, []);

  const toggleSectorDemo = useCallback(() => {
    if (sectorDemoRunning) {
      if (secIntervalRef.current) clearInterval(secIntervalRef.current);
      secIntervalRef.current = null;
      setSectorDemoRunning(false);
      setSectorFlashes([]);
    } else {
      doSectorFlash();
      secIntervalRef.current = setInterval(doSectorFlash, 800);
      setSectorDemoRunning(true);
    }
  }, [sectorDemoRunning, doSectorFlash]);

  useEffect(() => {
    return () => {
      if (posIntervalRef.current) clearInterval(posIntervalRef.current);
      if (secIntervalRef.current) clearInterval(secIntervalRef.current);
    };
  }, []);

  const trackCount = getMockTrackCount(standings);

  return (
    <div className="h-full flex flex-col">
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(!menuOpen)} />

      <div className="pl-12">
        <TimingHeader sessionInfo={sessionInfo} />
      </div>

      {/* DEMOコントロール */}
      <div className="flex items-center gap-3 px-5 pl-14 py-1.5 bg-zinc-900/80 border-b border-zinc-800 flex-wrap">
        <span className="text-zinc-600 uppercase tracking-wider" style={{ fontSize: "var(--timing-fs-sm)" }}>
          Demo
        </span>
        <button
          onClick={() => {
            setIsRaceMode(false);
            setAutoRunning(false);
            if (posIntervalRef.current) { clearInterval(posIntervalRef.current); posIntervalRef.current = null; }
          }}
          className={`px-3 py-1 rounded font-medium transition-colors ${
            !isRaceMode ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          }`}
          style={{ fontSize: "var(--timing-fs-sm)" }}
        >
          Practice
        </button>
        <button
          onClick={() => setIsRaceMode(true)}
          className={`px-3 py-1 rounded font-medium transition-colors ${
            isRaceMode ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          }`}
          style={{ fontSize: "var(--timing-fs-sm)" }}
        >
          Race / Endurance
        </button>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Sector Flash Demo */}
        <button
          onClick={toggleSectorDemo}
          className={`px-3 py-1 rounded font-bold transition-colors ${
            sectorDemoRunning
              ? "bg-red-600 hover:bg-red-500 text-white"
              : "bg-purple-600 hover:bg-purple-500 text-white"
          }`}
          style={{ fontSize: "var(--timing-fs-sm)" }}
        >
          {sectorDemoRunning ? "■ Stop Sector" : "▶ Sector Flash"}
        </button>

        {/* Position Change Demo (RACEモード時のみ) */}
        {isRaceMode && (
          <button
            onClick={toggleAutoRun}
            className={`px-3 py-1 rounded font-bold transition-colors ${
              autoRunning
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
            style={{ fontSize: "var(--timing-fs-sm)" }}
          >
            {autoRunning ? "■ Stop Position" : "▶ Position Change"}
          </button>
        )}
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
          <TimingTable
            standings={standings}
            classFilter={classFilter}
            flashKey={flashKey}
            isRaceMode={isRaceMode}
            sectorFlashes={sectorFlashes}
          />
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
