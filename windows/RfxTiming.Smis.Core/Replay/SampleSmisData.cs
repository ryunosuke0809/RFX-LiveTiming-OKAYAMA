namespace RfxTiming.Smis.Replay;

/// <summary>
/// 開発・デモ用の組み込み SMIS サンプルデータ。
/// VirtualServer がログファイルなしでもエンドツーエンド通信テストできるよう、
/// 仕様書 (docs/Specification/計測データ仕様書_20200220.pdf) の例を参考に SUPER GT を想定した
/// マスター + 計測ポイント + 計測データ + メッセージのセットを提供する。
/// </summary>
public static class SampleSmisData
{
    /// <summary>
    /// 接続時に流すマスターデータ一式 (Competition → Driver / Tag まで)。
    /// 順序は意味あり: 上位 → 下位の階層で送る。
    /// </summary>
    public static IReadOnlyList<string> Master { get; } =
    [
        """<Competition ID="1" NameJ="2026 AUTOBACS SUPER GT Round1 OKAYAMA" NameE="2026 AUTOBACS SUPER GT Round1 OKAYAMA" StartDate="2026/06/13" EndDate="2026/06/14" />""",
        """<Category ID="1:1" NameJ="SUPER GT" NameE="SUPER GT" CourseName="Okayama International Circuit" CourseLength="370300" />""",
        """<Round ID="1:1:1" NameJ="公式練習" NameE="Practice" Type="T" />""",
        """<Session ID="1:1:1:0:1" NameJ="公式練習" NameE="Practice" Time="1:30" Lap="" />""",
        """<Class ID="1:1:1" NameJ="GT500" NameE="GT500" Record="1'15.123" />""",
        """<Class ID="1:1:2" NameJ="GT300" NameE="GT300" Record="1'24.567" />""",
        """<Team ID="1:1:0001" ClassID="1:1" No="100" NameJ="STANLEY NSX-GT" NameE="STANLEY NSX-GT" Engine="HR-417E" Machine="Honda NSX-GT" Tire="BS" Nation="Japan"><Driver No="1" NameJ="山本 尚貴" NameE="Naoki Yamamoto" Nation="Japan" /><Driver No="2" NameJ="牧野 任祐" NameE="Tadasuke Makino" Nation="Japan" /></Team>""",
        """<Team ID="1:1:0002" ClassID="1:1" No="23" NameJ="MOTUL AUTECH Z" NameE="MOTUL AUTECH Z" Engine="VRH" Machine="Nissan Z GT500" Tire="MI" Nation="Japan"><Driver No="1" NameJ="ロニー・クインタレッリ" NameE="Ronnie Quintarelli" Nation="Italy" /><Driver No="2" NameJ="松田 次生" NameE="Tsugio Matsuda" Nation="Japan" /></Team>""",
        """<Team ID="1:1:0003" ClassID="1:1" No="36" NameJ="au TOM'S GR Supra" NameE="au TOM'S GR Supra" Engine="RI4AG" Machine="Toyota GR Supra" Tire="BS" Nation="Japan"><Driver No="1" NameJ="坪井 翔" NameE="Sho Tsuboi" Nation="Japan" /><Driver No="2" NameJ="山下 健太" NameE="Kenta Yamashita" Nation="Japan" /></Team>""",
        """<Transponder TeamID="1:1:0001"><Tag DriverNo="1" No="10000001" /><Tag DriverNo="2" No="10000002" /></Transponder>""",
        """<Transponder TeamID="1:1:0002"><Tag DriverNo="1" No="20000001" /><Tag DriverNo="2" No="20000002" /></Transponder>""",
        """<Transponder TeamID="1:1:0003"><Tag DriverNo="1" No="30000001" /><Tag DriverNo="2" No="30000002" /></Transponder>""",
    ];

    /// <summary>セッション選択時に流す計測ポイントデータ。</summary>
    public static IReadOnlyList<string> MeasuringPoints { get; } =
    [
        """<Loop ID="1" Type="C" Order="1" Length="120000" />""",
        """<Loop ID="2" Type="C" Order="2" Length="230000" />""",
        """<Loop ID="3" Type="C" Order="3" Length="320000" />""",
        """<Loop ID="0" Type="C" Order="4" Length="370300" />""",
        """<Loop ID="10" Type="P" Order="4" Length="370300" />""",
        """<Loop ID="11" Type="P" Order="4" Length="370300" />""",
    ];

    /// <summary>計測開始 (Select + Start)。</summary>
    public static IReadOnlyList<string> SessionStart { get; } =
    [
        """<Select SessionID="1:1:1:0:1" />""",
        """<Start SessionID="1:1:1:0:1" DateTime="2026/06/13 10:00.00" />""",
    ];

    private const int RunningLapCount = 5;
    private const int FramesPerLap = 5; // Passing×4 + Standings×1
    private const int ExtraTerminationFrames = 1; // チェッカー

    /// <summary><see cref="EnumerateRunningSamples"/> が返すフレーム総数。</summary>
    public static int RunningSampleCount => RunningLapCount * FramesPerLap + ExtraTerminationFrames;

    /// <summary>
    /// 走行中のリアルタイム計測データのループ。Standings と Passing を交互に。
    /// 列挙関数として提供 (再生時に時間を進めながら使う)。
    /// </summary>
    public static IEnumerable<string> EnumerateRunningSamples()
    {
        for (int lap = 1; lap <= RunningLapCount; lap++)
        {
            long baseTime = lap * 750_000L; // 75 秒 = 750000 (1/10000秒)

            yield return $"""<Passing ID="P{lap:D3}1" SessionID="1:1:1:0:1" LoopID="1" Time="{baseTime + 250_000}" Order="0" LastPassingTime="0" TeamID="1:1:0001" DriverNo="1" LapTimeUse="1" Type="N" />""";

            yield return $"""<Passing ID="P{lap:D3}2" SessionID="1:1:1:0:1" LoopID="2" Time="{baseTime + 480_000}" Order="0" LastPassingTime="0" TeamID="1:1:0001" DriverNo="1" LapTimeUse="1" Type="N" />""";

            yield return $"""<Passing ID="P{lap:D3}3" SessionID="1:1:1:0:1" LoopID="3" Time="{baseTime + 620_000}" Order="0" LastPassingTime="0" TeamID="1:1:0001" DriverNo="1" LapTimeUse="1" Type="N" />""";

            yield return $"""<Passing ID="P{lap:D3}0" SessionID="1:1:1:0:1" LoopID="0" Time="{baseTime + 750_000}" Order="0" LastPassingTime="{baseTime + 750_000}" TeamID="1:1:0001" DriverNo="1" LapTimeUse="1" Type="N" />""";

            yield return $"""
                <Standings SessionID="1:1:1:0:1">
                  <Standing Position="1" ClassPosition="1" ClassID="1:1:1" TeamID="1:1:0001" DriverNo="1" Lap="{lap}" BestTime="{750_000 + (lap % 2) * 1000}" BestTimeLap="{lap}" LastLapTime="{750_000 + (lap % 3) * 1500}" LastPassingTime="{baseTime + 750_000}" SectorNo="4" SectorTime="130000" Order="1" />
                  <Standing Position="2" ClassPosition="2" ClassID="1:1:1" TeamID="1:1:0003" DriverNo="1" Lap="{lap}" BestTime="{752_000 + (lap % 2) * 1100}" BestTimeLap="{lap}" LastLapTime="{752_000 + (lap % 3) * 1300}" LastPassingTime="{baseTime + 752_500}" SectorNo="4" SectorTime="131500" Order="2" />
                  <Standing Position="3" ClassPosition="3" ClassID="1:1:1" TeamID="1:1:0002" DriverNo="1" Lap="{lap}" BestTime="{754_500 + (lap % 2) * 900}" BestTimeLap="{lap}" LastLapTime="{754_500 + (lap % 3) * 1200}" LastPassingTime="{baseTime + 754_800}" SectorNo="4" SectorTime="132800" Order="3" />
                </Standings>
                """;
        }

        yield return """<Message Type="T" Scope="A" Text="チェッカードフラッグ" />""";
    }
}
