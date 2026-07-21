"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 横スクロールが必要なときだけ右端に「続きあり」ヒントを出す。
 * 初回スクロールまたは数秒後に自動で薄くなる。
 */
export default function HorizontalScrollArea({
  children,
  className = "",
  contentClassName = "",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 8;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setCanScroll(overflow);
    setShowHint(overflow && !atEnd);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, children]);

  useEffect(() => {
    if (!showHint) return;
    const t = window.setTimeout(() => setShowHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [showHint]);

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={scrollerRef}
        className={`overflow-x-auto ${contentClassName}`}
        onScroll={measure}
      >
        {children}
      </div>
      {canScroll && showHint ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-14 sm:w-16 h-scroll-hint-fade flex items-center justify-end pr-1"
          aria-hidden
        >
          <span className="h-scroll-hint-chevron text-amber-400/90 text-lg font-bold leading-none">›</span>
        </div>
      ) : null}
    </div>
  );
}
