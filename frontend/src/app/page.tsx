"use client";

import { useState, useEffect } from "react";
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
import type { SessionInfo, TrackFlag } from "@/types/smis";

const SESSION_OPTIONS = [
  { id: "fp1", label: "Free Practice 1", flag: "green" as TrackFlag },
  { id: "fp2", label: "Free Practice 2", flag: "green" as TrackFlag },
  { id: "qf", label: "Qualifying", flag: "green" as TrackFlag },
  { id: "race", label: "Race", flag: "green" as TrackFlag },
];

export default function TimingPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(mockSessionInfo);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState("fp1");

  // 時刻とカウントダウンの更新
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

  const trackCount = getMockTrackCount(mockStandings);

  return (
    <div className="h-full flex flex-col">
      {/* サイドメニュー */}
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(!menuOpen)} />

      {/* ヘッダー */}
      <div className="pl-12">
        <TimingHeader sessionInfo={sessionInfo} />
      </div>

      {/* セッション切替タブ */}
      <div className="flex items-center gap-1.5 px-5 pl-14 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
        {SESSION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              setCurrentSession(opt.id);
              setSessionInfo((prev) => ({
                ...prev,
                session: {
                  ...prev.session,
                  nameE: opt.label,
                },
                flag: opt.flag,
                remainingTime: opt.id === "race" ? 0 : 5400,
              }));
            }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              currentSession === opt.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* Flag selector (デモ用) */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600 mr-1">Flag:</span>
          {(["green", "yellow", "red", "fcy", "white", "chequered"] as TrackFlag[]).map((f) => (
            <button
              key={f}
              onClick={() => setSessionInfo((prev) => ({ ...prev, flag: f }))}
              className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center transition-all ${
                sessionInfo.flag === f ? "ring-2 ring-white scale-110" : "opacity-50 hover:opacity-100"
              } ${
                f === "green" ? "bg-green-600" :
                f === "yellow" ? "bg-yellow-500" :
                f === "red" ? "bg-red-600" :
                f === "fcy" ? "bg-yellow-400" :
                f === "white" ? "bg-white" :
                "bg-zinc-300"
              }`}
            />
          ))}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドパネル */}
        <SidePanel
          classes={mockClasses}
          activeFilter={classFilter}
          onFilterChange={setClassFilter}
          isOpen={filterOpen}
          onToggle={() => setFilterOpen(!filterOpen)}
        />

        {/* タイミングテーブル */}
        <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
          <TimingTable standings={mockStandings} classFilter={classFilter} />
        </div>
      </div>

      {/* ステータスバー */}
      <StatusBar
        fastestLap={mockFastestLap}
        weather={mockWeather}
        trackCount={trackCount}
      />
    </div>
  );
}
