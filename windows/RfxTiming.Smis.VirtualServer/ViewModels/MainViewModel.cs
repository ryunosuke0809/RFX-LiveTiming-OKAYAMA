using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;

namespace RfxTiming.Smis.VirtualServer.ViewModels;

public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private string _playbackStatusText = "停止中";

    [ObservableProperty]
    private Brush _playbackStatusBrush = new SolidColorBrush(Color.FromRgb(0x9B, 0xA1, 0xA6));

    [ObservableProperty]
    private string _loadedLogFile = "（未読み込み）";

    [ObservableProperty]
    private int _connectedClientCount;
}
