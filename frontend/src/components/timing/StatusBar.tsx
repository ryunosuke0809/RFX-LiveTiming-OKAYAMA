"use client";

import type { FastestLap, WeatherData, TrackCount } from "@/types/smis";
import { formatTime } from "@/lib/format";

interface StatusBarProps {
  fastestLap: FastestLap;
  weather: WeatherData;
  trackCount: TrackCount;
}

export default function StatusBar({ fastestLap, weather, trackCount }: StatusBarProps) {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-y-1 px-3 sm:px-5 py-2 sm:py-3 bg-zinc-900 border-t-2 border-zinc-700"
      style={{ fontSize: "var(--timing-fs)" }}
    >
      {/* FASTEST LAP */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
        <span className="font-bold text-fuchsia-400 uppercase tracking-wider whitespace-nowrap">
          FL
          <span className="hidden sm:inline"> Lap</span>
        </span>
        <span className="text-white font-mono font-bold">#{fastestLap.teamNo}</span>
        <span className="text-zinc-300 hidden xs:inline" style={{ fontSize: "0.9em" }}>{fastestLap.driverName}</span>
        <span className="text-fuchsia-400 font-mono font-bold" style={{ fontSize: "1.1em" }}>
          {formatTime(fastestLap.lapTime)}
        </span>
        <span className="text-zinc-500 hidden sm:inline" style={{ fontSize: "0.9em" }}>L{fastestLap.lap}</span>
        <div className="hidden lg:flex items-center gap-2 ml-2 text-zinc-500" style={{ fontSize: "0.9em" }}>
          <span>S1</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[0])}</span>
          <span>S2</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[1])}</span>
          <span>S3</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[2])}</span>
        </div>
      </div>

      {/* TRACK COUNT */}
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500" />
          <span className="text-zinc-400 hidden sm:inline">ON TRACK</span>
          <span className="text-white font-mono font-bold">{trackCount.onTrack}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-500" />
          <span className="text-zinc-400 hidden sm:inline">IN PIT</span>
          <span className="text-white font-mono font-bold">{trackCount.inPit}</span>
        </div>
      </div>

      {/* WEATHER */}
      <div className="hidden md:flex items-center gap-3 sm:gap-4 text-zinc-500" style={{ fontSize: "0.9em" }}>
        <span>Air <span className="text-zinc-300 font-mono">{weather.airTemp}°C</span></span>
        <span>Track <span className="text-zinc-300 font-mono">{weather.trackTemp}°C</span></span>
        <span className="hidden lg:inline">Hum <span className="text-zinc-300 font-mono">{weather.humidity}%</span></span>
        <span className="hidden lg:inline">Wind <span className="text-zinc-300 font-mono">{weather.windSpeed}m/s</span></span>
      </div>
    </footer>
  );
}
