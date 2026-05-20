namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.8 トランスポンダー
/// <code>
/// &lt;Transponder TeamID="1:1:1"&gt;
///   &lt;Tag DriverNo="0" No="23451168" /&gt;
///   &lt;Tag DriverNo="1" No="23451169" /&gt;
/// &lt;/Transponder&gt;
/// </code>
/// </summary>
public sealed record Transponder(
    string TeamId,
    IReadOnlyList<Tag> Tags) : SmisMessage;

/// <summary>
/// SMIS 2.1.8 トランスポンダータグ（<see cref="Transponder"/> の子要素）。
/// 場合により同一ドライバー番号に複数トランスポンダーが紐づく。
/// </summary>
public sealed record Tag(
    int DriverNo,
    string No);
