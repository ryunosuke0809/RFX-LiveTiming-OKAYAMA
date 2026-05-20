namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.1 競技会
/// <code>&lt;Competition ID="1" NameJ="..." NameE="..." StartDate="2018/05/19" EndDate="2018/05/20" /&gt;</code>
/// </summary>
public sealed record Competition(
    string Id,
    string NameJ,
    string NameE,
    string StartDate,
    string EndDate) : SmisMessage;
