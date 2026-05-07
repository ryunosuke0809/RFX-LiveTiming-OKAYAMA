import type {
  Competition, Category, Round, Session, CarClass, Team,
  Standing, SessionInfo, FastestLap, WeatherData, TrackCount,
  ScheduleEntry, CarStatus, TimeType, SectorTime,
} from "@/types/smis";

// Mulberry32 PRNG — SSR/CSR で同じ結果を返す
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seededRandom = mulberry32(42);

export const mockCompetition: Competition = {
  id: "1",
  nameJ: "2026 AUTOBACS SUPER GT Round4",
  nameE: "2026 AUTOBACS SUPER GT Round4",
  startDate: "2026/07/18",
  endDate: "2026/07/19",
};

export const mockCategory: Category = {
  id: "1:1",
  nameJ: "SUPER GT",
  nameE: "SUPER GT",
  courseName: "Okayama International Circuit",
  courseLength: 370300,
};

export const mockRound: Round = {
  id: "1:1:1",
  nameJ: "公式練習",
  nameE: "Free Practice",
  type: "T",
};

export const mockSession: Session = {
  id: "1:1:1:0:1",
  nameJ: "公式練習 1回目",
  nameE: "Free Practice 1",
  time: "1:30",
  lap: 0,
};

export const mockClasses: CarClass[] = [
  { id: "1:1:1", nameJ: "GT500", nameE: "GT500", record: "1'17.000", color: "#dc2626" },
  { id: "1:1:2", nameJ: "GT300", nameE: "GT300", record: "1'24.000", color: "#2563eb" },
];

const gt500Teams: Team[] = [
  {
    id: "1:1:1", classId: "1:1:1", no: 1, nameJ: "MARELLI IMPUL Z", nameE: "MARELLI IMPUL Z",
    engine: "VR38DETT", machine: "Nissan Z GT500", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "MARELLI IMPUL", nameE: "MARELLI IMPUL", nation: "Japan" },
      { no: 1, nameJ: "平手 晃平", nameE: "Kohei Hirate", nation: "Japan" },
      { no: 2, nameJ: "ベルトラン・バゲット", nameE: "Bertrand Baguette", nation: "Belgium" },
    ],
  },
  {
    id: "1:1:2", classId: "1:1:1", no: 3, nameJ: "CRAFTSPORTS MOTUL Z", nameE: "CRAFTSPORTS MOTUL Z",
    engine: "VR38DETT", machine: "Nissan Z GT500", tire: "MI", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "NDDP RACING", nameE: "NDDP RACING", nation: "Japan" },
      { no: 1, nameJ: "千代 勝正", nameE: "Katsumasa Chiyo", nation: "Japan" },
      { no: 2, nameJ: "高星 明誠", nameE: "Mitsunori Takaboshi", nation: "Japan" },
    ],
  },
  {
    id: "1:1:3", classId: "1:1:1", no: 8, nameJ: "ARTA MUGEN NSX-GT", nameE: "ARTA MUGEN NSX-GT",
    engine: "HR-420E", machine: "Honda NSX-GT", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "ARTA", nameE: "ARTA", nation: "Japan" },
      { no: 1, nameJ: "野尻 智紀", nameE: "Tomoki Nojiri", nation: "Japan" },
      { no: 2, nameJ: "大湯 都史樹", nameE: "Toshiki Oyu", nation: "Japan" },
    ],
  },
  {
    id: "1:1:4", classId: "1:1:1", no: 12, nameJ: "CALSONIC IMPUL Z", nameE: "CALSONIC IMPUL Z",
    engine: "VR38DETT", machine: "Nissan Z GT500", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "TEAM IMPUL", nameE: "TEAM IMPUL", nation: "Japan" },
      { no: 1, nameJ: "佐々木 大樹", nameE: "Daiki Sasaki", nation: "Japan" },
      { no: 2, nameJ: "平峰 一貴", nameE: "Kazuki Hiramine", nation: "Japan" },
    ],
  },
  {
    id: "1:1:5", classId: "1:1:1", no: 14, nameJ: "ENEOS X PRIME GR Supra", nameE: "ENEOS X PRIME GR Supra",
    engine: "RI4AG", machine: "Toyota GR Supra", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "ROOKIE Racing", nameE: "ROOKIE Racing", nation: "Japan" },
      { no: 1, nameJ: "大嶋 和也", nameE: "Kazuya Oshima", nation: "Japan" },
      { no: 2, nameJ: "坪井 翔", nameE: "Sho Tsuboi", nation: "Japan" },
    ],
  },
  {
    id: "1:1:6", classId: "1:1:1", no: 17, nameJ: "Astemo NSX-GT", nameE: "Astemo NSX-GT",
    engine: "HR-420E", machine: "Honda NSX-GT", tire: "DL", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "Astemo REAL RACING", nameE: "Astemo REAL RACING", nation: "Japan" },
      { no: 1, nameJ: "塚越 広大", nameE: "Koudai Tsukakoshi", nation: "Japan" },
      { no: 2, nameJ: "松下 信治", nameE: "Nobuharu Matsushita", nation: "Japan" },
    ],
  },
  {
    id: "1:1:7", classId: "1:1:1", no: 23, nameJ: "MOTUL AUTECH Z", nameE: "MOTUL AUTECH Z",
    engine: "VR38DETT", machine: "Nissan Z GT500", tire: "MI", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "NISMO", nameE: "NISMO", nation: "Japan" },
      { no: 1, nameJ: "松田 次生", nameE: "Tsugio Matsuda", nation: "Japan" },
      { no: 2, nameJ: "ロニー・クインタレッリ", nameE: "Ronnie Quintarelli", nation: "Italy" },
    ],
  },
  {
    id: "1:1:8", classId: "1:1:1", no: 36, nameJ: "au TOM'S GR Supra", nameE: "au TOM'S GR Supra",
    engine: "RI4AG", machine: "Toyota GR Supra", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "TOM'S", nameE: "TOM'S", nation: "Japan" },
      { no: 1, nameJ: "関口 雄飛", nameE: "Yuhi Sekiguchi", nation: "Japan" },
      { no: 2, nameJ: "宮田 莉朋", nameE: "Ritomo Miyata", nation: "Japan" },
    ],
  },
  {
    id: "1:1:9", classId: "1:1:1", no: 37, nameJ: "Deloitte TOM'S GR Supra", nameE: "Deloitte TOM'S GR Supra",
    engine: "RI4AG", machine: "Toyota GR Supra", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "TOM'S", nameE: "TOM'S", nation: "Japan" },
      { no: 1, nameJ: "笹原 右京", nameE: "Ukyo Sasahara", nation: "Japan" },
      { no: 2, nameJ: "ジュリアーノ・アレジ", nameE: "Giuliano Alesi", nation: "France" },
    ],
  },
  {
    id: "1:1:10", classId: "1:1:1", no: 39, nameJ: "DENSO KOBELCO GR Supra", nameE: "DENSO KOBELCO GR Supra",
    engine: "RI4AG", machine: "Toyota GR Supra", tire: "BS", nation: "Japan",
    drivers: [
      { no: 0, nameJ: "SARD", nameE: "SARD", nation: "Japan" },
      { no: 1, nameJ: "中山 雄一", nameE: "Yuichi Nakayama", nation: "Japan" },
      { no: 2, nameJ: "石浦 宏明", nameE: "Hiroaki Ishiura", nation: "Japan" },
    ],
  },
];

const gt300Teams: Team[] = [
  {
    id: "1:1:11", classId: "1:1:2", no: 2, nameJ: "muta Racing GR86 GT", nameE: "muta Racing GR86 GT",
    engine: "FA24", machine: "Toyota GR86", tire: "DL", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "堤 優威", nameE: "Yui Tsutsumi", nation: "Japan" },
      { no: 2, nameJ: "平良 響", nameE: "Hibiki Taira", nation: "Japan" },
    ],
  },
  {
    id: "1:1:12", classId: "1:1:2", no: 4, nameJ: "グッドスマイル 初音ミク AMG", nameE: "GOODSMILE HATSUNE MIKU AMG",
    engine: "M159", machine: "Mercedes-AMG GT3", tire: "YH", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "谷口 信輝", nameE: "Nobuteru Taniguchi", nation: "Japan" },
      { no: 2, nameJ: "片岡 龍也", nameE: "Tatsuya Kataoka", nation: "Japan" },
    ],
  },
  {
    id: "1:1:13", classId: "1:1:2", no: 11, nameJ: "GAINER TANAX Z", nameE: "GAINER TANAX Z",
    engine: "VR30DDTT", machine: "Nissan Z GT3", tire: "DL", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "安田 裕信", nameE: "Hironobu Yasuda", nation: "Japan" },
      { no: 2, nameJ: "石川 京侍", nameE: "Keishi Ishikawa", nation: "Japan" },
    ],
  },
  {
    id: "1:1:14", classId: "1:1:2", no: 18, nameJ: "UPGARAGE NSX GT3", nameE: "UPGARAGE NSX GT3",
    engine: "HR35TT", machine: "Honda NSX GT3", tire: "BS", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "小林 崇志", nameE: "Takashi Kobayashi", nation: "Japan" },
      { no: 2, nameJ: "太田 格之進", nameE: "Kakunoshin Ota", nation: "Japan" },
    ],
  },
  {
    id: "1:1:15", classId: "1:1:2", no: 31, nameJ: "apr GR86 GT", nameE: "apr GR86 GT",
    engine: "FA24", machine: "Toyota GR86", tire: "BS", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "小高 一斗", nameE: "Itto Kodaka", nation: "Japan" },
      { no: 2, nameJ: "河野 駿佑", nameE: "Shunsuke Kohno", nation: "Japan" },
    ],
  },
  {
    id: "1:1:16", classId: "1:1:2", no: 52, nameJ: "埼玉トヨペット GB GR Supra", nameE: "SAITAMA TOYOPET GB GR SUPRA",
    engine: "2JZ", machine: "Toyota GR Supra GT300", tire: "BS", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "吉田 広樹", nameE: "Hiroki Yoshida", nation: "Japan" },
      { no: 2, nameJ: "川合 孝汰", nameE: "Kota Kawai", nation: "Japan" },
    ],
  },
  {
    id: "1:1:17", classId: "1:1:2", no: 56, nameJ: "KONDO RACING Z", nameE: "KONDO RACING Z",
    engine: "VR30DDTT", machine: "Nissan Z GT3", tire: "MI", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "名取 鉄平", nameE: "Teppei Natori", nation: "Japan" },
      { no: 2, nameJ: "佐藤 蓮", nameE: "Ren Sato", nation: "Japan" },
    ],
  },
  {
    id: "1:1:18", classId: "1:1:2", no: 60, nameJ: "SYNTIUM LMcorsa Z", nameE: "SYNTIUM LMcorsa Z",
    engine: "VR30DDTT", machine: "Nissan Z GT3", tire: "DL", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "吉本 大樹", nameE: "Hiroki Yoshimoto", nation: "Japan" },
      { no: 2, nameJ: "河野 洋志", nameE: "Hiroshi Kouno", nation: "Japan" },
    ],
  },
  {
    id: "1:1:19", classId: "1:1:2", no: 65, nameJ: "LEON PYRAMID AMG", nameE: "LEON PYRAMID AMG",
    engine: "M159", machine: "Mercedes-AMG GT3", tire: "BS", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "蒲生 尚弥", nameE: "Naoya Gamo", nation: "Japan" },
      { no: 2, nameJ: "篠原 拓朗", nameE: "Takuro Shinohara", nation: "Japan" },
    ],
  },
  {
    id: "1:1:20", classId: "1:1:2", no: 88, nameJ: "JLOC Lamborghini GT3", nameE: "JLOC Lamborghini GT3",
    engine: "V10", machine: "Lamborghini Huracan GT3", tire: "YH", nation: "Japan",
    drivers: [
      { no: 1, nameJ: "小暮 卓史", nameE: "Takuya Kogure", nation: "Japan" },
      { no: 2, nameJ: "元嶋 佑弥", nameE: "Yuya Motojima", nation: "Japan" },
    ],
  },
];

export const mockTeams: Team[] = [...gt500Teams, ...gt300Teams];

function randomSectorTime(base: number, variance: number): SectorTime {
  const time = base + Math.floor(seededRandom() * variance) - Math.floor(variance / 2);
  const rand = seededRandom();
  let type: TimeType = "current";
  if (rand < 0.05) type = "overall_best";
  else if (rand < 0.2) type = "personal_best";
  return { time, type };
}

function generateStandings(teams: Team[], classes: CarClass[]): Standing[] {
  const standings: Standing[] = [];
  const sortedTeams = [...teams].sort(() => seededRandom() - 0.5);

  const classPositions: Record<string, number> = {};
  const leaderTime = 8000000 + Math.floor(seededRandom() * 500000);

  sortedTeams.forEach((team, idx) => {
    const classId = team.classId;
    if (!classPositions[classId]) classPositions[classId] = 0;
    classPositions[classId]++;

    const isGT500 = classId === "1:1:1";
    const baseLap = isGT500 ? 780000 : 850000;
    const bestTime = baseLap + Math.floor(seededRandom() * 30000);
    const lastLapTime = baseLap + Math.floor(seededRandom() * 50000);

    const lapCount = Math.max(1, 15 - Math.floor(idx * 0.3) - Math.floor(seededRandom() * 2));

    const statusRand = seededRandom();
    let status: CarStatus = "on_track";
    if (statusRand < 0.15) status = "in_pit";
    else if (statusRand < 0.2) status = "pit_out";
    else if (statusRand < 0.22) status = "stopped";

    const gapTime = idx === 0 ? 0 : (Math.floor(seededRandom() * 50000) + idx * 5000);

    const sectorBase = isGT500 ? 260000 : 283000;
    const sectors: SectorTime[] = [
      randomSectorTime(sectorBase, 10000),
      randomSectorTime(sectorBase, 12000),
      randomSectorTime(sectorBase, 8000),
    ];

    standings.push({
      position: idx + 1,
      classPosition: classPositions[classId],
      classId,
      teamId: team.id,
      driverNo: 1,
      lap: lapCount,
      bestTime,
      bestTimeLap: Math.floor(seededRandom() * lapCount) + 1,
      lastLapTime,
      lastPassingTime: leaderTime + gapTime,
      sectorNo: Math.floor(seededRandom() * 3) + 1,
      sectorTime: sectors[0].time,
      order: idx + 1,
      gap: idx === 0 ? "LEADER" : `+${(gapTime / 10000).toFixed(3)}`,
      interval: idx === 0 ? "" : `+${((Math.floor(seededRandom() * 20000) + 1000) / 10000).toFixed(3)}`,
      status,
      sectors,
      bestTimeType: seededRandom() < 0.1 ? "overall_best" : seededRandom() < 0.3 ? "personal_best" : "current",
      lastLapTimeType: seededRandom() < 0.08 ? "overall_best" : seededRandom() < 0.25 ? "personal_best" : "current",
      pits: Math.floor(seededRandom() * 3),
      positionChange: Math.floor(seededRandom() * 5) - 2,
    });
  });

  return standings;
}

export const mockStandings: Standing[] = generateStandings(mockTeams, mockClasses);

export const mockSessionInfo: SessionInfo = {
  competition: mockCompetition,
  category: mockCategory,
  round: mockRound,
  session: mockSession,
  flag: "green",
  remainingTime: 5400,
  elapsedTime: 0,
  localTime: "10:30:00",
};

export const mockFastestLap: FastestLap = {
  teamNo: 36,
  driverName: "R. Miyata",
  lapTime: 778500,
  lap: 8,
  sectors: [258200, 261300, 259000],
};

export const mockWeather: WeatherData = {
  airTemp: 28,
  trackTemp: 42,
  humidity: 55,
  windSpeed: 3.2,
  pressure: 1013,
};

export function getMockTrackCount(standings: Standing[]): TrackCount {
  return {
    onTrack: standings.filter((s) => s.status === "on_track" || s.status === "pit_out").length,
    inPit: standings.filter((s) => s.status === "in_pit").length,
    stopped: standings.filter((s) => s.status === "stopped").length,
    retired: standings.filter((s) => s.status === "retired").length,
  };
}

export const mockSchedule: ScheduleEntry[] = [
  { event: "2026 AUTOBACS SUPER GT Round4", session: "Free Practice 1", localTime: "2026/07/18 09:00", hasResults: true },
  { event: "2026 AUTOBACS SUPER GT Round4", session: "Free Practice 2", localTime: "2026/07/18 13:30", hasResults: true },
  { event: "2026 AUTOBACS SUPER GT Round4", session: "Qualifying", localTime: "2026/07/18 15:00", hasResults: true },
  { event: "2026 AUTOBACS SUPER GT Round4", session: "Race", localTime: "2026/07/19 14:00", hasResults: false },
];

export function getTeamByStanding(standing: Standing): Team | undefined {
  return mockTeams.find((t) => t.id === standing.teamId);
}

export function getClassByStanding(standing: Standing): CarClass | undefined {
  return mockClasses.find((c) => c.id === standing.classId);
}
