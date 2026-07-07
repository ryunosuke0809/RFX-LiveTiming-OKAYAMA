---
name: livetiming-ui
description: >-
  RFX-LiveTiming-OKAYAMA の Live Timing / Tracking UI を実装・改修する際のデザインシステムと手順。
  Use when adding or changing frontend UI, timing table, tracking map, Okayama circuit SVG,
  SideMenu, StatusBar, or visual styling in this repository.
---

# LiveTiming OKAYAMA — UI 開発スキル

## 適用範囲

**リポジトリ `RFX-LiveTiming-OKAYAMA` の `frontend/` のみ。** 他サーキット・他プロジェクトの UI 規約は使わない。

## 作業開始時

1. `.cursor/rules/livetiming-design.mdc` と `livetiming-components.mdc` に従う
2. 変更対象の既存コンポーネントを読み、パターンを踏襲する
3. 詳細仕様は [reference.md](reference.md) を参照

## 新機能の標準手順

```
- [ ] 配置先ディレクトリを決める（timing / tracking / layout / shared）
- [ ] 型は types/smis.ts、色は lib/colors.ts、時間表示は lib/format.ts
- [ ] フォントサイズは var(--timing-fs*) を使用
- [ ] SideMenu 幅（220px / 40px）と paddingLeft をページ全体で揃える
- [ ] モックデータが必要なら data/mock.ts に追加
- [ ] npm run dev で表示確認（localhost）
```

## 画面別の入口ファイル

| 画面 | ページ | 主要コンポーネント |
|------|--------|-------------------|
| Live Timing | `app/page.tsx` | TimingHeader, TimingTable, StatusBar, SideMenu |
| Tracking | `app/tracking/page.tsx` | OkayamaCircuitSvg, SideMenu |
| 結果 | `app/result/page.tsx` | （timing 系と同系統のダーク UI） |
| スケジュール | `app/schedule/page.tsx` | layout パターンに合わせる |

## 岡山コースマップを触るとき

- パス定義・オフセット: `lib/okayamaTrackAsset.ts`（Figma 書き出し `d` 文字列）
- スムージング・サンプリング: `lib/okayamaTrackGeometry.ts`（Chaikin、`buildOkayamaLapGeometry`）
- 描画・ズーム・マーカー: `components/tracking/OkayamaCircuitSvg.tsx`
- セクター色 S1/S2/S3 と境界色は reference.md の定数表に従う

## やってはいけないこと

- ライトテーマや白背景メインの画面を新設する
- Tailwind の arbitrary 色でタイム種別を表現する（`TIME_COLORS` を使う）
- コース SVG の `d` をコンポーネント内に直書きする（asset / geometry に分離）
- `frontend` 外の別プロジェクト用コンポーネントをこの repo に混在させる

## 追加リソース

- 色・クラス・フラグ一覧、アニメーション、ファイルマップ → [reference.md](reference.md)
