"use client";

import { useState } from "react";
import SideMenu from "@/components/layout/SideMenu";
import { mockSchedule, mockCompetition } from "@/data/mock";

export default function SchedulePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(!menuOpen)} />

      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 pl-14 py-4 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-700">
        <div>
          <h1 className="text-lg font-bold text-white">Schedule & Results</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {mockCompetition.nameE}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Okayama International Circuit
          </span>
          <div className="text-xs font-bold text-zinc-300">MOLA</div>
        </div>
      </header>

      {/* テーブル */}
      <div className="flex-1 overflow-auto p-4 pl-14">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-600">
              <th className="py-3 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Event
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Session
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Local Time
              </th>
              <th className="py-3 px-4 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Results
              </th>
            </tr>
          </thead>
          <tbody>
            {mockSchedule.map((entry, idx) => (
              <tr
                key={idx}
                className={`border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors ${
                  idx % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/20"
                }`}
              >
                <td className="py-3 px-4 text-sm text-amber-400">
                  {entry.event}
                </td>
                <td className="py-3 px-4 text-sm text-zinc-200">
                  {entry.session}
                </td>
                <td className="py-3 px-4 text-sm text-zinc-300 font-mono">
                  {entry.localTime}
                </td>
                <td className="py-3 px-4 text-center">
                  {entry.hasResults ? (
                    <button className="px-3 py-1 rounded text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors">
                      Results
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
