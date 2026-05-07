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
    <footer className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-t-2 border-zinc-700 text-sm">
      {/* FASTEST LAP */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-fuchsia-400 uppercase tracking-wider text-[14px]">
          Fastest Lap
        </span>
        <span className="text-white font-mono font-bold text-[14px]">#{fastestLap.teamNo}</span>
        <span className="text-zinc-300 text-[13px]">{fastestLap.driverName}</span>
        <span className="text-fuchsia-400 font-mono font-bold text-[15px]">
          {formatTime(fastestLap.lapTime)}
        </span>
        <span className="text-zinc-500 text-[13px]">L{fastestLap.lap}</span>
        <div className="hidden md:flex items-center gap-2 ml-3 text-zinc-500 text-[13px]">
          <span>S1</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[0])}</span>
          <span>S2</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[1])}</span>
          <span>S3</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[2])}</span>
        </div>
      </div>

      {/* TRACK COUNT */}
      <div className="flex items-center gap-5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
          <span className="text-zinc-400">ON TRACK</span>
          <span className="text-white font-mono font-bold text-[14px]">{trackCount.onTrack}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-zinc-400">IN PIT</span>
          <span className="text-white font-mono font-bold text-[14px]">{trackCount.inPit}</span>
        </div>
      </div>

      {/* WEATHER */}
      <div className="hidden lg:flex items-center gap-4 text-[13px] text-zinc-500">
        <span>Air <span className="text-zinc-300 font-mono text-[13px]">{weather.airTemp}°C</span></span>
        <span>Track <span className="text-zinc-300 font-mono text-[13px]">{weather.trackTemp}°C</span></span>
        <span>Hum <span className="text-zinc-300 font-mono text-[13px]">{weather.humidity}%</span></span>
        <span>Wind <span className="text-zinc-300 font-mono text-[13px]">{weather.windSpeed}m/s</span></span>
      </div>
    </footer>
  );
}
