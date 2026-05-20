using System.Globalization;

namespace RfxTiming.Smis.Xml;

/// <summary>
/// SMIS 仕様の時刻・タイム表記を扱うユーティリティ。
/// </summary>
public static class SmisTimeFormat
{
    /// <summary>
    /// <see cref="RfxTiming.Smis.Messages.Start.DateTime"/> の書式 (<c>yyyy/MM/dd HH:mm.ss</c>)。
    /// 秒の前のセパレータは <c>:</c> ではなく <c>.</c> である点に注意（仕様書原文ママ）。
    /// </summary>
    public const string StartDateTimeFormat = "yyyy/MM/dd HH:mm.ss";

    /// <summary>
    /// <see cref="StartDateTimeFormat"/> で <see cref="DateTime"/> をパースする。失敗時は <c>null</c>。
    /// </summary>
    public static DateTime? TryParseStartDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParseExact(
            value,
            StartDateTimeFormat,
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out DateTime parsed)
                ? parsed
                : null;
    }

    /// <summary>
    /// 1/10000 秒単位の SMIS 時刻を <see cref="TimeSpan"/> に変換する。
    /// </summary>
    public static TimeSpan FromSmisTime(long smisTimeIn10000thSeconds)
    {
        // 1 SMIS tick = 100 microseconds = 1000 .NET ticks (1 .NET tick = 100ns)
        return TimeSpan.FromTicks(smisTimeIn10000thSeconds * 1000L);
    }

    /// <summary>
    /// 1/10000 秒単位の SMIS 時刻を "M:ss.ffff" 表記に変換する (例: 935910 → "1:33.5910")。
    /// </summary>
    public static string FormatSmisLapTime(long smisTimeIn10000thSeconds)
    {
        TimeSpan span = FromSmisTime(smisTimeIn10000thSeconds);
        int totalMinutes = (int)Math.Floor(span.TotalMinutes);
        double remainingSeconds =
            (smisTimeIn10000thSeconds - (totalMinutes * 60L * 10000L)) / 10000.0;
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{totalMinutes}:{remainingSeconds:00.0000}");
    }
}
