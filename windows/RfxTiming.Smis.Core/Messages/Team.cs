namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.7 チーム
/// <code>
/// &lt;Team ID="1:1:1" ClassID="1:1" No="64" NameJ="..." NameE="..." Engine="..." Machine="..." Tire="DL" Nation="Japan"&gt;
///   &lt;Driver No="0" .../&gt;
///   &lt;Driver No="1" .../&gt;
/// &lt;/Team&gt;
/// </code>
/// <para>
/// 車番 <see cref="No"/> は XML 属性の文字列をそのまま保持する。
/// <c>001</c> / <c>10A</c> / <c>10B</c> のように先頭ゼロやアルファベットが来る。
/// </para>
/// </summary>
public sealed record Team(
    string Id,
    string ClassId,
    string No,
    string NameJ,
    string NameE,
    string Engine,
    string Machine,
    string Tire,
    string Nation,
    IReadOnlyList<Driver> Drivers) : SmisMessage;
