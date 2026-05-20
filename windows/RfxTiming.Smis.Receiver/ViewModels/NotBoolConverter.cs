using System.Globalization;
using System.Windows.Data;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// <c>bool</c> を反転するシンプルな <see cref="IValueConverter"/>。
/// 「IsRunning が true のときに編集欄を IsEnabled=false にしたい」等の用途で使う。
/// </summary>
public sealed class NotBoolConverter : IValueConverter
{
    public static readonly NotBoolConverter Instance = new();

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : true;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : false;
}
