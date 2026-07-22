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
  checking: boolean;
  message: string;
  distanceM: number | null;
  recheck: () => void;
}

/** Safari 等でコールバックが来ない場合の打ち切り */
const GEO_HARD_TIMEOUT_MS = 8_000;

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
  timeout: 7_000,
  maximumAge: 60_000,
};

/**
 * 一般向けホストで場内かどうかを監視する。
 * ※ startWatching の依存で effect が再実行されるとタイムアウトが消えるため、起動は mount 1 回のみ。
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
  const requiredRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearGeo = useCallback(() => {
    if (typeof navigator !== "undefined" && watchIdRef.current != null) {
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

  const finishInsideOrOutside = useCallback((coords: GeolocationCoordinates) => {
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

  const finishError = useCallback(
    (next: "denied" | "error" | "unsupported") => {
      setChecking(false);
      setStatus(next);
      if (next === "denied") setDistanceM(null);
      clearGeo();
    },
    [clearGeo],
  );

  const requestPosition = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      finishError("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => finishInsideOrOutside(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) finishError("denied");
        else finishError("error");
      },
      GEO_OPTIONS,
    );
  }, [finishError, finishInsideOrOutside]);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      finishError("unsupported");
      return;
    }

    clearGeo();
    setChecking(true);
    setStatus("prompting");

    // ハードタイムアウト（Safari で位置 OFF だと成功も失敗も来ないことがある）
    hardTimeoutRef.current = setTimeout(() => {
      const cur = statusRef.current;
      if (cur === "prompting" || cur === "idle") {
        finishError("error");
      }
    }, GEO_HARD_TIMEOUT_MS);

    requestPosition();

    // 場内入場後の離脱監視（初回失敗時は clearGeo で止まる）
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => finishInsideOrOutside(pos.coords),
      (err) => {
        // watch のエラーは初回 getCurrentPosition 側で扱う。denied のみ反映。
        if (err.code === err.PERMISSION_DENIED) finishError("denied");
      },
      GEO_OPTIONS,
    );

    intervalRef.current = setInterval(() => {
      const cur = statusRef.current;
      if (cur === "inside" || cur === "outside") {
        requestPosition();
      }
    }, GEO_RECHECK_INTERVAL_MS);
  }, [clearGeo, finishError, finishInsideOrOutside, requestPosition]);

  // mount 時のみ起動（依存配列に startWatching を入れない）
  useEffect(() => {
    const host = window.location.hostname;
    const need = requiresVenueGeofence(host);
    requiredRef.current = need;
    setRequired(need);
    setReady(true);
    if (!need) {
      setStatus("idle");
      return;
    }
    startWatching();
    return () => clearGeo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
  }, []);

  const recheck = useCallback(() => {
    if (!requiredRef.current) return;
    startWatching();
  }, [startWatching]);

  const allowed = !required || status === "inside";
  const isChecking =
    checking || status === "prompting" || (required && status === "idle");

  return {
    ready,
    required,
    status,
    allowed,
    checking: isChecking,
    message: statusMessage(status),
    distanceM,
    recheck,
  };
}
