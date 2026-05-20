using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// <c>bool</c> を <see cref="Visibility"/> (Visible / Collapsed) に変換する。
/// <see cref="DisplaySettings"/> によるカード表示切替で利用する。
/// </summary>
public sealed class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool b = value is bool v && v;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is Visibility v && v == Visibility.Visible;
}
