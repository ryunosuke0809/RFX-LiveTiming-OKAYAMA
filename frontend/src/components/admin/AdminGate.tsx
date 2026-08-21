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
import { usePathname } from "next/navigation";
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

const NAV_ITEMS = [
  { href: "/admin/archive", label: "履歴データ" },
  { href: "/admin/live", label: "Live表示" },
  { href: "/admin/users", label: "ユーザー" },
];

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
      <div className="flex h-full flex-col bg-[#0c0c0f]">
        <AdminNav username={user.username} onSignOut={signOut} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </AdminAuthContext.Provider>
  );
}

function AdminNav({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const pathname = usePathname();
  return (
    <header className="flex flex-shrink-0 flex-col gap-2 border-b border-zinc-700 bg-gradient-to-r from-zinc-900 via-zinc-800/80 to-zinc-900 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="text-base font-bold tracking-wide text-white sm:text-lg">Admin</h1>
        <nav className="flex items-center gap-1 rounded-lg bg-zinc-800 p-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href) ?? false;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors sm:px-3 sm:py-1.5 sm:text-xs ${
                  active ? "bg-amber-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="truncate font-mono text-xs text-zinc-400">{username}</span>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
        >
          ログアウト
        </button>
      </div>
    </header>
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
