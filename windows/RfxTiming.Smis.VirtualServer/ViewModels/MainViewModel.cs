using System.Net;
using System.Windows;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.VirtualServer.Services;

namespace RfxTiming.Smis.VirtualServer.ViewModels;

public partial class MainViewModel : ObservableObject, IAsyncDisposable
{
    private const int DefaultPort = 50000;

    private static readonly SolidColorBrush BrushStopped = new(Color.FromRgb(0x9B, 0xA1, 0xA6));
    private static readonly SolidColorBrush BrushPlaying = new(Color.FromRgb(0x3F, 0xB9, 0x50));
    private static readonly SolidColorBrush BrushListening = new(Color.FromRgb(0xD2, 0x99, 0x22));

    private VirtualServerService? _service;

    [ObservableProperty]
    private string _playbackStatusText = "停止中";

    [ObservableProperty]
    private Brush _playbackStatusBrush = BrushStopped;

    [ObservableProperty]
    private string _loadedLogFile = "（組み込みサンプル）";

    [ObservableProperty]
    private int _connectedClientCount;

    [ObservableProperty]
    private long _totalSent;

    [ObservableProperty]
    private string _lastSentInfo = "未送信";

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(StartServerCommand))]
    [NotifyCanExecuteChangedFor(nameof(StopServerCommand))]
    [NotifyCanExecuteChangedFor(nameof(PlayCommand))]
    [NotifyCanExecuteChangedFor(nameof(StopPlaybackCommand))]
    private bool _isServerRunning;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(PlayCommand))]
    [NotifyCanExecuteChangedFor(nameof(StopPlaybackCommand))]
    private bool _isPlaying;

    [ObservableProperty]
    private int _listenPort = DefaultPort;

    [ObservableProperty]
    private double _playbackIntervalMs = 1000;

    private bool CanStartServer() => !IsServerRunning;
    private bool CanStopServer() => IsServerRunning;
    private bool CanPlay() => IsServerRunning && !IsPlaying;
    private bool CanStopPlayback() => IsServerRunning && IsPlaying;

    [RelayCommand(CanExecute = nameof(CanStartServer))]
    private void StartServer()
    {
        try
        {
            var options = new SmisTcpServerOptions(
                ListenAddress: IPAddress.Any,
                Port: ListenPort,
                AllowMultipleClients: true);

            _service = new VirtualServerService(options);
            _service.ClientConnected += OnClientChanged;
            _service.ClientDisconnected += OnClientChanged;
            _service.FrameSent += OnFrameSent;
            _service.ErrorOccurred += OnErrorOccurred;
            _service.PlaybackCompleted += OnPlaybackCompleted;
            _service.Start();

            IsServerRunning = true;
            PlaybackStatusText = $"待機中 (ポート {ListenPort})";
            PlaybackStatusBrush = BrushListening;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"サーバー起動エラー: {ex.Message}", "MOLA_Timing-VirtualServer",
                MessageBoxButton.OK, MessageBoxImage.Error);
            _service = null;
        }
    }

    [RelayCommand(CanExecute = nameof(CanStopServer))]
    private async Task StopServerAsync()
    {
        if (_service is null) return;
        try
        {
            await _service.DisposeAsync().ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"サーバー停止エラー: {ex.Message}", "MOLA_Timing-VirtualServer",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _service = null;
            IsServerRunning = false;
            IsPlaying = false;
            ConnectedClientCount = 0;
            PlaybackStatusText = "停止中";
            PlaybackStatusBrush = BrushStopped;
        }
    }

    [RelayCommand(CanExecute = nameof(CanPlay))]
    private async Task PlayAsync()
    {
        if (_service is null) return;
        try
        {
            IsPlaying = true;
            PlaybackStatusText = "再生中…";
            PlaybackStatusBrush = BrushPlaying;
            await _service.StartPlaybackAsync(TimeSpan.FromMilliseconds(PlaybackIntervalMs))
                .ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"再生開始エラー: {ex.Message}", "MOLA_Timing-VirtualServer",
                MessageBoxButton.OK, MessageBoxImage.Error);
            IsPlaying = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanStopPlayback))]
    private async Task StopPlaybackAsync()
    {
        if (_service is null) return;
        try
        {
            await _service.StopPlaybackAsync().ConfigureAwait(true);
        }
        catch
        {
            // 無視
        }
        finally
        {
            IsPlaying = false;
            PlaybackStatusText = IsServerRunning ? $"待機中 (ポート {ListenPort})" : "停止中";
            PlaybackStatusBrush = IsServerRunning ? BrushListening : BrushStopped;
        }
    }

    private void OnClientChanged(object? sender, EndPoint _)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            if (_service is not null)
            {
                ConnectedClientCount = _service.ClientCount;
            }
        });
    }

    private void OnFrameSent(object? sender, string xml)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            if (_service is not null)
            {
                TotalSent = _service.TotalSent;
            }
            string preview = xml.Length > 60 ? xml[..60] + "…" : xml;
            LastSentInfo = preview;
        });
    }

    private void OnErrorOccurred(object? sender, Exception ex)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            LastSentInfo = $"エラー: {ex.Message}";
        });
    }

    private void OnPlaybackCompleted(object? sender, EventArgs e)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            IsPlaying = false;
            PlaybackStatusText = $"再生完了 (待機中 ポート {ListenPort})";
            PlaybackStatusBrush = BrushListening;
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_service is not null)
        {
            await _service.DisposeAsync().ConfigureAwait(false);
        }
    }
}
