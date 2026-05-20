using System.Net;
using System.Windows;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
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
    private string? _loadedLogFilePath;

    [ObservableProperty]
    private int _loadedEntryCount;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ClearLoadedLogCommand))]
    private bool _hasLoadedLog;

    [ObservableProperty]
    private int _connectedClientCount;

    [ObservableProperty]
    private long _totalSent;

    [ObservableProperty]
    private int _currentReplayIndex;

    [ObservableProperty]
    private int _replayTotalCount;

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

    /// <summary>再生速度倍率。<c>double.PositiveInfinity</c> で待機なし。</summary>
    [ObservableProperty]
    private double _playbackSpeed = 1.0;

    [ObservableProperty]
    private bool _loopPlayback;

    /// <summary>UI 用の速度プリセット一覧。</summary>
    public IReadOnlyList<PlaybackSpeedOption> SpeedOptions { get; } =
    [
        new("0.5x (低速)", 0.5),
        new("1x (実時間)", 1.0),
        new("2x", 2.0),
        new("5x", 5.0),
        new("10x", 10.0),
        new("Max (待機なし)", double.PositiveInfinity),
    ];

    [ObservableProperty]
    private PlaybackSpeedOption _selectedSpeedOption;

    public MainViewModel()
    {
        _selectedSpeedOption = SpeedOptions[1]; // 1x
        _playbackSpeed = _selectedSpeedOption.Multiplier;
    }

    partial void OnSelectedSpeedOptionChanged(PlaybackSpeedOption value)
    {
        PlaybackSpeed = value.Multiplier;
    }

    private bool CanStartServer() => !IsServerRunning;
    private bool CanStopServer() => IsServerRunning;
    private bool CanPlay() => IsServerRunning && !IsPlaying;
    private bool CanStopPlayback() => IsServerRunning && IsPlaying;
    private bool CanClearLoadedLog() => HasLoadedLog && !IsPlaying;

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
            _service.ProgressUpdated += OnProgressUpdated;
            _service.Start();

            // ロード済ログがあれば再度サービスにセット (StartServer は新規 service を作るため)
            if (HasLoadedLog && !string.IsNullOrEmpty(LoadedLogFilePath))
            {
                _ = ReloadLogIntoServiceAsync(LoadedLogFilePath);
            }

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

    private async Task ReloadLogIntoServiceAsync(string path)
    {
        if (_service is null) return;
        try
        {
            await _service.LoadLogFileAsync(path).ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"ログの再ロードに失敗: {ex.Message}", "MOLA_Timing-VirtualServer",
                MessageBoxButton.OK, MessageBoxImage.Warning);
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
            PlaybackStatusText = HasLoadedLog
                ? $"再生中 (SEIKO ログ × {PlaybackSpeed:0.##}x)"
                : $"再生中 (組み込みサンプル × {PlaybackSpeed:0.##}x)";
            PlaybackStatusBrush = BrushPlaying;
            await _service.StartPlaybackAsync(PlaybackSpeed, LoopPlayback)
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

    [RelayCommand]
    private async Task OpenLogFileAsync()
    {
        var dialog = new OpenFileDialog
        {
            Title = "SEIKO 互換ログを開く",
            Filter = "SEIKO log (*.log)|*.log|All files (*.*)|*.*",
            CheckFileExists = true,
        };

        if (dialog.ShowDialog() != true) return;

        string path = dialog.FileName;
        try
        {
            if (_service is null)
            {
                // サーバー未起動でも先にロードしておく → StartServer 後に再注入
                int countBefore = await Task.Run(() => Replay.SeikoLogReader.ReadAll(path).Count).ConfigureAwait(true);
                LoadedLogFilePath = path;
                LoadedLogFile = System.IO.Path.GetFileName(path);
                LoadedEntryCount = countBefore;
                HasLoadedLog = true;
                ReplayTotalCount = countBefore;
                CurrentReplayIndex = 0;
                MessageBox.Show(
                    $"{LoadedEntryCount:#,##0} 件のメッセージをロードしました。\n\n「サーバー起動」→「▶ 再生」で配信開始します。",
                    "MOLA_Timing-VirtualServer", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            int count = await _service.LoadLogFileAsync(path).ConfigureAwait(true);
            LoadedLogFilePath = path;
            LoadedLogFile = System.IO.Path.GetFileName(path);
            LoadedEntryCount = count;
            HasLoadedLog = true;
            ReplayTotalCount = count;
            CurrentReplayIndex = 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"ログを読み込めませんでした: {ex.Message}", "MOLA_Timing-VirtualServer",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand(CanExecute = nameof(CanClearLoadedLog))]
    private void ClearLoadedLog()
    {
        _service?.ClearLoadedLog();
        LoadedLogFilePath = null;
        LoadedLogFile = "（組み込みサンプル）";
        LoadedEntryCount = 0;
        HasLoadedLog = false;
        CurrentReplayIndex = 0;
        ReplayTotalCount = 0;
    }

    [RelayCommand]
    private void ShowComingSoon(string? featureName)
    {
        string name = string.IsNullOrEmpty(featureName) ? "この機能" : featureName;
        MessageBox.Show(
            $"{name} は今後のリリースで対応予定です。",
            "MOLA_Timing-VirtualServer",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    [RelayCommand]
    private void ShowAbout()
    {
        MessageBox.Show(
            "MOLA_Timing-VirtualServer\n" +
            "Version 0.1.0\n\n" +
            "SEIKO 互換 SMIS ログ (seiko_YYYYMMDD.log) を TCP プロトコルで再配信する開発用アプリ。\n\n" +
            "Copyright (c) 2026 RFX Timing",
            "バージョン情報",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    [RelayCommand]
    private void ExitApp()
    {
        Application.Current?.Shutdown();
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
            string preview = xml.Length > 80 ? xml[..80] + "…" : xml;
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

    private void OnProgressUpdated(object? sender, ReplayProgress progress)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            CurrentReplayIndex = progress.CurrentIndex;
            ReplayTotalCount = progress.TotalCount;
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

/// <summary>速度プリセット (UI 用)。</summary>
public sealed record PlaybackSpeedOption(string Label, double Multiplier);
