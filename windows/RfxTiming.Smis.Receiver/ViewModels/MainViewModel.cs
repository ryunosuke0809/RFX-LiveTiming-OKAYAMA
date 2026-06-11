using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using RfxTiming.Smis.Cloud;
using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Receiver.Views;
using RfxTiming.Smis.Services;
using RfxTiming.Smis.Settings;
using RfxTiming.Smis.Xml;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// MainWindow の DataContext。
/// 現場運用向け Bridge UI に必要な状態とコマンドを束ねる。
/// </summary>
public partial class MainViewModel : ObservableObject, IAsyncDisposable
{
    // ===== Stage indicator colors =====
    private static readonly SolidColorBrush BrushIdle = new(Color.FromRgb(0x6B, 0x72, 0x80));
    private static readonly SolidColorBrush BrushWarming = new(Color.FromRgb(0xD2, 0x99, 0x22));
    private static readonly SolidColorBrush BrushActive = new(Color.FromRgb(0x3F, 0xB9, 0x50));
    private static readonly SolidColorBrush BrushWarning = new(Color.FromRgb(0xE8, 0x8C, 0x30));
    private static readonly SolidColorBrush BrushError = new(Color.FromRgb(0xF8, 0x51, 0x49));
    private static readonly SolidColorBrush BrushDisabled = new(Color.FromRgb(0x3A, 0x3F, 0x4A));

    private readonly DispatcherTimer _uiRefreshTimer;
    private ReceiverService? _service;
    private CloudUploaderService? _cloudUploader;

    public MainViewModel()
    {
        Settings = UserSettings.Load(LogPaths.SettingsFile);
        ApplyConnectionFromSettings();

        _uiRefreshTimer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(500),
        };
        _uiRefreshTimer.Tick += (_, _) => RefreshLiveMetrics();
        _uiRefreshTimer.Start();

        if (Settings.Connection.AutoConnectOnStartup)
        {
            // Window がロードされてから接続を試みる (Dispatcher で遅延実行)
            Application.Current?.Dispatcher.BeginInvoke(
                DispatcherPriority.ApplicationIdle,
                new Action(() => { if (CanConnect()) _ = ConnectAsync(); }));
        }
    }

    /// <summary>現在のユーザー設定 (UI からも双方向に書き戻される)。</summary>
    public UserSettings Settings { get; private set; }

    // ===== High-level lamps (大きな状態ランプ 3 つ) =====
    [ObservableProperty] private string _receiveStatusText = "未稼働";
    [ObservableProperty] private Brush _receiveStatusBrush = BrushIdle;
    [ObservableProperty] private string _parseStatusText = "未稼働";
    [ObservableProperty] private Brush _parseStatusBrush = BrushIdle;
    [ObservableProperty] private string _logStatusText = "未稼働";
    [ObservableProperty] private Brush _logStatusBrush = BrushIdle;

    // ===== Headline ステータス (タイトル下) =====
    [ObservableProperty] private string _headlineStatusText = "待機中";
    [ObservableProperty] private Brush _headlineStatusBrush = BrushIdle;

    // ===== Metrics =====
    [ObservableProperty] private long _totalMessageCount;
    [ObservableProperty] private long _parseErrorCount;
    [ObservableProperty] private long _logWriteErrorCount;
    [ObservableProperty] private double _messagesPerSecond;
    [ObservableProperty] private string _logSizeText = "0 B";
    [ObservableProperty] private string _lastReceivedAtText = "—";
    [ObservableProperty] private string _lastMessageInfo = string.Empty;

    // ===== Output paths =====
    [ObservableProperty] private string _currentRawLogPath = "（未接続）";
    [ObservableProperty] private string _currentParsedLogPath = "（未接続）";
    [ObservableProperty] private long _logRotationCount;
    [ObservableProperty] private string _lastRotationText = string.Empty;

    public string BuildInfoText { get; } =
        $"MOLA_Timing-Receiver v0.1.0 · Parser {SmisXmlParser.ParserProfile}";

    // ===== Run state =====
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ConnectCommand))]
    [NotifyCanExecuteChangedFor(nameof(DisconnectCommand))]
    private bool _isRunning;

    // ===== Connection (settings からミラー) =====
    [ObservableProperty] private string _smisHost = "127.0.0.1";
    [ObservableProperty] private int _smisPort = 50000;
    [ObservableProperty] private bool _autoReconnect = true;
    [ObservableProperty] private string _connectionEndpointText = "127.0.0.1:50000";

    // ===== Cloud uploader =====
    [ObservableProperty] private string _cloudStatusText = "OFF";
    [ObservableProperty] private Brush _cloudStatusBrush = BrushDisabled;
    [ObservableProperty] private string _cloudEndpointText = string.Empty;
    [ObservableProperty] private long _cloudSentCount;
    [ObservableProperty] private long _cloudQueueDepth;
    [ObservableProperty] private long _cloudFailedCount;

    /// <summary>設定変更後に呼び出して UI に同期するためのフック。</summary>
    public void ApplyConnectionFromSettings()
    {
        SmisHost = Settings.Connection.Host;
        SmisPort = Settings.Connection.Port;
        AutoReconnect = Settings.Connection.AutoReconnect;
        ConnectionEndpointText = $"{SmisHost}:{SmisPort}";
        OnPropertyChanged(nameof(Display));
    }

    /// <summary>UI バインディング用のショートカット。</summary>
    public DisplaySettings Display => Settings.Display;

    private bool CanConnect() => !IsRunning;
    private bool CanDisconnect() => IsRunning;

    [RelayCommand(CanExecute = nameof(CanConnect))]
    private async Task ConnectAsync()
    {
        try
        {
            var options = new SmisTcpClientOptions(
                Host: SmisHost,
                Port: SmisPort,
                AutoReconnect: AutoReconnect);

            _service = new ReceiverService(options, Settings.Logging);
            _service.StateChanged += OnStateChanged;
            _service.ErrorOccurred += OnErrorOccurred;
            _service.MessageReceived += OnMessageReceived;
            _service.StageHealthChanged += OnStageHealthChanged;
            _service.LogFileRotated += OnLogFileRotated;

            await _service.StartAsync().ConfigureAwait(true);

            // クラウド配信を有効化していれば、Receiver と同タイミングで起動。
            if (Settings.Cloud.Enabled)
            {
                _cloudUploader = new CloudUploaderService(Settings.Cloud);
                _cloudUploader.StateChanged += OnCloudStateChanged;
                _cloudUploader.ErrorOccurred += OnCloudErrorOccurred;
                CloudEndpointText = Settings.Cloud.IngestUrl;
                await _cloudUploader.StartAsync().ConfigureAwait(true);
            }
            else
            {
                CloudEndpointText = string.Empty;
                CloudStatusText = "OFF";
                CloudStatusBrush = BrushDisabled;
            }

            IsRunning = true;
            CurrentRawLogPath = _service.CurrentRawLogPath ?? "（未確定）";
            CurrentParsedLogPath = _service.CurrentParsedLogPath ?? "（未確定）";
            UpdateHeadline(StageStatus.Warming, $"接続中… {SmisHost}:{SmisPort}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"接続開始エラー: {ex.Message}", "MOLA_Timing-Receiver",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand(CanExecute = nameof(CanDisconnect))]
    private async Task DisconnectAsync()
    {
        if (_service is null) return;

        try
        {
            await _service.DisposeAsync().ConfigureAwait(true);
            if (_cloudUploader is not null)
            {
                await _cloudUploader.DisposeAsync().ConfigureAwait(true);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"切断エラー: {ex.Message}", "MOLA_Timing-Receiver",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _service = null;
            _cloudUploader = null;
            IsRunning = false;
            SetReceiveStageBrush(StageStatus.Idle);
            SetParseStageBrush(StageStatus.Idle);
            SetLogStageBrush(StageStatus.Idle);
            CloudStatusText = "OFF";
            CloudStatusBrush = BrushDisabled;
            UpdateHeadline(StageStatus.Idle, "待機中");
        }
    }

    [RelayCommand]
    private void OpenLogsFolder()
    {
        try
        {
            LogPaths.EnsureDirectoriesExist();
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = LogPaths.LogsRoot,
                UseShellExecute = true,
                Verb = "open",
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"フォルダーを開けませんでした: {ex.Message}", "MOLA_Timing-Receiver",
                MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    [RelayCommand]
    private void OpenSettings()
    {
        var dialog = new SettingsDialog(Settings)
        {
            Owner = Application.Current?.MainWindow,
        };

        if (dialog.ShowDialog() == true)
        {
            try
            {
                Settings = dialog.ResultSettings;
                Settings.Save(LogPaths.SettingsFile);
                ApplyConnectionFromSettings();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"設定の保存に失敗しました: {ex.Message}", "MOLA_Timing-Receiver",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
    }

    [RelayCommand]
    private void ShowAbout()
    {
        MessageBox.Show(
            "MOLA_Timing-Receiver\n" +
            "Version 0.1.0\n\n" +
            "サーキット計時室常駐の SMIS 受信・ロガー・ローカル WS 配信アプリ。\n\n" +
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

    private void OnStateChanged(object? sender, SmisTcpClient.ConnectionState state)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            switch (state)
            {
                case SmisTcpClient.ConnectionState.Connecting:
                    UpdateHeadline(StageStatus.Warming, $"接続中… {SmisHost}:{SmisPort}");
                    break;
                case SmisTcpClient.ConnectionState.Connected:
                    UpdateHeadline(StageStatus.Active, $"配信中 {SmisHost}:{SmisPort}");
                    break;
                case SmisTcpClient.ConnectionState.Reconnecting:
                    UpdateHeadline(StageStatus.Warning, "再接続待機中…");
                    break;
                case SmisTcpClient.ConnectionState.Disconnected:
                    if (IsRunning)
                    {
                        UpdateHeadline(StageStatus.Warning, "切断 (再接続待機)");
                    }
                    else
                    {
                        UpdateHeadline(StageStatus.Idle, "待機中");
                    }
                    break;
            }
        });
    }

    private void OnErrorOccurred(object? sender, Exception ex)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            LastMessageInfo = $"エラー: {ex.Message}";
        });
    }

    private void OnMessageReceived(object? sender, SmisMessage message)
    {
        // クラウド配信が有効ならキューへ。失敗してもローカルログは確実に残るので捕捉のみで握りつぶす。
        try { _cloudUploader?.Enqueue(message); }
        catch (Exception ex) { LastMessageInfo = $"クラウド転送エラー: {ex.Message}"; }

        Application.Current?.Dispatcher.Invoke(() =>
        {
            LastMessageInfo = $"最新: {message.GetType().Name}";
        });
    }

    private void OnCloudStateChanged(object? sender, CloudConnectionState state)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            switch (state)
            {
                case CloudConnectionState.Disabled:
                    CloudStatusText = "OFF";
                    CloudStatusBrush = BrushDisabled;
                    break;
                case CloudConnectionState.Connecting:
                    CloudStatusText = "接続中…";
                    CloudStatusBrush = BrushWarming;
                    break;
                case CloudConnectionState.Connected:
                    CloudStatusText = "配信中";
                    CloudStatusBrush = BrushActive;
                    break;
                case CloudConnectionState.Reconnecting:
                    CloudStatusText = "再接続待機";
                    CloudStatusBrush = BrushWarning;
                    break;
            }
        });
    }

    private void OnCloudErrorOccurred(object? sender, Exception ex)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            LastMessageInfo = $"クラウド: {ex.Message}";
        });
    }

    private void OnStageHealthChanged(object? sender, StageHealth h)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            SetReceiveStageBrush(h.Receive);
            SetParseStageBrush(h.Parse);
            SetLogStageBrush(h.Log);
        });
    }

    private void RefreshLiveMetrics()
    {
        if (_service is null) return;

        TotalMessageCount = _service.TotalMessages;
        ParseErrorCount = _service.ParseErrors;
        LogWriteErrorCount = _service.LogWriteErrors;
        MessagesPerSecond = _service.MessagesPerSecond;
        LogSizeText = FormatBytes(_service.CurrentLogBytes);
        LastReceivedAtText = _service.LastReceivedAt is { } at
            ? at.ToString("HH:mm:ss.fff")
            : "—";
        LogRotationCount = _service.LogRotationCount;

        if (_cloudUploader is not null)
        {
            CloudSentCount = _cloudUploader.SentCount;
            CloudQueueDepth = _cloudUploader.QueueDepth;
            CloudFailedCount = _cloudUploader.FailedCount;
        }
        else
        {
            CloudSentCount = 0;
            CloudQueueDepth = 0;
            CloudFailedCount = 0;
        }

        // ロールオーバーで Writer が差し替わったあとは Service の現行パスへ追従
        string? rawNow = _service.CurrentRawLogPath;
        string? parsedNow = _service.CurrentParsedLogPath;
        if (rawNow is not null && rawNow != CurrentRawLogPath) CurrentRawLogPath = rawNow;
        if (parsedNow is not null && parsedNow != CurrentParsedLogPath) CurrentParsedLogPath = parsedNow;
    }

    private void OnLogFileRotated(object? sender, LogRotationEvent e)
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            CurrentRawLogPath = e.CurrentRawPath ?? "（無効）";
            CurrentParsedLogPath = e.CurrentParsedPath ?? "（無効）";
            LastRotationText =
                $"{e.FromDate:yyyy-MM-dd} → {e.ToDate:yyyy-MM-dd} で切替済";
            LastMessageInfo = $"日付変更を検出: ログを {Path.GetFileName(e.CurrentRawPath ?? string.Empty)} に切替";
        });
    }

    private static (Brush Brush, string Text) ResolveStageVisual(StageStatus status) => status switch
    {
        StageStatus.Idle => (BrushIdle, "待機"),
        StageStatus.Warming => (BrushWarming, "準備中"),
        StageStatus.Active => (BrushActive, "稼働中"),
        StageStatus.Warning => (BrushWarning, "警告"),
        StageStatus.Error => (BrushError, "エラー"),
        StageStatus.Disabled => (BrushDisabled, "OFF"),
        _ => (BrushIdle, "—"),
    };

    private void SetReceiveStageBrush(StageStatus status)
    {
        (Brush brush, string text) = ResolveStageVisual(status);
        ReceiveStatusBrush = brush;
        ReceiveStatusText = text;
    }

    private void SetParseStageBrush(StageStatus status)
    {
        (Brush brush, string text) = ResolveStageVisual(status);
        ParseStatusBrush = brush;
        ParseStatusText = text;
    }

    private void SetLogStageBrush(StageStatus status)
    {
        (Brush brush, string text) = ResolveStageVisual(status);
        LogStatusBrush = brush;
        LogStatusText = text;
    }

    private void UpdateHeadline(StageStatus status, string text)
    {
        HeadlineStatusText = text;
        HeadlineStatusBrush = status switch
        {
            StageStatus.Active => BrushActive,
            StageStatus.Warming => BrushWarming,
            StageStatus.Warning => BrushWarning,
            StageStatus.Error => BrushError,
            StageStatus.Disabled => BrushDisabled,
            _ => BrushIdle,
        };
    }

    private static string FormatBytes(long bytes)
    {
        const long KB = 1024;
        const long MB = KB * 1024;
        const long GB = MB * 1024;
        return bytes switch
        {
            < KB => $"{bytes} B",
            < MB => $"{bytes / (double)KB:0.0} KB",
            < GB => $"{bytes / (double)MB:0.0} MB",
            _ => $"{bytes / (double)GB:0.00} GB",
        };
    }

    public async ValueTask DisposeAsync()
    {
        _uiRefreshTimer.Stop();
        if (_service is not null)
        {
            await _service.DisposeAsync().ConfigureAwait(false);
        }
    }
}
