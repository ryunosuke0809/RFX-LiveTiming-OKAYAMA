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
  ready: boolean;
  required: boolean;
  status: GeofenceStatus;
  allowed: boolean;
  /** 取得中（初回判定・再試行共通） */
  checking: boolean;
  message: string;
  distanceM: number | null;
  recheck: () => void;
}

/** Safari 等でコールバックが来ない場合の打ち切り */
const GEO_HARD_TIMEOUT_MS = 12_000;

function statusMessage(status: GeofenceStatus): string {
  switch (status) {
    case "unsupported":
      return "このブラウザでは位置情報を利用できません。";
    case "prompting":
    case "idle":
      return "位置情報を確認しています。許可を求められたら「許可」を選んでください。";
    case "denied":
      return "位置情報の許可が必要です。設定で位置情報を許可したうえで、再試行してください。";
    case "error":
      return "位置情報を取得できませんでした。位置情報をオンにして再試行してください。";
    case "outside":
      return "会場の範囲外のため閲覧できません。場内で再度お試しください。";
    case "inside":
      return "";
    default:
      return "";
  }
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
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
  const [checking, setChecking] = useState(false);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
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
    setChecking(false);
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
    setStatus(inside ? "inside" : "outside");
  }, []);

  const onGeoError = useCallback(
    (err: GeolocationPositionError) => {
      setChecking(false);
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
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
      setChecking(false);
      return;
    }
    const prev = statusRef.current;
    if (
      prev !== "inside" &&
      prev !== "outside" &&
      prev !== "denied" &&
      prev !== "error" &&
      prev !== "unsupported"
    ) {
      setStatus("prompting");
      setChecking(true);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords),
      onGeoError,
      GEO_OPTIONS,
    );
  }, [applyPosition, onGeoError]);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setChecking(false);
      return;
    }

    clearTimers();
    setChecking(true);
    setStatus("prompting");

    // Permissions API（対応ブラウザ）: 拒否済みなら即表示
    const permissions = navigator.permissions;
    if (permissions?.query) {
      void permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "denied" && statusRef.current === "prompting") {
            setChecking(false);
            setStatus("denied");
            clearTimers();
          }
        })
        .catch(() => {
          /* Safari 等で未対応の場合は無視 */
        });
    }

    pollOnce();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyPosition(pos.coords),
      onGeoError,
      GEO_OPTIONS,
    );

    intervalRef.current = setInterval(pollOnce, GEO_RECHECK_INTERVAL_MS);

    // Safari で位置情報 OFF だとコールバックが来ないことがある → 強制終了
    hardTimeoutRef.current = setTimeout(() => {
      const cur = statusRef.current;
      if (cur === "prompting" || cur === "idle") {
        setChecking(false);
        setStatus("error");
        clearTimers();
      }
    }, GEO_HARD_TIMEOUT_MS);
  }, [applyPosition, clearTimers, onGeoError, pollOnce]);

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
    startWatching();
  }, [required, startWatching]);

  const allowed = !required || status === "inside";

  return {
    ready,
    required,
    status,
    allowed,
    checking: checking || status === "prompting" || status === "idle",
    message: statusMessage(status),
    distanceM,
    recheck,
  };
}
