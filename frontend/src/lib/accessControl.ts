/**
 * 一般向け / 関係者向け / 管理者向けのアクセス制御ポリシー。
 *
 * - 一般向け (`mola-timing-okayama.com`): ブラウザ GPS による場内ジオフェンス（本実装）
 * - 関係者向け (`oic-private.…`): 制限なし
 * - 管理者向け (`oic-timing-admin.…`): GPS なし。ログイン必須（サーバー側 Cookie セッション）
 * - IP 制限: 承認後に nginx 側（一般向けホストのみ）で有効化する想定。
 *   設定例は `deploy/nginx/snippets/mola-public-ip-allowlist.conf.example`
 */

/** 岡山国際サーキット中心（Wikipedia / 公開座標） */
export const VENUE_CENTER = {
  lat: 34.915,
  lng: 134.22111,
} as const;

/**
 * 場内とみなす半径（メートル）。
 * コース・ピット・駐車場をカバーしつつ、遠方は確実に外す。
 */
export const VENUE_RADIUS_M = 3000;

/** 位置の再確認間隔（ミリ秒）。移動後の切断用。 */
export const GEO_RECHECK_INTERVAL_MS = 30_000;

const PUBLIC_HOSTS = new Set([
  "mola-timing-okayama.com",
  "www.mola-timing-okayama.com",
]);

const PRIVATE_HOSTS = new Set(["oic-private.mola-timing-okayama.com"]);

const ADMIN_HOSTS = new Set(["oic-timing-admin.mola-timing-okayama.com"]);

/**
 * 管理画面を出すホスト。
 *
 * NEXT_PUBLIC_ADMIN_HOST（カンマ区切り）で追加できる。ステージング等でホストが
 * 変わる場合に使う想定で、本番ホストは既定に含めてある
 * （NEXT_PUBLIC_* はビルド時に埋め込まれるため、env 頼みだと設定漏れで 404 になる）。
 */
export function adminHosts(): Set<string> {
  const extra = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return new Set([...ADMIN_HOSTS, ...extra]);
}

export type AccessAudience = "public" | "private" | "local" | "admin";

export function resolveAccessAudience(hostname: string): AccessAudience {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local")
  ) {
    return "local";
  }
  if (adminHosts().has(host)) return "admin";
  if (PRIVATE_HOSTS.has(host)) return "private";
  if (PUBLIC_HOSTS.has(host)) return "public";
  // 未知ホストは本番誤設定を避けるため一般向け扱いで制限する
  return "public";
}

/** 一般向けホストでのみ GPS ジオフェンスを要求する */
export function requiresVenueGeofence(hostname: string): boolean {
  return resolveAccessAudience(hostname) === "public";
}

/** `/admin` 配下を配信して良いホストか。ローカル開発と管理ホストのみ。 */
export function allowsAdminPages(hostname: string): boolean {
  const audience = resolveAccessAudience(hostname);
  return audience === "admin" || audience === "local";
}

/** 2点間の大円距離（メートル） */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideVenue(lat: number, lng: number, radiusM = VENUE_RADIUS_M): boolean {
  return distanceMeters(lat, lng, VENUE_CENTER.lat, VENUE_CENTER.lng) <= radiusM;
}
