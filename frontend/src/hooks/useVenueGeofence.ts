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
  /** 再試行ボタン押下後の取得中（説明画面は維持） */
  retrying: boolean;
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
      return "位置情報を取得できませんでした。Mac はシステム設定で Chrome の位置情報をオンにし、再試行してください。";
    case "outside":
      return "会場の範囲外のため閲覧できません。岡山国際サーキット場内で再度お試しください。";
    case "inside":
      return "";
    default:
      return "";
  }
}

const GEO_OPTIONS: PositionOptions = {
  // Mac は GPS が無く Wi‑Fi 測位のため highAccuracy だと失敗しやすい
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 30_000,
};

/**
 * 一般向けホストで岡山国際サーキット場内かどうかを監視する。
 * 範囲外になったら `allowed` が false になり、呼び出し側は画面・WS を止める。
 */
export function useVenueGeofence(): VenueGeofenceState {
  const [ready, setReady] = useState(false);
  const [required, setRequired] = useState(false);
  const [status, setStatus] = useState<GeofenceStatus>("idle");
  const [retrying, setRetrying] = useState(false);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<GeofenceStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearTimers = useCallback(() => {
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
    setRetrying(false);
    setStatus(inside ? "inside" : "outside");
  }, []);

  const onGeoError = useCallback(
    (err: GeolocationPositionError) => {
      setRetrying(false);
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("denied");
        setDistanceM(null);
        clearTimers();
        return;
      }
      setStatus("error");
      clearTimers();
    },
    [clearTimers],
  );

  const pollOnce = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setRetrying(false);
      return;
    }
    // denied / error 表示中に prompting へ戻さない（暗幕化・チラつき防止）
    const prev = statusRef.current;
    if (
      prev !== "inside" &&
      prev !== "outside" &&
      prev !== "denied" &&
      prev !== "error" &&
      prev !== "unsupported"
    ) {
      setStatus("prompting");
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords),
      onGeoError,
      GEO_OPTIONS,
    );
  }, [applyPosition, onGeoError]);

  const startWatching = useCallback(
    (opts?: { soft?: boolean }) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("unsupported");
        setRetrying(false);
        return;
      }

      clearTimers();

      if (opts?.soft) {
        // 再試行: 説明画面を維持したまま取得し直す
        setRetrying(true);
      } else {
        setRetrying(false);
        setStatus("prompting");
      }

      pollOnce();

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => applyPosition(pos.coords),
        onGeoError,
        GEO_OPTIONS,
      );

      intervalRef.current = setInterval(pollOnce, GEO_RECHECK_INTERVAL_MS);
    },
    [applyPosition, clearTimers, onGeoError, pollOnce],
  );

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
    return () => clearTimers();
  }, [startWatching, clearTimers]);

  const recheck = useCallback(() => {
    if (!required) return;
    startWatching({ soft: true });
  }, [required, startWatching]);

  const allowed = !required || status === "inside";

  return {
    ready,
    required,
    status,
    allowed,
    retrying,
    message: statusMessage(status),
    distanceM,
    recheck,
  };
}
