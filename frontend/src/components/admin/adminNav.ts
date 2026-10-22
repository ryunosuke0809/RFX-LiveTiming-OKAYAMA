/** 管理画面のメニュー。Live は項目が増えたのでパネルに分ける。 */

export const LIVE_PANELS = [
  { id: "columns", label: "列の並び", href: "/admin/live" },
  { id: "presets", label: "予選と決勝", href: "/admin/live?panel=presets" },
  { id: "elapsed", label: "経過時間", href: "/admin/live?panel=elapsed" },
  { id: "entries", label: "エントリー", href: "/admin/live?panel=entries" },
  { id: "reset", label: "リセット", href: "/admin/live?panel=reset" },
] as const;

export type LivePanelId = (typeof LIVE_PANELS)[number]["id"];

export function livePanelFromSearch(value: string | null): LivePanelId {
  const found = LIVE_PANELS.find((panel) => panel.id === value);
  return found?.id ?? "columns";
}

export function adminPageTitle(pathname: string, panel: string | null): string {
  if (pathname.startsWith("/admin/users")) return "ユーザー";
  if (pathname.startsWith("/admin/archive")) return "履歴データ";
  if (pathname.startsWith("/admin/live")) {
    return LIVE_PANELS.find((item) => item.id === livePanelFromSearch(panel))?.label ?? "Live表示";
  }
  return "管理画面";
}
