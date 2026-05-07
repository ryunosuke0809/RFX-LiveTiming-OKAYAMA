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
import type { SessionInfo } from "@/types/smis";

export default function TimingPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(mockSessionInfo);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);

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
