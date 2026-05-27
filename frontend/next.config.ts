import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // 開発時、スマホ実機など別ホストから dev サーバーにアクセスすると
  // /_next/webpack-hmr などの cross-origin リクエストがブロックされ、
  // 結果として JS/CSS チャンクや WebSocket 接続が確立できず、SVG 描画も
  // タッチ操作（タップ・ハンバーガー含む）も一切効かない状態になる。
  //
  // Next.js の allowedDevOrigins は内部で DNS ライクなドットセグメント比較で
  // パターンマッチする。`*` は1セグメントにマッチ（末尾だけ wildcard 可）、
  // `**` は残り全部にマッチする。CIDR は使えない。
  // 詳細: node_modules/next/dist/server/app-render/csrf-protection.js
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    // 既知の明示ホスト（過去にログ出た IP）
    "192.168.128.152",
    "100.88.100.119",
    // Mac と同じ LAN サブネットの全デバイス
    "192.168.128.*",
    // Tailscale (CGNAT 100.64.0.0/10) 全範囲
    "100.*.*.*",
    // 一般的なローカル LAN 範囲
    "10.*.*.*",
    "192.168.*.*",
  ],
};

export default nextConfig;
