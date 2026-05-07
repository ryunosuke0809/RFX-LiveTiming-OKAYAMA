import type { TimeType, CarStatus } from "@/types/smis";

export const TIME_COLORS: Record<TimeType, string> = {
  overall_best: "text-fuchsia-400",
  personal_best: "text-cyan-400",
  current: "text-yellow-300",
  none: "text-zinc-300",
};

export const STATUS_COLORS: Record<CarStatus, string> = {
  on_track: "bg-zinc-800",
  in_pit: "bg-blue-700",
  pit_out: "bg-orange-500",
  stopped: "bg-red-600",
  retired: "bg-zinc-600",
  finished: "bg-zinc-500",
};

export const STATUS_LABELS: Record<CarStatus, string> = {
  on_track: "ON TRACK",
  in_pit: "IN PIT",
  pit_out: "PIT OUT",
  stopped: "STOPPED",
  retired: "RETIRED",
  finished: "FINISHED",
};

export const CLASS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "GT500": { bg: "bg-red-600", text: "text-white", border: "border-red-600" },
  "GT300": { bg: "bg-blue-600", text: "text-white", border: "border-blue-600" },
  "LMP1": { bg: "bg-red-700", text: "text-white", border: "border-red-700" },
  "LMP2": { bg: "bg-blue-600", text: "text-white", border: "border-blue-600" },
  "GTE": { bg: "bg-green-600", text: "text-white", border: "border-green-600" },
  "default": { bg: "bg-zinc-600", text: "text-white", border: "border-zinc-600" },
};

export function getClassColor(className: string) {
  return CLASS_COLORS[className] || CLASS_COLORS["default"];
}

export const FLAG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: "bg-green-600", text: "text-white", label: "GREEN" },
  yellow: { bg: "bg-yellow-500", text: "text-black", label: "YELLOW" },
  red: { bg: "bg-red-600", text: "text-white", label: "RED" },
  white: { bg: "bg-white", text: "text-black", label: "SC" },
  fcy: { bg: "bg-yellow-500", text: "text-black", label: "FCY" },
  black: { bg: "bg-zinc-800", text: "text-white", label: "" },
  chequered: { bg: "bg-zinc-100", text: "text-black", label: "FINISH" },
};
