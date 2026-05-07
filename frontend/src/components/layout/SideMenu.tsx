"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/", label: "Timing", icon: "⏱" },
  { href: "/positioning", label: "Positioning", icon: "📍" },
  { href: "/schedule", label: "Schedule & Results", icon: "📋" },
];

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const pathname = usePathname();

  return (
    <>
      {/* ハンバーガーボタン */}
      <button
        onClick={onClose}
        className="fixed top-3 left-3 z-50 bg-zinc-800 text-zinc-300 p-2 rounded-lg border border-zinc-600 hover:bg-zinc-700 transition-colors"
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

      {/* メニューパネル */}
      <div
        className={`fixed top-0 left-0 z-40 h-full w-56 bg-zinc-900/98 backdrop-blur border-r border-zinc-700 pt-14 transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* オーバーレイ */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
      )}
    </>
  );
}
