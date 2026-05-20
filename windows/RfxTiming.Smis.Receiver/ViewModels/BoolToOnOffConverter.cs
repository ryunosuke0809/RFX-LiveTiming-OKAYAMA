using System.Globalization;
using System.Windows.Data;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// <c>bool</c> を「ON / OFF」テキストへ変換する。
/// 設定の有効/無効を UI に簡潔に表示するために使う。
/// </summary>
public sealed class BoolToOnOffConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b && b ? "ON" : "OFF";

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is string s && string.Equals(s, "ON", StringComparison.OrdinalIgnoreCase);
}
