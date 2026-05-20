namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.6 クラス（仕様書での要素名は <c>Class</c>）
/// <code>&lt;Class ID="1:1:1" NameJ="GT-500" NameE="GT-500" Record="1'44.319" /&gt;</code>
/// </summary>
/// <remarks>
/// C# の <c>class</c> 予約語との混同を避けるため、型名は <c>CarClass</c> とする。
/// XML 要素名 <c>Class</c> はパーサーで解決する。
/// </remarks>
public sealed record CarClass(
    string Id,
    string NameJ,
    string NameE,
    string Record) : SmisMessage;
