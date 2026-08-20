import readline from "node:readline";
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { AdminStore } from "./store.js";
import { hashPassword, validatePasswordStrength } from "./password.js";

/**
 * 管理者アカウントの CLI。
 *
 *   npm run admin -- list
 *   npm run admin -- create <username>
 *   npm run admin -- password <username>
 *   npm run admin -- delete <username>
 *
 * パスワードは対話入力（エコーなし）で受け取り、環境変数やシェル履歴に平文を残さない。
 * 標準入力がパイプの場合は 1 行目をパスワードとして読む（自動化用）。
 */

const USAGE = [
    "使い方:",
    "  npm run admin -- list",
    "  npm run admin -- create <username>",
    "  npm run admin -- password <username>",
    "  npm run admin -- delete <username>",
].join("\n");

async function main(): Promise<number> {
    const [command, username] = process.argv.slice(2);
    if (!command) {
        console.log(USAGE);
        return 1;
    }

    const config = loadConfig();
    const store = new AdminStore(config.dataDir, new Logger(config.logLevel));

    try {
        switch (command) {
            case "list":
                return listUsers(store);
            case "create":
                return await createUser(store, username);
            case "password":
                return await changePassword(store, username);
            case "delete":
                return deleteUser(store, username);
            default:
                console.error(`不明なコマンド: ${command}\n\n${USAGE}`);
                return 1;
        }
    } finally {
        store.close();
    }
}

function listUsers(store: AdminStore): number {
    const users = store.listUsers();
    if (users.length === 0) {
        console.log("管理者アカウントはまだありません。`npm run admin -- create <username>` で作成してください。");
        return 0;
    }
    for (const u of users) {
        console.log(
            `${String(u.id).padStart(3)}  ${u.username.padEnd(24)}  最終ログイン: ${u.lastLoginAt ?? "-"}`,
        );
    }
    return 0;
}

async function createUser(store: AdminStore, username: string | undefined): Promise<number> {
    const name = normalizeUsername(username);
    if (!name) return 1;
    if (store.findCredentialByUsername(name)) {
        console.error(`ユーザー ${name} は既に存在します。パスワード変更は password コマンドを使ってください。`);
        return 1;
    }
    const password = await readPassword(true);
    if (password === null) return 1;

    const { hash, salt } = hashPassword(password);
    const created = store.createUser(name, hash, salt);
    store.appendAudit(name, "user.create", `user:${created.id}`, { via: "cli" });
    console.log(`管理者 ${name} を作成しました (id=${created.id})。`);
    return 0;
}

async function changePassword(store: AdminStore, username: string | undefined): Promise<number> {
    const name = normalizeUsername(username);
    if (!name) return 1;
    const existing = store.findCredentialByUsername(name);
    if (!existing) {
        console.error(`ユーザー ${name} が見つかりません。`);
        return 1;
    }
    const password = await readPassword(true);
    if (password === null) return 1;

    const { hash, salt } = hashPassword(password);
    store.updatePassword(existing.id, hash, salt);
    store.appendAudit(name, "user.password", `user:${existing.id}`, { via: "cli" });
    console.log(`${name} のパスワードを変更しました。既存のログインセッションは無効化されました。`);
    return 0;
}

function deleteUser(store: AdminStore, username: string | undefined): number {
    const name = normalizeUsername(username);
    if (!name) return 1;
    const existing = store.findCredentialByUsername(name);
    if (!existing) {
        console.error(`ユーザー ${name} が見つかりません。`);
        return 1;
    }
    if (store.countUsers() <= 1) {
        console.error("最後の管理者は削除できません。先に別の管理者を作成してください。");
        return 1;
    }
    store.deleteUser(existing.id);
    store.appendAudit(name, "user.delete", `user:${existing.id}`, { via: "cli" });
    console.log(`管理者 ${name} を削除しました。`);
    return 0;
}

function normalizeUsername(input: string | undefined): string | null {
    const name = (input ?? "").trim();
    if (!name) {
        console.error(`username を指定してください。\n\n${USAGE}`);
        return null;
    }
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(name)) {
        console.error("username は英数字・ドット・アンダースコア・ハイフンの 3〜32 文字にしてください。");
        return null;
    }
    return name;
}

async function readPassword(confirm: boolean): Promise<string | null> {
    if (!process.stdin.isTTY) {
        const piped = await readLineFromStdin();
        const error = validatePasswordStrength(piped);
        if (error) {
            console.error(error);
            return null;
        }
        return piped;
    }

    const password = await promptHidden("パスワード: ");
    const error = validatePasswordStrength(password);
    if (error) {
        console.error(error);
        return null;
    }
    if (confirm) {
        const again = await promptHidden("パスワード（確認）: ");
        if (again !== password) {
            console.error("パスワードが一致しません。");
            return null;
        }
    }
    return password;
}

function readLineFromStdin(): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin });
        // rl.close() は close を同期発火させるため、解決は close 側に一本化する
        let received: string | null = null;
        rl.once("line", (line) => {
            received = line.trim();
            rl.close();
        });
        rl.once("close", () => resolve(received ?? ""));
    });
}

/** 入力をエコーせずに 1 行読む。パスワードを端末とシェル履歴に残さないため。 */
function promptHidden(question: string): Promise<string> {
    return new Promise((resolve) => {
        process.stdout.write(question);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });
        // readline の既定のエコー処理を無効化する
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
        rl.question("", (answer) => {
            process.stdout.write("\n");
            rl.close();
            resolve(answer);
        });
    });
}

main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
        console.error((err as Error).message);
        process.exit(1);
    });
