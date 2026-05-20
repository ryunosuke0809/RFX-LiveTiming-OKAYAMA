namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.3.2 スタートタイム
/// <code>&lt;Start SessionID="1:1:3:0:1" DateTime="2018/05/19 15:28.22" /&gt;</code>
/// </summary>
/// <remarks>
/// <see cref="DateTime"/> の書式は <c>yyyy/MM/dd HH:mm.ss</c>（秒の前のセパレータは <c>.</c>）。
/// 解析失敗の可能性があるため raw 文字列のままで保持し、利用側で <c>SmisTimeFormat</c> を使ってパースする。
/// </remarks>
public sealed record Start(
    string SessionId,
    string DateTime) : SmisMessage;
