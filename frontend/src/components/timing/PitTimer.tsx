"use client";

import { useState, useEffect, useRef } from "react";
import { formatPitTime } from "@/lib/format";

export default function PitTimer() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-yellow-400 font-mono font-bold animate-pulse">
      {formatPitTime(elapsed)}
    </span>
  );
}
