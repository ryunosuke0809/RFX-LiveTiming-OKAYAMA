"use client";

import { useState, useRef, useEffect } from "react";

interface ColumnToggleProps {
  options: { value: string; label: string }[];
  current: string;
  onChange: (value: string) => void;
  align?: string;
}

export default function ColumnToggle({ options, current, onChange, align = "" }: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLabel = options.find((o) => o.value === current)?.label || current;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-0.5 font-semibold text-white uppercase tracking-wider cursor-pointer hover:text-yellow-400 transition-colors ${align}`}
      >
        {currentLabel}
        <svg className="w-[0.7em] h-[0.7em] opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-zinc-700 border border-zinc-600 rounded shadow-lg z-50 min-w-max">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 transition-colors whitespace-nowrap ${
                opt.value === current
                  ? "bg-zinc-600 text-yellow-400 font-bold"
                  : "text-zinc-200 hover:bg-zinc-600"
              }`}
              style={{ fontSize: "var(--timing-fs-sm)" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
