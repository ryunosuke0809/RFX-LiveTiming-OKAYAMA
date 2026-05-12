"use client";

import dynamic from "next/dynamic";

const CircuitMapEditor = dynamic(() => import("@/components/dev/CircuitMapEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-dvh flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
      地図を読み込み中…
    </div>
  ),
});

export default function CircuitMapEditorPage() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-zinc-950">
      <CircuitMapEditor />
    </div>
  );
}
