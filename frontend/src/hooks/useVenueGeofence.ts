"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GEO_RECHECK_INTERVAL_MS,
  VENUE_CENTER,
  distanceMeters,
  isInsideVenue,
  requiresVenueGeofence,
} from "@/lib/accessControl";

export type GeofenceStatus =
  | "idle"
  | "unsupported"
  | "prompting"
  | "denied"
  | "error"
  | "outside"
  | "inside";

export interface VenueGeofenceState {
  /** ホスト判定・初期化が終わったか（終わるまで子をマウントしない） */
  ready: boolean;
  /** ジオフェンス対象ホストか */
  required: boolean;
  status: GeofenceStatus;
  /** 閲覧（WS 接続）を許可してよいか */
  allowed: boolean;
  message: string;
  distanceM: number | null;
  recheck: () => void;
}

function statusMessage(status: GeofenceStatus): string {
  switch (status) {
    case "unsupported":
      return "このブラウザでは位置情報を利用できません。";
    case "prompting":
      return "位置情報の利用を許可してください。岡山国際サーキット場内でのみ閲覧できます。";
    case "denied":
      return "位置情報の許可が必要です。ブラウザ設定で許可したうえで、再試行してください。";
    case "error":
      return "位置情報を取得できませんでした。電波状況を確認して再試行してください。";
    case "outside":
      return "会場の範囲外のため閲覧できません。岡山国際サーキット場内で再度お試しください。";
    case "inside":
      return "";
    default:
      return "";
  }
}

/**
 * 一般向けホストで岡山国際サーキット場内かどうかを監視する。
 * 範囲外になったら `allowed` が false になり、呼び出し側は画面・WS を止める。
 */
export function useVenueGeofence(): VenueGeofenceState {
  const [ready, setReady] = useState(false);
  const [required, setRequired] = useState(false);
  const [status, setStatus] = useState<GeofenceStatus>("idle");
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const applyPosition = useCallback((coords: GeolocationCoordinates) => {
    const inside = isInsideVenue(coords.latitude, coords.longitude);
    const d = distanceMeters(
      coords.latitude,
      coords.longitude,
      VENUE_CENTER.lat,
      VENUE_CENTER.lng,
    );
    setDistanceM(Math.round(d));
    setStatus(inside ? "inside" : "outside");
  }, []);

  const onGeoError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus("denied");
      setDistanceM(null);
      return;
    }
    setStatus("error");
  }, []);

  const pollOnce = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus((prev) => (prev === "inside" || prev === "outside" ? prev : "prompting"));
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords),
      onGeoError,
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 10_000,
      },
    );
  }, [applyPosition, onGeoError]);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }

    setStatus("prompting");
    pollOnce();

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyPosition(pos.coords),
      onGeoError,
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 10_000,
      },
    );

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(pollOnce, GEO_RECHECK_INTERVAL_MS);
  }, [applyPosition, onGeoError, pollOnce]);

  useEffect(() => {
    const host = window.location.hostname;
    const need = requiresVenueGeofence(host);
    setRequired(need);
    setReady(true);
    if (!need) {
      setStatus("idle");
      return;
    }
    startWatching();
    return () => stopWatching();
  }, [startWatching, stopWatching]);

  const recheck = useCallback(() => {
    if (!required) return;
    startWatching();
  }, [required, startWatching]);

  const allowed = !required || status === "inside";

  return {
    ready,
    required,
    status,
    allowed,
    message: statusMessage(status),
    distanceM,
    recheck,
  };
}
