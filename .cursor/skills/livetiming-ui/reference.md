# LiveTiming OKAYAMA — UI リファレンス

最終更新: リポジトリ内 `frontend/src` の実装に基づく。矛盾時は **ソースコードを正** とする。

---

## 1. カラーパレット

### 1.1 ベース（zinc スケール）

| 用途 | Tailwind / 値 |
|------|----------------|
| アプリ背景 | `#0c0c0f` / `bg-[#0c0c0f]` |
| パネル | `bg-zinc-900` |
| パネル半透明 | `bg-zinc-900/80`, `bg-zinc-900/95` |
| 行（偶/奇） | `bg-zinc-900/60`, `bg-zinc-900/30` |
| テーブルヘッダー | `bg-zinc-800` |
| ボーダー強 | `border-zinc-700` |
| ボーダー弱 | `border-zinc-800`, `border-zinc-800/30` |
| 本文 | `text-zinc-200`, `text-zinc-300` |
| 補助 | `text-zinc-400`, `text-zinc-500`, `text-zinc-600` |
| ホバー行 | `hover:bg-zinc-700/40` |
| メニュー選択 | `bg-zinc-700 text-white` |
| メニュー非選択 | `text-zinc-400 hover:bg-zinc-800` |

### 1.2 タイム種別 (`lib/colors.ts` → `TIME_COLORS`)

| 種別 | クラス |
|------|--------|
| overall_best | `text-fuchsia-400` |
| personal_best | `text-cyan-400` |
| current | `text-yellow-300` |
| none | `text-zinc-300` |

### 1.3 車両ステータス (`STATUS_COLORS`)

| status | 背景 |
|--------|------|
| on_track | `bg-zinc-800` |
| in_pit | `bg-blue-700` |
| pit_out | `bg-orange-500` |
| stopped | `bg-red-600` |
| retired | `bg-zinc-600` |
| finished | `bg-zinc-500` |

行内インジケータ（例）: ピット中 `P` → `text-cyan-400`

### 1.4 順位変動

| 状態 | 表示 |
|------|------|
| 上昇 | `text-green-400` + `▲n` + 行 `pos-up` |
| 下降 | `text-red-400` + `▼n` + 行 `pos-down` |
| 変化なし | `text-zinc-600` + `-` |

### 1.5 トラックフラグ (`FLAG_COLORS`)

green / yellow / red / white(SC) / fcy / black / chequered — 実装は `TrackStatus.tsx`

### 1.6 岡山マップ (`OkayamaCircuitSvg.tsx`)

| 要素 | 値 |
|------|-----|
| S1 路面 | `#ef4444` |
| S2 路面 | `#eab308` |
| S3 路面 | `#22c55e` |
| 路面ワイドストローク | 38px |
| 中心線 | 9px |
| セクター境界 | `#f59e0b` 点線 |
| viewBox | `-80 -80 1820 940`（`OKAYAMA_TRACK_VIEWBOX`） |
| ズーム既定 | 0.83 |

---

## 2. タイポグラフィ

| 変数 | 用途 |
|------|------|
| `--timing-fs` | タイミング表・StatusBar |
| `--timing-fs-sm` | 列ヘッダー・サブラベル |
| `--timing-fs-lg` | （必要時の強調） |
| `--timing-fs-xl` | 残り時間・現在時刻 |

メディアクエリ: `globals.css`（639px / 899px 以下で固定 px にフォールバック）

**英語表記**: セッション名・ドライバー名は `nameE` フィールド。UI ラベルは英語 uppercase が基本（`FL`, `ON TRACK`, `Driver`）。

---

## 3. アニメーション (`globals.css`)

| クラス | 用途 | 時間 |
|--------|------|------|
| `pos-up` / `pos-down` | 順位変動フラッシュ | 2s |
| `fl-flash` | ファステストラップ行 | 1.8s |
| `sector-flash` + `-ob/-pb/-cur` | セクターセル | 1.5s |

`TimingRow` で `sectorFlash` 0=FL行全体、1–3=S1–S3。`TimingTable` は `sectorFlashes` + `key` で再マウント。

---

## 4. コンポーネント一覧

### timing/

| ファイル | 責務 |
|----------|------|
| `TimingHeader.tsx` | 大会名・セッション・残り時間・時計・ロゴ |
| `TimingTable.tsx` | 表レイアウト・列トグル・フィルタ |
| `TimingRow.tsx` | 1 行表示・フラッシュ |
| `StatusBar.tsx` | FL・オンコース/ピット台数 |
| `SidePanel.tsx` | クラスフィルタ（折りたたみ） |
| `ColumnToggle.tsx` | ヘッダー内ドロップダウン |
| `ClassBadge.tsx` | クラス名（色は `getClassColor`） |
| `PitTimer.tsx` | ピット中タイマー |
| `TrackStatus.tsx` | フラッグ表示 |

### tracking/

| ファイル | 責務 |
|----------|------|
| `OkayamaCircuitSvg.tsx` | SVG 地図・ズーム・車マーカー |

### layout/ & shared/

| ファイル | 責務 |
|----------|------|
| `SideMenu.tsx` | ナビ・クラスフィルタ（幅 220/40px） |
| `SplashScreen.tsx` | 初回スプラッシュ（`sessionStorage`） |
| `DriverDetailPanel.tsx` | 行クリック詳細モーダル |

---

## 5. データ・フォーマット

- **時間単位**: SMIS 1/10000 秒 → `formatTime()` で `M:SS.mmm` または `SS.mmm`
- **残り時間**: 秒 → `formatRemainingTime()`
- **ピット**: `formatPitTime()`（秒）
- **モック**: `data/mock.ts` — 開発中は各ページから import

---

## 6. ボタン・コントロール

**デモ用（コメントアウト中のパターン、`page.tsx`）**

| 状態 | スタイル |
|------|----------|
| アクティブモード | `bg-zinc-600 text-white` |
| 非アクティブ | `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800` |
| 実行中（停止） | `bg-red-600 hover:bg-red-500` |
| 開始（Sector/Pos） | `bg-purple-600` / `bg-amber-600` |

**Tracking トグル**

| 状態 | スタイル |
|------|----------|
| Entries 開 | `bg-amber-600 border-amber-500` |
| 通常 | `bg-zinc-800 border-zinc-700` |

**ColumnToggle 選択中**: `text-yellow-400` / `bg-zinc-600`

---

## 7. 画像アセット

`public/images/`

- `okayama-logo.png` — ヘッダー（sm 以上表示）
- `mola-logo.png` — `invert brightness-90`

---

## 8. 新規コンポーネント チェックリスト

1. **配置**: `components/{timing|tracking|layout|shared}/`
2. **Client**: 状態・イベントあり → `"use client"`
3. **色**: ハードコード前に `colors.ts` を確認
4. **数値**: `font-mono tabular-nums`、時間は `formatTime`
5. **密度**: タイミング UI は `py-px`・小さめ `fontSize` 変数
6. **メニュー余白**: `paddingLeft: menuOpen ? "220px" : "40px"` + `transition-all duration-300`
7. **アクセシビリティ**: トグルに `aria-label` / `aria-pressed`（既存に合わせる）
8. **テスト**: `npm run dev` で `/` と `/tracking` を目視

---

## 9. 関連ドキュメント

- 開発計画: `docs/plan/開発計画_LiveTiming_OKAYAMA.md`
- Next.js 注意: `frontend/AGENTS.md`
