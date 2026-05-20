using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// MainWindow の DataContext。
/// W1 ではスケルトンのプロパティのみ。実通信ロジックは W2 で接続する。
/// </summary>
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private string _connectionStatusText = "未接続";

    [ObservableProperty]
    private Brush _connectionStatusBrush = new SolidColorBrush(Color.FromRgb(0xF8, 0x51, 0x49));

    [ObservableProperty]
    private string _currentOutputFile = "（未設定）";

    [ObservableProperty]
    private long _totalMessageCount;
}
