namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.1.4 グループ
/// <code>&lt;Group ID="1:2:1:1" NameJ="A 組" NameE="Group A" /&gt;</code>
/// </summary>
public sealed record Group(
    string Id,
    string NameJ,
    string NameE) : SmisMessage;
