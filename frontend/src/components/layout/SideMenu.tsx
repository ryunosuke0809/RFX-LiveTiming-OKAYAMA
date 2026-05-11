"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CarClass } from "@/types/smis";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  classes?: CarClass[];
  activeClassFilter: string | null;
  onClassFilterChange: (filter: string | null) => void;
}

export default function SideMenu({ isOpen, onClose, classes = [], activeClassFilter, onClassFilterChange }: SideMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [timingExpanded, setTimingExpanded] = useState(false);

  const isTimingPage = pathname === "/";

  return (
    <div
      className="fixed top-0 left-0 z-40 h-full flex flex-col bg-zinc-900 border-r border-zinc-700 transition-all duration-300 ease-in-out overflow-hidden"
      style={{ width: isOpen ? "220px" : "40px" }}
    >
      {/* ハンバーガーボタン */}
      <button
        onClick={onClose}
        className="flex items-center justify-center w-10 h-10 flex-shrink-0 text-zinc-400 hover:text-white transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* メニュー項目 */}
      <nav className="flex-1 flex flex-col gap-1 px-1 mt-1 overflow-y-auto">
        {/* Timing (with class filter sub-menu) */}
        <div>
          <button
            onClick={() => {
              if (!isOpen) {
                router.push("/");
              } else if (!isTimingPage) {
                router.push("/");
              } else {
                setTimingExpanded(!timingExpanded);
              }
            }}
            className={`flex items-center gap-3 rounded-lg transition-colors h-10 flex-shrink-0 w-full ${
              isOpen ? "px-3" : "justify-center px-0"
            } ${
              isTimingPage
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
            title={!isOpen ? "Timing" : undefined}
          >
            <span className="flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            {isOpen && (
              <>
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1 text-left">
                  Timing
                </span>
                <svg
                  className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${timingExpanded ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>

          {/* Class Filter サブメニュー */}
          {isOpen && timingExpanded && classes.length > 0 && (
            <div className="ml-8 mt-1 mb-1 flex flex-col gap-0.5">
              <button
                onClick={() => onClassFilterChange(null)}
                className={`text-left px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  activeClassFilter === null
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                All Classes
              </button>
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => onClassFilterChange(activeClassFilter === cls.nameE ? null : cls.nameE)}
                  className={`flex items-center gap-2 text-left px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    activeClassFilter === cls.nameE
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cls.color }}
                  />
                  {cls.nameE}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tracking */}
        <Link
          href="/tracking"
          className={`flex items-center gap-3 rounded-lg transition-colors h-10 flex-shrink-0 ${
            isOpen ? "px-3" : "justify-center px-0"
          } ${
            pathname === "/tracking"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title={!isOpen ? "Tracking" : undefined}
        >
          <span className="flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          {isOpen && (
            <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
              Tracking
            </span>
          )}
        </Link>

        {/* Result */}
        <Link
          href="/result"
          className={`flex items-center gap-3 rounded-lg transition-colors h-10 flex-shrink-0 ${
            isOpen ? "px-3" : "justify-center px-0"
          } ${
            pathname === "/result"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title={!isOpen ? "Result" : undefined}
        >
          <span className="flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </span>
          {isOpen && (
            <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
              Result
            </span>
          )}
        </Link>
      </nav>
    </div>
  );
}
