// ============================================================
// MOLA 生ログ (MOLA_INPUT_YYYYMMDD.log) 再生スクリプト
// ============================================================
//
// Windows 専用の VirtualServer を使わずに、Mac/Linux 上で
// 記録済みの SMIS 生ログを本番相当の envelope に変換し、
// クラウドサーバーの /ingest WebSocket へ流し込む開発用ツール。
//
// これにより「Receiver → クラウド → /ws → フロント」の下流を
// 実データでローカル検証できる。
//
// 使い方:
//   node scripts/replay-log.mjs --dates                 # 収録日一覧を表示して終了
//   node scripts/replay-log.mjs --date 20260614 --list  # 指定日のセッション区切りを一覧
//   node scripts/replay-log.mjs --date 20260614 --segment 3 --speed 10 # 指定日の3番目を10倍速
//   node scripts/replay-log.mjs --file ../exports/archive/20260612/MOLA_INPUT_20260612.log
//   node scripts/replay-log.mjs --speed inf             # 一気に流す (待機なし)
//
// 主なオプション:
//   --date <YYYYMMDD> 収録日で再生ファイルを指定 (exports/archive/<日付>/MOLA_INPUT_<日付>.log)
//   --file <path>     再生する .log ファイルを直接指定 (--date より優先, 既定: 20260612)
//   --url <ws>        ingest URL (既定: ws://127.0.0.1:4000/ingest)
//   --token <t>       Bearer トークン (既定: 環境変数 RECEIVER_INGEST_TOKEN)
//   --circuit <id>    circuitId (既定: okayama)
//   --speed <n|inf>   再生倍速 (既定: 1 = 実時間, inf = 待機なし)
//   --segment <n>     Competition 区切りの n 番目のみ再生 (1始まり)
//   --maxgap <ms>     メッセージ間の最大待機ms (長い空白を圧縮, 既定: 5000)
//   --list            (指定ファイルの) セグメント一覧を表示して終了
//   --dates           収録されている日付一覧を表示して終了

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- 引数パース ----
function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
            args[key] = true;
        } else {
            args[key] = next;
            i++;
        }
    }
    return args;
}

const args = parseArgs(process.argv);

const ARCHIVE_DIR = path.resolve(__dirname, "../../exports/archive");

/** exports/archive 配下の収録日 (MOLA_INPUT_<日付>.log を持つディレクトリ) を返す。 */
function listArchiveDates() {
    if (!fs.existsSync(ARCHIVE_DIR)) return [];
    return fs
        .readdirSync(ARCHIVE_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) =>
            fs.existsSync(path.join(ARCHIVE_DIR, name, `MOLA_INPUT_${name}.log`)),
        )
        .sort();
}

/** --date <YYYYMMDD> → 該当ログの絶対パス。 */
function logPathForDate(date) {
    return path.join(ARCHIVE_DIR, String(date), `MOLA_INPUT_${date}.log`);
}

const DEFAULT_LOG = logPathForDate("20260612");
const FILE = args.file
    ? path.resolve(process.cwd(), args.file)
    : args.date
      ? logPathForDate(args.date)
      : DEFAULT_LOG;
const URL = args.url ?? "ws://127.0.0.1:4000/ingest";
const TOKEN = args.token ?? process.env.RECEIVER_INGEST_TOKEN ?? "";
const CIRCUIT = args.circuit ?? "okayama";
const SPEED =
    args.speed === "inf" || args.speed === "0"
        ? Infinity
        : Number(args.speed ?? "1") || 1;
const SEGMENT = args.segment ? Number(args.segment) : null;
const MAXGAP = Number(args.maxgap ?? "5000") || 5000;

// ============================================================
// SMIS XML パーサー (軽量・この用途に必要な範囲のみ)
// ============================================================

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

const isNameChar = (c) => /[A-Za-z0-9_]/.test(c);

/**
 * s[start] === '<' の要素を1つパースする。
 * 戻り値: { name, attrs, children, end }
 * 自己終了 <X/> と、子要素を持つ <X>...</X> の両方に対応。
 * 属性名なしの裸トークン (壊れた行) はスキップする。
 */
function parseElementAt(s, start) {
    let i = start + 1;
    const nameStart = i;
    while (i < s.length && isNameChar(s[i])) i++;
    const name = s.slice(nameStart, i);
    const attrs = {};

    while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] === "/" && s[i + 1] === ">") {
            return { name, attrs, children: [], end: i + 2 };
        }
        if (s[i] === ">") {
            i++;
            break;
        }
        // 属性名
        const anStart = i;
        while (i < s.length && isNameChar(s[i])) i++;
        const attrName = s.slice(anStart, i);
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] === "=") {
            i++;
            while (i < s.length && /\s/.test(s[i])) i++;
            const quote = s[i];
            i++;
            const vStart = i;
            while (i < s.length && s[i] !== quote) i++;
            const raw = s.slice(vStart, i);
            i++; // 閉じクォート
            if (attrName) attrs[attrName] = decodeEntities(raw);
        } else if (s[i] === '"') {
            // 属性名のない裸の "値" (壊れた Competition 行など) → スキップ
            i++;
            while (i < s.length && s[i] !== '"') i++;
            i++;
        } else if (attrName === "") {
            // 進めないと無限ループするため保険
            i++;
        }
    }

    // 子要素
    const children = [];
    while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] === "<" && s[i + 1] === "/") {
            const ce = s.indexOf(">", i);
            i = ce === -1 ? s.length : ce + 1;
            break;
        }
        if (s[i] === "<") {
            const child = parseElementAt(s, i);
            children.push(child);
            i = child.end;
        } else {
            i++;
        }
    }
    return { name, attrs, children, end: i };
}

/** 1行の XML 部分から、トップレベル要素の配列を返す。 */
function parseTopLevel(xml) {
    const nodes = [];
    let i = 0;
    while (i < xml.length) {
        while (i < xml.length && xml[i] !== "<") i++;
        if (i >= xml.length) break;
        const node = parseElementAt(xml, i);
        if (!node.name) break;
        nodes.push(node);
        i = node.end;
    }
    return nodes;
}

// ============================================================
// SMIS DTO → 本番相当 (camelCase) payload への変換
// ============================================================

/** 属性名 (PascalCase / *ID) を CloudUploaderService と同じ camelCase キーに正規化。 */
function normKey(k) {
    let key = k;
    if (key.endsWith("ID")) key = key.slice(0, -2) + "Id";
    return key.charAt(0).toLowerCase() + key.slice(1);
}

/** "950530" → 950530, "1:1:12" → "1:1:12", "" → "" */
function coerce(v) {
    if (v === "") return "";
    if (/^-?\d+$/.test(v)) return Number(v);
    return v;
}

const PASSING_TYPE = { N: 1, B: 2, M: 3, C: 4, E: 5 };

function attrsToPayload(attrs) {
    const out = {};
    for (const [k, v] of Object.entries(attrs)) {
        out[normKey(k)] = coerce(v);
    }
    return out;
}

/** パース済ノード → envelope payload。コンテナ (Team/Standings/Transponder) は子を展開。 */
function nodeToPayload(node) {
    const p = attrsToPayload(node.attrs);

    switch (node.name) {
        case "Team":
            p.drivers = node.children
                .filter((c) => c.name === "Driver")
                .map((c) => attrsToPayload(c.attrs));
            break;
        case "Standings":
            p.items = node.children
                .filter((c) => c.name === "Standing")
                .map((c) => attrsToPayload(c.attrs));
            break;
        case "Transponder":
            p.tags = node.children
                .filter((c) => c.name === "Tag")
                .map((c) => attrsToPayload(c.attrs));
            break;
        case "Passing":
            if (typeof p.type === "string" && PASSING_TYPE[p.type] !== undefined) {
                p.type = PASSING_TYPE[p.type];
            }
            break;
        default:
            break;
    }
    return p;
}

// ============================================================
// ログ読み込み
// ============================================================

const TS_LEN = 23; // "yyyy-MM-dd HH:mm:ss.fff"

/** 1行 → { tsMs, isoTs, nodes } | null */
function parseLine(line) {
    if (!line || line.length < TS_LEN + 2) return null;
    let s = line;
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    const tsPart = s.slice(0, TS_LEN);
    if (s[TS_LEN] !== " ") return null;
    const xml = s.slice(TS_LEN + 1).trimEnd();
    if (!xml.startsWith("<")) return null;

    // "2026-06-12 09:10:12.643" (JST) → ISO with +09:00
    const iso = tsPart.replace(" ", "T") + "+09:00";
    const tsMs = Date.parse(iso);
    if (Number.isNaN(tsMs)) return null;

    const nodes = parseTopLevel(xml);
    return { tsMs, isoTs: iso, nodes };
}

function readLog(file) {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed && parsed.nodes.length > 0) entries.push(parsed);
    }
    return entries;
}

/** Competition 出現ごとにセグメント分割。 */
function splitSegments(entries) {
    const segments = [];
    let cur = null;
    for (const e of entries) {
        const startsSegment = e.nodes.some((n) => n.name === "Competition");
        if (startsSegment && cur && cur.entries.length > 0) {
            segments.push(cur);
            cur = null;
        }
        if (!cur) {
            cur = { entries: [], competition: "", category: "" };
        }
        for (const n of e.nodes) {
            if (n.name === "Competition") cur.competition = n.attrs.NameJ ?? "";
            if (n.name === "Category") cur.category = n.attrs.NameJ ?? "";
        }
        cur.entries.push(e);
    }
    if (cur && cur.entries.length > 0) segments.push(cur);
    return segments;
}

// ============================================================
// 実行
// ============================================================

function summarize(segments) {
    console.log(`\nセグメント一覧 (${segments.length}件):`);
    segments.forEach((seg, idx) => {
        const kinds = {};
        for (const e of seg.entries)
            for (const n of e.nodes) kinds[n.name] = (kinds[n.name] ?? 0) + 1;
        const first = new Date(seg.entries[0].tsMs).toISOString().slice(11, 19);
        console.log(
            `  [${idx + 1}] ${first} | ${seg.competition.slice(0, 24)} / ${seg.category} ` +
                `(Passing=${kinds.Passing ?? 0}, Standings=${kinds.Standings ?? 0}, Start=${kinds.Start ?? 0})`,
        );
    });
    console.log("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    if (args.dates) {
        const dates = listArchiveDates();
        console.log(`\n収録日一覧 (${dates.length}件):`);
        for (const d of dates) console.log(`  --date ${d}`);
        console.log("\n例: node scripts/replay-log.mjs --date <日付> --list\n");
        process.exit(0);
    }

    if (!fs.existsSync(FILE)) {
        console.error(`ログが見つかりません: ${FILE}`);
        const dates = listArchiveDates();
        if (dates.length > 0) {
            console.error(`利用可能な日付: ${dates.join(", ")}`);
            console.error("例: node scripts/replay-log.mjs --date <日付> --list");
        }
        process.exit(1);
    }

    console.log(`ログ読み込み中: ${FILE}`);
    const entries = readLog(FILE);
    const segments = splitSegments(entries);
    console.log(`  ${entries.length} 行, ${segments.length} セグメント`);

    if (args.list) {
        summarize(segments);
        process.exit(0);
    }

    if (!TOKEN) {
        console.error(
            "トークン未指定。--token か 環境変数 RECEIVER_INGEST_TOKEN を設定してください。",
        );
        process.exit(1);
    }

    let playEntries = entries;
    if (SEGMENT !== null) {
        if (SEGMENT < 1 || SEGMENT > segments.length) {
            console.error(`--segment は 1〜${segments.length} で指定してください。`);
            process.exit(1);
        }
        playEntries = segments[SEGMENT - 1].entries;
        console.log(
            `セグメント ${SEGMENT} のみ再生: ${segments[SEGMENT - 1].competition} / ${segments[SEGMENT - 1].category} (${playEntries.length}行)`,
        );
    }

    console.log(
        `接続: ${URL} (circuit=${CIRCUIT}, speed=${SPEED === Infinity ? "inf" : SPEED + "x"}, maxgap=${MAXGAP}ms)`,
    );

    const ws = new WebSocket(URL, { headers: { Authorization: `Bearer ${TOKEN}` } });

    let acks = 0;
    let nacks = 0;
    ws.on("message", (data) => {
        try {
            const m = JSON.parse(data.toString());
            if (m.type === "ack") acks++;
            else if (m.type === "nack") {
                nacks++;
                if (nacks <= 10) console.warn("  nack:", m.error, "seq=", m.seq);
            }
        } catch {
            /* ignore */
        }
    });

    await new Promise((resolve, reject) => {
        ws.on("open", resolve);
        ws.on("error", reject);
    });
    console.log("接続完了。再生開始。\n");

    let seq = 1;
    let sent = 0;
    const baseTs = playEntries[0].tsMs;
    const startWall = Date.now();

    // ソケットの送信バッファが膨らんだら掃けるまで待つ (backpressure 対策)。
    const drainIfNeeded = async () => {
        while (ws.bufferedAmount > 1_000_000) {
            await sleep(5);
        }
    };
    // ack がある程度追いつくまで待つ (サーバーの同期処理が詰まらないように)。
    const throttleAcks = async () => {
        while (sent - acks - nacks > 2000) {
            await sleep(5);
        }
    };

    for (let idx = 0; idx < playEntries.length; idx++) {
        const entry = playEntries[idx];

        if (SPEED !== Infinity && idx > 0) {
            const logElapsed = entry.tsMs - playEntries[idx - 1].tsMs;
            const wait = Math.min(logElapsed, MAXGAP) / SPEED;
            if (wait > 0) await sleep(wait);
        }

        for (const node of entry.nodes) {
            const kind = node.name;
            const payload = nodeToPayload(node);
            const envelope = {
                seq: seq++,
                circuitId: CIRCUIT,
                ts: entry.isoTs,
                kind,
                payload,
            };
            ws.send(JSON.stringify(envelope));
            sent++;
        }

        if (SPEED === Infinity) {
            await drainIfNeeded();
            await throttleAcks();
        }

        if (sent % 500 === 0) {
            process.stdout.write(
                `\r  送信 ${sent} 件 (ack=${acks}, nack=${nacks}) ...`,
            );
        }
    }

    // 全 ack が返るまで待つ (最大15s)。取りこぼしなく処理させるため。
    const ackDeadline = Date.now() + 15_000;
    while (acks + nacks < sent && Date.now() < ackDeadline) {
        await sleep(20);
    }
    const wall = ((Date.now() - startWall) / 1000).toFixed(1);
    console.log(
        `\n\n完了: ${sent} 件送信 (ack=${acks}, nack=${nacks}) / ${wall}s / ログ長 ${((playEntries[playEntries.length - 1].tsMs - baseTs) / 1000).toFixed(0)}s`,
    );
    ws.close();
    process.exit(0);
}

main().catch((err) => {
    console.error("再生エラー:", err);
    process.exit(1);
});
