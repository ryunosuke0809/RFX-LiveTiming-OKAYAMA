"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

type ScrollAxis = "x" | "y" | "both";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

/**
 * スクロール可能なとき「続きあり」ヒントを出す。
 * - 横: 右端に ›
 * - 縦: 下端に ˅
 * スクロールで端に達するか、数秒で自動的に消える。
 */
export default function ScrollHintArea({
  children,
  className = "",
  contentClassName = "",
  axis = "both",
  scrollerRef,
  style,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  axis?: ScrollAxis;
  /** 外側からスクロール位置を操作したいとき */
  scrollerRef?: Ref<HTMLDivElement | null>;
  style?: CSSProperties;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const [showHintX, setShowHintX] = useState(false);
  const [showHintY, setShowHintY] = useState(false);

  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      assignRef(scrollerRef, node);
    },
    [scrollerRef],
  );

  const measure = useCallback(() => {
    const el = localRef.current;
    if (!el) return;

    const wantX = axis === "x" || axis === "both";
    const wantY = axis === "y" || axis === "both";

    if (wantX) {
      const overflowX = el.scrollWidth > el.clientWidth + 8;
      const atEndX = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setShowHintX(overflowX && !atEndX);
    } else {
      setShowHintX(false);
    }

    if (wantY) {
      const overflowY = el.scrollHeight > el.clientHeight + 8;
      const atEndY = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      setShowHintY(overflowY && !atEndY);
    } else {
      setShowHintY(false);
    }
  }, [axis]);

  useEffect(() => {
    const el = localRef.current;
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
    if (!showHintX && !showHintY) return;
    const t = window.setTimeout(() => {
      setShowHintX(false);
      setShowHintY(false);
    }, 4500);
    return () => window.clearTimeout(t);
  }, [showHintX, showHintY]);

  const overflowClass =
    axis === "x"
      ? "overflow-x-auto overflow-y-hidden"
      : axis === "y"
        ? "overflow-y-auto overflow-x-hidden"
        : "overflow-auto";

  return (
    <div className={`relative min-w-0 min-h-0 ${className}`} style={style}>
      <div
        ref={setScroller}
        className={`${overflowClass} ${contentClassName}`}
        onScroll={measure}
      >
        {children}
      </div>

      {showHintX ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 h-scroll-hint-fade flex items-center justify-end pr-1 z-20"
          aria-hidden
        >
          <span className="h-scroll-hint-chevron text-amber-400/90 text-lg font-bold leading-none">›</span>
        </div>
      ) : null}

      {showHintY ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 sm:h-14 v-scroll-hint-fade flex items-end justify-center pb-1 z-20"
          aria-hidden
        >
          <span className="v-scroll-hint-chevron text-amber-400/90 text-base font-bold leading-none">˅</span>
        </div>
      ) : null}
    </div>
  );
}

/** 横スクロール専用の互換ラッパー */
export function HorizontalScrollArea(
  props: Omit<Parameters<typeof ScrollHintArea>[0], "axis">,
) {
  return <ScrollHintArea axis="x" {...props} />;
}
