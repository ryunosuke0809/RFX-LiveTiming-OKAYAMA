namespace RfxTiming.Smis.Messages;

/// <summary>SMIS 2.2.1 計測ポイントの設置区分。</summary>
public enum LoopInstallationType
{
    /// <summary>不明。</summary>
    Unknown = 0,
    /// <summary>C : コース上。</summary>
    Course,
    /// <summary>P : ピット (ピットイン、ピットアウトなど)。</summary>
    Pit,
}

/// <summary>
/// SMIS 2.2.1 計測ポイント
/// <code>&lt;Loop ID="0" Type="C" Order="5" Length="580700" /&gt;</code>
/// </summary>
/// <remarks>
/// ID の意味:
/// <list type="bullet">
///   <item>0 : コントロールライン</item>
///   <item>1-3 : セクター 1-3</item>
///   <item>8-9 : スピード 1-2</item>
///   <item>10 : ピットアウト</item>
///   <item>11 : ピットイン</item>
///   <item>20 : コントロールライン ピット</item>
/// </list>
/// </remarks>
public sealed record Loop(
    int Id,
    LoopInstallationType Type,
    int Order,
    int LengthCm) : SmisMessage;
