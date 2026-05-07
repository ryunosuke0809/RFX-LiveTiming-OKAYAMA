"use client";

import type { CarClass } from "@/types/smis";
import { getClassColor } from "@/lib/colors";

interface SidePanelProps {
  classes: CarClass[];
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SidePanel({
  classes,
  activeFilter,
  onFilterChange,
  isOpen,
  onToggle,
}: SidePanelProps) {
  return (
    <div className="relative flex-shrink-0">
      {/* パネル本体 */}
      <aside
        className={`h-full bg-zinc-900/95 border-r border-zinc-700 transition-all duration-200 ease-in-out overflow-hidden ${
          isOpen ? "w-40" : "w-0 border-r-0"
        }`}
      >
        <div className="w-40 p-2 space-y-1">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
            Filter
          </h3>

          <button
            onClick={() => onFilterChange(null)}
            className={`w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors ${
              activeFilter === null
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            Overall
          </button>

          <div className="border-t border-zinc-700 pt-2 mt-2">
            <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5">
              Class
            </h4>
            {classes.map((cls) => {
              const colors = getClassColor(cls.nameE);
              const isActive = activeFilter === cls.nameE;
              return (
                <button
                  key={cls.id}
                  onClick={() => onFilterChange(isActive ? null : cls.nameE)}
                  className={`w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors mb-1 flex items-center gap-2 ${
                    isActive
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <span className={`inline-block w-3 h-3 rounded-sm ${colors.bg}`} />
                  {cls.nameE}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* トグルボタン — パネル右端に固定 */}
      <button
        onClick={onToggle}
        className="absolute top-2 -right-5 z-30 bg-zinc-800 text-zinc-400 w-5 h-10 flex items-center justify-center rounded-r border border-l-0 border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
        aria-label="Toggle filter panel"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
        </svg>
      </button>
    </div>
  );
}
