"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminChangePassword,
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  type AdminUser,
} from "@/lib/adminApi";
import { useAdminAuth } from "@/components/admin/AdminGate";

/** 管理者アカウントの追加・パスワード変更・削除。 */
export default function AdminUsersPage() {
  const { user: currentUser, signOut } = useAdminAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [passwordTargetId, setPasswordTargetId] = useState<number | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users: rows } = await adminListUsers();
      setUsers(rows);
    } catch (err) {
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { users: rows } = await adminListUsers();
        if (!cancelled) setUsers(rows);
      } catch (err) {
        if (!cancelled) setError(describe(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      await adminCreateUser(newUsername.trim(), newPassword);
      setNewUsername("");
      setNewPassword("");
      setNotice("管理者を追加しました");
      await load();
    } catch (err) {
      setError(describe(err));
    } finally {
      setCreating(false);
    }
  };

  const changePassword = async (id: number, password: string) => {
    setBusyId(id);
    setError(null);
    try {
      const { reauthRequired } = await adminChangePassword(id, password);
      setPasswordTargetId(null);
      if (reauthRequired) {
        // 自分のパスワードを変えるとセッションが失効するので、そのままログアウトする
        setNotice("パスワードを変更しました。再度ログインしてください。");
        signOut();
        return;
      }
      setNotice("パスワードを変更しました。対象ユーザーは再ログインが必要です。");
      await load();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (target: AdminUser) => {
    if (!window.confirm(`管理者 ${target.username} を削除しますか？`)) return;
    setBusyId(target.id);
    setError(null);
    try {
      await adminDeleteUser(target.id);
      setNotice(`${target.username} を削除しました`);
      await load();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold tracking-wider text-zinc-400 uppercase">
          管理者一覧
        </h2>
        <div className="divide-y divide-zinc-800/50 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">読み込み中…</div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm text-zinc-200">
                      {user.username}
                      {user.id === currentUser.id && (
                        <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                          自分
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      最終ログイン: {user.lastLoginAt ? formatStamp(user.lastLoginAt) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPasswordTargetId(passwordTargetId === user.id ? null : user.id)
                      }
                      className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
                    >
                      {passwordTargetId === user.id ? "閉じる" : "パスワード変更"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === user.id || user.id === currentUser.id || users.length <= 1}
                      onClick={() => void deleteUser(user)}
                      className="rounded-md bg-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-200 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-700 disabled:hover:text-zinc-200"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {passwordTargetId === user.id && (
                  <PasswordForm
                    busy={busyId === user.id}
                    onCancel={() => setPasswordTargetId(null)}
                    onSubmit={(password) => void changePassword(user.id, password)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-zinc-400 uppercase">
          管理者を追加
        </h2>
        <form
          onSubmit={createUser}
          className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold text-zinc-400"
                htmlFor="new-username"
              >
                ユーザー名
              </label>
              <input
                id="new-username"
                type="text"
                autoComplete="off"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold text-zinc-400"
                htmlFor="new-password"
              >
                パスワード
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            パスワードは 10 文字以上にしてください。
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={creating || !newUsername.trim() || !newPassword}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {creating ? "追加中…" : "追加"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
      <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
        新しいパスワード
      </label>
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
      />
      <p className="mt-2 text-[11px] text-zinc-500">
        変更すると、そのユーザーのログインセッションはすべて無効になります。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={busy || !password}
          onClick={() => onSubmit(password)}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {busy ? "変更中…" : "変更"}
        </button>
      </div>
    </div>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { hour12: false });
}

function describe(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return "通信に失敗しました";
}
