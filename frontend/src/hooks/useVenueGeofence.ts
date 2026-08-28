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

/** Safari 等でコールバックが来ない場合の打ち切り（初回のみ） */
const GEO_HARD_TIMEOUT_MS = 20_000;

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

/** 初回・定期の getCurrentPosition。キャッシュを長めに使い、場内での再測位失敗を減らす。 */
const GEO_READ_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 5 * 60 * 1000,
};

/**
 * watchPosition に短い timeout を付けると iOS が TIMEOUT を連発し、
 * 並行する getCurrentPosition まで失敗する。
 */
const GEO_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30_000,
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
  /** 一度場内と判定したら、GPS の一時失敗では追い出さない */
  const confirmedInsideRef = useRef(false);
  const applyPositionRef = useRef<(coords: GeolocationCoordinates) => void>(
    () => {},
  );

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

  const finishError = useCallback(
    (next: "denied" | "error" | "unsupported") => {
      setChecking(false);
      setStatus(next);
      if (next === "denied") {
        confirmedInsideRef.current = false;
        setDistanceM(null);
      }
      clearGeo();
    },
    [clearGeo],
  );

  const finishInsideOrOutside = useCallback(
    (coords: GeolocationCoordinates) => {
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
      if (inside) confirmedInsideRef.current = true;
      setStatus(inside ? "inside" : "outside");

      // 初回成功後に watch を開始（同時起動すると iOS が TIMEOUT しやすい）
      if (
        typeof navigator !== "undefined" &&
        navigator.geolocation &&
        watchIdRef.current == null
      ) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => applyPositionRef.current(pos.coords),
          (err) => {
            if (err.code === err.PERMISSION_DENIED) finishError("denied");
          },
          GEO_WATCH_OPTIONS,
        );
      }
    },
    [finishError],
  );
  applyPositionRef.current = finishInsideOrOutside;

  /** TIMEOUT / UNAVAILABLE は、場内確認済みなら無視する（iOS は数分で落ちやすい）。 */
  const onPositionError = useCallback(
    (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        finishError("denied");
        return;
      }
      if (confirmedInsideRef.current || statusRef.current === "inside") {
        setChecking(false);
        return;
      }
      finishError("error");
    },
    [finishError],
  );

  const requestPosition = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      finishError("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => finishInsideOrOutside(pos.coords),
      onPositionError,
      GEO_READ_OPTIONS,
    );
  }, [finishError, finishInsideOrOutside, onPositionError]);

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
      if (
        (cur === "prompting" || cur === "idle") &&
        !confirmedInsideRef.current
      ) {
        finishError("error");
      } else {
        setChecking(false);
        if (confirmedInsideRef.current && cur !== "inside") {
          setStatus("inside");
        }
      }
    }, GEO_HARD_TIMEOUT_MS);

    requestPosition();

    intervalRef.current = setInterval(() => {
      const cur = statusRef.current;
      if (cur === "inside" || cur === "outside") {
        requestPosition();
      }
    }, GEO_RECHECK_INTERVAL_MS);
  }, [clearGeo, finishError, requestPosition]);

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
