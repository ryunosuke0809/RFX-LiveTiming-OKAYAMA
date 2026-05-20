namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.3.4 順位
/// <code>
/// &lt;Standings SessionID="1:1:3:0:1"&gt;
///   &lt;Standing Position="1" ... /&gt;
///   &lt;Standing Position="2" ... /&gt;
/// &lt;/Standings&gt;
/// </code>
/// </summary>
public sealed record Standings(
    string SessionId,
    IReadOnlyList<Standing> Items) : SmisMessage;

/// <summary>
/// SMIS 2.3.4 順位の各エントリー（<see cref="Standings"/> の子要素）。
/// </summary>
/// <param name="Position">総合順位。</param>
/// <param name="ClassPosition">クラス順位。</param>
/// <param name="ClassId">クラス ID。</param>
/// <param name="TeamId">チーム ID。</param>
/// <param name="DriverNo">ドライバー番号。</param>
/// <param name="Lap">周回数。</param>
/// <param name="BestTime">ベストタイム 1/10000 秒単位。</param>
/// <param name="BestTimeLap">ベストタイム周回。</param>
/// <param name="LastLapTime">直近のラップタイム 1/10000 秒単位。</param>
/// <param name="LastPassingTime">直近のコントロールライン上通過タイム 1/10000 秒単位。</param>
/// <param name="SectorNo">区間番号 (1-4)。</param>
/// <param name="SectorTime">前区間からの経過時間 1/10000 秒単位。</param>
/// <param name="Order">表示順 (順位順に 1 から)。</param>
public sealed record Standing(
    int Position,
    int ClassPosition,
    string ClassId,
    string TeamId,
    int DriverNo,
    int Lap,
    long BestTime,
    int BestTimeLap,
    long LastLapTime,
    long LastPassingTime,
    int SectorNo,
    long SectorTime,
    int Order);
