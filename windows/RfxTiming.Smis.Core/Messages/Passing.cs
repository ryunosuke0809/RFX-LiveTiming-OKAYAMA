namespace RfxTiming.Smis.Messages;

/// <summary>SMIS 2.3.3 通過タイムの区分。</summary>
public enum PassingType
{
    /// <summary>不明。</summary>
    Unknown = 0,
    /// <summary>N : 通常。</summary>
    Normal,
    /// <summary>B : バックアップ。</summary>
    Backup,
    /// <summary>M : 手動。</summary>
    Manual,
    /// <summary>C : キャンセル。識別子にて該当データを特定する。</summary>
    Cancel,
    /// <summary>E : 修正。識別子にて該当データを特定する。</summary>
    Edit,
}

/// <summary>
/// SMIS 2.3.3 通過タイム
/// <code>
/// &lt;Passing ID="156" SessionID="1:1:3:0:1" LoopID="6" Time="1013520" Order="0"
///          LastPassingTime="1013520" TeamID="1:1:1" DriverNo="0" Type="B" /&gt;
/// </code>
/// </summary>
/// <remarks>
/// 時刻はすべて 1/10000 秒単位 (例: <c>935910</c> = 1分33秒5910)。
/// </remarks>
public sealed record Passing(
    string Id,
    string SessionId,
    int LoopId,
    long Time,
    int Order,
    long LastPassingTime,
    string TeamId,
    int DriverNo,
    bool LapTimeUse,
    PassingType Type) : SmisMessage;
