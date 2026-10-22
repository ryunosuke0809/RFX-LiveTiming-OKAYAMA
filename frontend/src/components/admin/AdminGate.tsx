"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LIVE_PANELS, adminPageTitle, livePanelFromSearch } from "@/components/admin/adminNav";
import {
  AdminApiError,
  adminLogin,
  adminLogout,
  adminMe,
  type AdminUser,
} from "@/lib/adminApi";

/**
 * 管理画面の認証ゲート。
 *
 * 未ログインならログインフォームだけを描画し、子ページをマウントしない。
 * 認証の実体はサーバー側の HttpOnly Cookie セッションで、ここでの判定は表示制御のみ。
 */

interface AdminAuthValue {
  user: AdminUser;
  signOut: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth(): AdminAuthValue {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminGate");
  return value;
}

type Phase = "loading" | "anonymous" | "authenticated";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user: me } = await adminMe();
        if (cancelled) return;
        setUser(me);
        setPhase("authenticated");
      } catch {
        if (cancelled) return;
        setUser(null);
        setPhase("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    void adminLogout()
      .catch(() => {
        // サーバー側で既に失効していても、画面はログアウト状態にする
      })
      .finally(() => {
        setUser(null);
        setPhase("anonymous");
      });
  }, []);

  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-[#0c0c0f]">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400"
          aria-hidden
        />
      </div>
    );
  }

  if (phase === "anonymous" || !user) {
    return <LoginForm onSuccess={(me) => { setUser(me); setPhase("authenticated"); }} />;
  }

  return (
    <AdminAuthContext.Provider value={{ user, signOut }}>
      <AdminShell username={user.username} onSignOut={signOut}>
        {children}
      </AdminShell>
    </AdminAuthContext.Provider>
  );
}

function AdminShell({
  username,
  onSignOut,
  children,
}: {
  username: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("admin-sidebar") === "0") setDesktopOpen(false);
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, panel]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDesktopOpen((open) => {
        window.localStorage.setItem("admin-sidebar", open ? "0" : "1");
        return !open;
      });
      return;
    }
    setMobileOpen((open) => !open);
  };

  const menuOpen = isDesktop ? desktopOpen : mobileOpen;

  return (
    <div className="flex h-full bg-[#0c0c0f]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="メニューを閉じる"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="admin-sidebar"
        aria-hidden={!isDesktop && !mobileOpen}
        inert={!isDesktop && !mobileOpen ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800 bg-zinc-950 transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopOpen ? "" : "md:hidden"}`}
      >
        <div className="border-b border-zinc-800 px-4 py-4">
          <p className="text-[10px] tracking-[0.18em] text-zinc-500 uppercase">Okayama</p>
          <p className="mt-0.5 text-sm font-bold tracking-wide text-white">管理画面</p>
        </div>
        <nav aria-label="管理メニュー" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <SidebarLink href="/admin/archive" label="履歴データ" hint="公開・表示名" active={pathname.startsWith("/admin/archive")} />
          <p className="mt-4 mb-1 px-2 text-[10px] font-bold tracking-wider text-zinc-500">
            Live表示
          </p>
          {LIVE_PANELS.map((item) => {
            const active = pathname.startsWith("/admin/live") && livePanelFromSearch(panel) === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 block rounded-md px-3 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? "bg-amber-600/15 text-amber-200"
                    : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-3">
            <SidebarLink href="/admin/users" label="ユーザー" hint="管理者アカウント" active={pathname.startsWith("/admin/users")} />
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3">
          <button
            type="button"
            aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar"
            onClick={toggleSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
          >
            <MenuIcon open={menuOpen} />
          </button>
          <h1 className="min-w-0 truncate text-sm font-bold tracking-wide text-white">
            {adminPageTitle(pathname, panel)}
          </h1>
          <div className="ml-auto flex flex-shrink-0 items-center gap-3">
            <span className="hidden truncate font-mono text-xs text-zinc-400 sm:inline">{username}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
            >
              ログアウト
            </button>
          </div>
        </header>
        <div data-admin-scroll className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  hint,
  active,
}: {
  href: string;
  label: string;
  hint: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 transition-colors ${
        active ? "bg-amber-600/15 text-amber-200" : "text-zinc-200 hover:bg-zinc-900 hover:text-white"
      }`}
    >
      <span className="block text-[13px] font-bold">{label}</span>
      <span className={`block text-[10px] ${active ? "text-amber-200/70" : "text-zinc-500"}`}>{hint}</span>
    </Link>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      {open ? (
        <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ) : (
        <path d="M3 4.5h12M3 9h12M3 13.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (user: AdminUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await adminLogin(username.trim(), password);
      setPassword("");
      onSuccess(user);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "ログインに失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[#0c0c0f] px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900/80 p-6"
      >
        <p className="mb-1 text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
          Okayama International Circuit
        </p>
        <h1 className="mb-6 text-lg font-bold tracking-wide text-white">管理者ログイン</h1>

        <label className="mb-1 block text-xs font-semibold text-zinc-400" htmlFor="admin-username">
          ユーザー名
        </label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        <label className="mb-1 block text-xs font-semibold text-zinc-400" htmlFor="admin-password">
          パスワード
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="w-full rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}
