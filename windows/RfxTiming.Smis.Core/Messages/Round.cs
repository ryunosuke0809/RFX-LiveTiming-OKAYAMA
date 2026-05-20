namespace RfxTiming.Smis.Messages;

/// <summary>SMIS 2.1.3 ラウンドのレース区分。</summary>
public enum RoundType
{
    /// <summary>不明 / 未指定。</summary>
    Unknown = 0,
    /// <summary>T : ベストタイムレース。</summary>
    BestTime,
    /// <summary>L : 周回レース。</summary>
    Lap,
}

/// <summary>
/// SMIS 2.1.3 ラウンド
/// <code>&lt;Round ID="1:1:1" NameJ="公式練習" NameE="Practice" Type="T" /&gt;</code>
/// </summary>
public sealed record Round(
    string Id,
    string NameJ,
    string NameE,
    RoundType Type) : SmisMessage;
