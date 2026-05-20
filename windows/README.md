# RFX LiveTiming OKAYAMA — Windows Apps

このソリューションは岡山国際サーキット LiveTiming の Windows ネイティブアプリ群を含みます。

## 成果物

| プロジェクト | 配布バイナリ | 役割 |
|--------------|--------------|------|
| `RfxTiming.Smis.Core` | (library) | SMIS パーサー / DTO / ログ / DB / ネットワーク 共通実装 |
| `RfxTiming.Smis.Receiver` | `MOLA_Timing-Receiver.exe` | 計時室常駐: SMIS TCP → ローカル保存 → WebSocket 配信 |
| `RfxTiming.Smis.VirtualServer` | `MOLA_Timing-VirtualServer.exe` | 開発機: 保存ログを SMIS 互換 TCP で再配信 |
| `RfxTiming.Smis.Core.Tests` | (xUnit) | Core ライブラリの単体テスト |

> **命名規則**: 対外名は MOLA_Timing-Receiver / MOLA_Timing-VirtualServer。
> ソースコード上のプロトコル名は仕様書通り **SMIS** を使用する。

## 前提

- Windows 10 / 11 (x64)
- .NET 10 SDK (10.0.300 以降) — [ダウンロード](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2022 (17.12+) もしくは JetBrains Rider 2025.1+

> .NET 10 は 2025 年 11 月リリースの LTS（2028 年 11 月までサポート）。
> 計時室常駐アプリの基盤として最適。

WPF プロジェクトは Windows でのみビルド・実行可能です（macOS / Linux ではビルド不可）。
`RfxTiming.Smis.Core` および `RfxTiming.Smis.Core.Tests` は OS 非依存でビルド可能です。

## ビルド

```powershell
# このディレクトリ (windows/) に cd
cd windows

# パッケージ復元
dotnet restore

# 全プロジェクトをビルド (Debug)
dotnet build

# Release ビルド
dotnet build -c Release

# テスト実行
dotnet test
```

## 単体実行（開発時）

```powershell
# Receiver を起動
dotnet run --project RfxTiming.Smis.Receiver

# VirtualServer を起動
dotnet run --project RfxTiming.Smis.VirtualServer
```

## 配布パッケージ作成（計時室 PC 向け）

self-contained 単一 exe を作成します。インストーラー不要で USB で持ち込んでコピーするだけで動作します。

```powershell
# MOLA_Timing-Receiver.exe を出力
dotnet publish RfxTiming.Smis.Receiver `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o ../dist/Receiver

# MOLA_Timing-VirtualServer.exe を出力
dotnet publish RfxTiming.Smis.VirtualServer `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o ../dist/VirtualServer
```

## ディレクトリ構造

```
windows/
├── global.json                       SDK バージョン固定
├── Directory.Build.props             全プロジェクト共通設定
├── RfxTiming.sln
├── RfxTiming.Smis.Core/
│   ├── Messages/                     SMIS DTO 型定義
│   ├── Protocol/                     NULL 終端ストリーム分割
│   ├── Xml/                          XML → DTO パーサー
│   ├── Logging/                      ログ出力（W2 で実装）
│   ├── Persistence/                  SQLite（W2 で実装）
│   ├── Networking/                   TCP / WS（W2 で実装）
│   └── Replay/                       ログ再生（W4 で実装）
├── RfxTiming.Smis.Core.Tests/
├── RfxTiming.Smis.Receiver/
└── RfxTiming.Smis.VirtualServer/
```

## ログファイル運用（要注意）

岡山遠征で取得したログは **最重要資産** です。

- 既定の出力先: `%AppData%\MOLA_Timing-Receiver\logs\`
- ファイル名: `smis_raw_YYYYMMDD.txt` / `smis_parsed_YYYYMMDD.txt` / `*.meta.json`
- リポジトリ直下の `.gitignore` で `smis_raw_*.txt` 等を除外済み

**実機ログは別途 USB / クラウドストレージで二重バックアップを取ること。**
