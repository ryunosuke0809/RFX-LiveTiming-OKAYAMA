namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.7 ドライバー（<see cref="Team"/> の子要素）
/// <code>&lt;Driver No="1" NameJ="..." NameE="..." Nation="Japan" /&gt;</code>
/// </summary>
public sealed record Driver(
    int No,
    string NameJ,
    string NameE,
    string Nation);
