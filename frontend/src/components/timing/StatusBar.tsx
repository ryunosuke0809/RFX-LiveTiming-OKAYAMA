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
    <footer className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-t border-zinc-700 text-[11px]">
      {/* FASTEST LAP */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-fuchsia-400 uppercase tracking-wider">
          Fastest Lap
        </span>
        <span className="text-white font-mono font-bold">
          #{fastestLap.teamNo}
        </span>
        <span className="text-zinc-300">{fastestLap.driverName}</span>
        <span className="text-fuchsia-400 font-mono font-bold">
          {formatTime(fastestLap.lapTime)}
        </span>
        <span className="text-zinc-500">L{fastestLap.lap}</span>
        <div className="hidden md:flex items-center gap-1 ml-2 text-zinc-500">
          <span>S1</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[0])}</span>
          <span>S2</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[1])}</span>
          <span>S3</span>
          <span className="text-fuchsia-300 font-mono">{formatTime(fastestLap.sectors[2])}</span>
        </div>
      </div>

      {/* TRACK COUNT */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          <span className="text-zinc-400">ON TRACK</span>
          <span className="text-white font-mono font-bold">{trackCount.onTrack}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-zinc-400">IN PIT</span>
          <span className="text-white font-mono font-bold">{trackCount.inPit}</span>
        </div>
        <div className="flex items-center gap-1.5 hidden sm:flex">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span className="text-zinc-400">STOPPED</span>
          <span className="text-white font-mono font-bold">{trackCount.stopped}</span>
        </div>
        <div className="flex items-center gap-1.5 hidden sm:flex">
          <span className="inline-block w-2 h-2 rounded-full bg-zinc-500" />
          <span className="text-zinc-400">RETIRED</span>
          <span className="text-white font-mono font-bold">{trackCount.retired}</span>
        </div>
      </div>

      {/* WEATHER */}
      <div className="hidden lg:flex items-center gap-3 text-zinc-500">
        <span>Air <span className="text-zinc-300 font-mono">{weather.airTemp}°C</span></span>
        <span>Track <span className="text-zinc-300 font-mono">{weather.trackTemp}°C</span></span>
        <span>Hum <span className="text-zinc-300 font-mono">{weather.humidity}%</span></span>
        <span>Wind <span className="text-zinc-300 font-mono">{weather.windSpeed}m/s</span></span>
      </div>
    </footer>
  );
}
