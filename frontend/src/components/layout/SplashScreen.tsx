"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [phase, setPhase] = useState<"logo-in" | "logo-hold" | "bar-expand" | "fade-out">("logo-in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("logo-hold"), 600);
    const t2 = setTimeout(() => setPhase("bar-expand"), 1800);
    const t3 = setTimeout(() => setPhase("fade-out"), 2800);
    const t4 = setTimeout(() => onFinish(), 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onFinish]);

  // fade-out フェーズに入ったら即座に下層へタッチを通す。
  // （onFinish 内で例外が起きても画面のタッチが塞がれないように）
  const isFadingOut = phase === "fade-out";

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a0d] transition-opacity duration-500 ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onClick={() => {
        // ユーザーが待ちきれずタップした場合はすぐに閉じる（モバイル UX 配慮）
        if (!isFadingOut) {
          setPhase("fade-out");
          setTimeout(() => onFinish(), 400);
        }
      }}
    >
      {/* ロゴ */}
      <div
        className={`transition-all duration-700 ease-out ${
          phase === "logo-in"
            ? "opacity-0 scale-90"
            : "opacity-100 scale-100"
        }`}
      >
        <Image
          src="/images/mola-logo.png"
          alt="MOLA System Engineering"
          width={280}
          height={120}
          priority
          className="object-contain brightness-90 invert"
        />
      </div>

      {/* LIVE TIMING テキストバー */}
      <div
        className={`mt-8 overflow-hidden transition-all duration-700 ease-out ${
          phase === "bar-expand" || phase === "fade-out"
            ? "max-w-[500px] opacity-100"
            : "max-w-0 opacity-0"
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-2 border-t border-b border-zinc-700 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-400 uppercase tracking-[0.3em] text-sm font-medium">
            Live Timing
          </span>
          <div className="w-8 h-px bg-zinc-700" />
          <span className="text-zinc-600 uppercase tracking-widest text-xs">
            Okayama International Circuit
          </span>
        </div>
      </div>
    </div>
  );
}
