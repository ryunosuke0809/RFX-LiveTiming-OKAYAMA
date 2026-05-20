namespace RfxTiming.Smis.Messages;

/// <summary>SMIS 2.4.1 メッセージ区分。</summary>
public enum RaceControlMessageType
{
    /// <summary>不明。</summary>
    Unknown = 0,
    /// <summary>I : インフォメーション。</summary>
    Information,
    /// <summary>P : ペナルティ。</summary>
    Penalty,
    /// <summary>T : トラック。</summary>
    Track,
}

/// <summary>SMIS 2.4.1 メッセージ対象範囲。</summary>
public enum RaceControlMessageScope
{
    /// <summary>不明。</summary>
    Unknown = 0,
    /// <summary>E : 参加者及びレース関係者。</summary>
    Entrants,
    /// <summary>A : 全て。</summary>
    All,
}

/// <summary>
/// SMIS 2.4.1 メッセージ（XML 要素名は <c>Message</c>）
/// <code>&lt;Message Type="T" Scope="A" Text="赤旗" /&gt;</code>
/// </summary>
/// <remarks>
/// 外部の管制システムから受信した情報を扱う。現状は暫定仕様（仕様書 16/16 ページ参照）。
/// C# の型名は基底型 <see cref="SmisMessage"/> との混同を避けるため <c>RaceControlMessage</c> とする。
/// </remarks>
public sealed record RaceControlMessage(
    RaceControlMessageType Type,
    RaceControlMessageScope Scope,
    string Text) : SmisMessage;
