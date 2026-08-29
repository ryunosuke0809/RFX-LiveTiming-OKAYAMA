/**
 * 管理画面 API クライアント (`/api/admin/*`)。
 *
 * 認証は HttpOnly Cookie なので、必ず同一オリジン + credentials: "same-origin" で叩く。
 * 開発時は next.config.ts の rewrite が :4000 へ中継する。
 */

import type { ArchiveSessionSummary } from "./archiveApi";

export interface AdminUser {
  id: number;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminArchiveDay {
  date: string;
  active: boolean;
  hasHiddenSessions: boolean;
}

export interface ArchiveSessionNames {
  competitionName: string | null;
  categoryName: string | null;
  sessionName: string | null;
  roundName: string | null;
}

export interface AdminArchiveSession extends ArchiveSessionSummary {
  active: boolean;
  originalNames: {
    competitionName: string;
    categoryName: string;
    sessionName: string;
    roundName: string;
  };
  overrides: ArchiveSessionNames;
}

export interface AuditEntry {
  id: number;
  at: string;
  username: string;
  action: string;
  target: string;
  detail: unknown;
}

/** 401 を呼び出し側で判別できるようにするためのエラー型。 */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init?.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* レスポンスが JSON でない場合はステータスのみ */
    }
    throw new AdminApiError(message, res.status);
  }
  return (await res.json()) as T;
}

// ---- 認証 ----

export function adminLogin(username: string, password: string): Promise<{ user: AdminUser }> {
  return request("/login", { method: "POST", body: { username, password } });
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return request("/logout", { method: "POST", body: {} });
}

export function adminMe(): Promise<{ user: AdminUser }> {
  return request("/me");
}

// ---- ユーザー管理 ----

export function adminListUsers(): Promise<{ users: AdminUser[] }> {
  return request("/users");
}

export function adminCreateUser(username: string, password: string): Promise<{ user: AdminUser }> {
  return request("/users", { method: "POST", body: { username, password } });
}

export function adminChangePassword(
  id: number,
  password: string,
): Promise<{ ok: boolean; reauthRequired: boolean }> {
  return request(`/users/${id}/password`, { method: "PATCH", body: { password } });
}

export function adminDeleteUser(id: number): Promise<{ ok: boolean }> {
  return request(`/users/${id}`, { method: "DELETE" });
}

// ---- 履歴データ管理 ----

export function adminListDays(): Promise<{ days: AdminArchiveDay[] }> {
  return request("/archive/days");
}

export function adminListSessions(
  date: string,
): Promise<{ date: string; sessions: AdminArchiveSession[] }> {
  return request(`/archive/sessions?date=${encodeURIComponent(date)}`);
}

export function adminSetDayActive(
  date: string,
  active: boolean,
): Promise<{ ok: boolean; date: string; active: boolean }> {
  return request(`/archive/day/${encodeURIComponent(date)}`, {
    method: "PATCH",
    body: { active },
  });
}

export function adminUpdateSession(payload: {
  date: string;
  sessionKey: string;
  active?: boolean;
  names?: Partial<ArchiveSessionNames>;
}): Promise<{ session: unknown }> {
  return request("/archive/session", { method: "PATCH", body: payload });
}

export function adminListAudit(limit = 100): Promise<{ entries: AuditEntry[] }> {
  return request(`/audit?limit=${limit}`);
}

// ---- Live 表示設定 ----

export interface AdminLiveColumnOption {
  value: string;
  label: string;
  visible: boolean;
}

export interface AdminLiveColumn {
  key: string;
  label: string;
  visible: boolean;
  raceOnly: boolean;
  toggle?: {
    defaultValue: string;
    options: AdminLiveColumnOption[];
  };
}

export interface AdminElapsedIdle {
  idleThresholdSec: number;
  idleDisplay: "freeze" | "blank";
}

export function adminGetLiveDisplay(): Promise<{
  columns: AdminLiveColumn[];
  elapsed: AdminElapsedIdle;
}> {
  return request("/display/live");
}

export function adminSaveLiveDisplay(
  columns: AdminLiveColumn[],
  elapsed: AdminElapsedIdle,
): Promise<{ columns: AdminLiveColumn[]; elapsed: AdminElapsedIdle }> {
  return request("/display/live", { method: "PUT", body: { columns, elapsed } });
}

export function adminResetLiveDisplay(): Promise<{ ok: true }> {
  return request("/display/live/reset", { method: "POST" });
}

export interface AdminLiveEntry {
  teamId: string;
  teamNo: string;
  classId: string;
  hidden: boolean;
  teamNameJ: string;
  teamNameE: string;
  driverNameJ: string;
  driverNameE: string;
  position: number;
  overridden: boolean;
}

export function adminListLiveEntries(): Promise<{ entries: AdminLiveEntry[] }> {
  return request("/live/entries");
}

export function adminPatchLiveEntry(
  teamId: string,
  body: {
    hidden?: boolean;
    resetNames?: boolean;
    teamNameJ?: string;
    teamNameE?: string;
    driverNameJ?: string;
    driverNameE?: string;
  },
): Promise<{ entries: AdminLiveEntry[] }> {
  return request(`/live/entries/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body,
  });
}
