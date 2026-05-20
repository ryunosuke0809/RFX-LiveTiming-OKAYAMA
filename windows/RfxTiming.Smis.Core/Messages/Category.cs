namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.2 カテゴリー
/// <code>&lt;Category ID="1:1" NameJ="SUPER GT" NameE="SUPER GT" CourseName="..." CourseLength="580700" /&gt;</code>
/// </summary>
public sealed record Category(
    string Id,
    string NameJ,
    string NameE,
    string CourseName,
    int CourseLengthCm) : SmisMessage;
