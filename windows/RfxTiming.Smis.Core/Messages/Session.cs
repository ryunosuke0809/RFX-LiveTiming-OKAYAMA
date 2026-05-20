namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.5 セッション
/// <code>&lt;Session ID="1:1:3:0:1" NameJ="1 回目" NameE="1" Time="0:20" Lap="" /&gt;</code>
/// </summary>
/// <remarks>
/// <para><see cref="Time"/> は <c>HH:MM</c> 形式の最大レース時間。空文字の場合あり。</para>
/// <para><see cref="Lap"/> は最大レース周回数。空文字の場合あり (タイムレース時)。</para>
/// </remarks>
public sealed record Session(
    string Id,
    string NameJ,
    string NameE,
    string Time,
    string Lap) : SmisMessage;
