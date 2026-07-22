"use client";

import { useEffect, useState } from "react";
import SideMenu from "@/components/layout/SideMenu";

type Lang = "ja" | "en";

const LANG_KEY = "rfx-okayama-about-lang";

const copy = {
  ja: {
    title: "About",
    subtitle: "機能と操作方法",
    langJa: "日本語",
    langEn: "English",
    sections: [
      {
        title: "Timing（ライブタイミング）",
        body: [
          "走行中の順位・ラップタイム・セクタータイムをリアルタイムで表示します。",
          "ヘッダーにはセッション名、経過時間（ELAPSED）、決勝時のみリーダーの LAP が表示されます。",
          "表の列見出しをタップすると表示を切り替えられます（例: Behind / Gap、Laps / Time、Pit / PitTime）。",
          "Behind はトップとの差、Gap は直前の車との差です。",
          "決勝・レースでは順位変動（▲▼）列が出ます。予選などではピットスタート前は IN PIT 表示になります。",
          "行をタップすると、そのドライバーの詳細パネルが開きます。",
          "左メニューの Timing を開くと、クラスで絞り込みできます。",
        ],
      },
      {
        title: "Tracking（位置トラッキング）",
        body: [
          "岡山国際サーキットのマップ上に、各車のおよその位置を表示します。",
          "計測ポイント（FL / S1 / S2）を通過すると、その地点から次の区間へ向かってアイコンが動きます。",
          "ズーム（+/-）、回転、パン（ドラッグ）、車番アイコンの大きさは調整できます。設定はブラウザに保存され、Timing に戻っても維持されます。",
          "右のリストで車番をタップすると、その車をハイライトできます。",
          "IN PIT の車はマップから消え、Pit In リストに表示されます。",
        ],
      },
      {
        title: "Result（リザルト）",
        body: [
          "ライブ中のリザルト表示と、過去セッションのアーカイブ閲覧ができます。",
          "Classification: 順位表。行タップでドライバー詳細、CSV ダウンロードも可能です。",
          "Individual: 選手を選んでラップごとのタイムを確認できます。",
          "Calendar: 日付を選び、過去のセッションを開いたり CSV を取得できます。",
          "スマホでは表を横にスクロールできます。続きがあるときは右端・下端にヒントが表示されます。",
        ],
      },
      {
        title: "共通の操作",
        body: [
          "左上のメニューボタンでサイドメニューを開閉します。",
          "Timing / Tracking / Result / About を切り替えられます。",
          "ライブデータはサーバーから自動更新されます。接続できない場合はデータが表示されないことがあります。",
        ],
      },
    ],
  },
  en: {
    title: "About",
    subtitle: "Features & how to use",
    langJa: "日本語",
    langEn: "English",
    sections: [
      {
        title: "Timing (Live Timing)",
        body: [
          "Shows live positions, lap times, and sector times during a session.",
          "The header shows the session name, ELAPSED time, and leader LAP only in race sessions.",
          "Tap column headers to switch display modes (e.g. Behind / Gap, Laps / Time, Pit / PitTime).",
          "Behind is the gap to the leader; Gap is the gap to the car ahead.",
          "In race sessions, a position-change column (▲▼) appears. In practice/qualifying, cars start as IN PIT before pit-out.",
          "Tap a row to open the driver detail panel.",
          "Open Timing in the side menu to filter by class.",
        ],
      },
      {
        title: "Tracking",
        body: [
          "Shows approximate car positions on the Okayama International Circuit map.",
          "When a car passes a timing point (FL / S1 / S2), its marker starts moving from that point toward the next sector.",
          "You can zoom (+/-), rotate, pan (drag), and resize car-number icons. These settings are saved in the browser and kept when you leave and return.",
          "Tap a car number in the side list to highlight that car.",
          "Cars IN PIT disappear from the map and appear in the Pit In list.",
        ],
      },
      {
        title: "Result",
        body: [
          "View live results and past archived sessions.",
          "Classification: standings table. Tap a row for driver details; CSV download is available.",
          "Individual: select a driver to review lap-by-lap times.",
          "Calendar: pick a date to open past sessions or download CSV.",
          "On mobile, tables can scroll horizontally. Scroll hints appear when more content is available.",
        ],
      },
      {
        title: "Common controls",
        body: [
          "Use the top-left menu button to open or close the side menu.",
          "Switch between Timing, Tracking, Result, and About.",
          "Live data updates automatically from the server. If the connection is unavailable, data may not appear.",
        ],
      },
    ],
  },
} as const;

export default function AboutPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("ja");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved === "ja" || saved === "en") setLang(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLanguage = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const t = copy[lang];

  return (
    <div className="h-full flex flex-col bg-[#0c0c0f]">
      <SideMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(!menuOpen)}
        activeClassFilter={null}
        onClassFilterChange={() => {}}
      />

      <header
        className="flex items-center justify-between gap-3 px-3 sm:px-5 py-3 bg-zinc-900 border-b border-zinc-700 transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "230px" : "56px" }}
      >
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white tracking-wide">{t.title}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 p-0.5">
          <button
            type="button"
            onClick={() => setLanguage("ja")}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              lang === "ja" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.langJa}
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              lang === "en" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.langEn}
          </button>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{ paddingLeft: menuOpen ? "220px" : "40px" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          {t.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-white border-b border-zinc-800 pb-2">
                {section.title}
              </h2>
              <ul className="space-y-2.5">
                {section.body.map((line) => (
                  <li
                    key={line}
                    className="text-sm text-zinc-300 leading-relaxed pl-3 border-l-2 border-zinc-700"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
