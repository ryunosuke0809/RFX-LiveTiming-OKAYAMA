using System.Windows;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Receiver.Services;
using RfxTiming.Smis.Receiver.Views;

namespace RfxTiming.Smis.Receiver.ViewModels;

/// <summary>
/// MainWindow の DataContext。
/// 接続 / 切断 / ログ書き込みを ReceiverService 経由で制御する。
/// </summary>
public partial class MainViewModel : ObservableObject, IAsyncDisposable
{
    // W1 では接続先をハードコード。W2 後半で設定ダイアログから変更可能にする予定。
    private const string DefaultHost = "127.0.0.1";
    private const int DefaultPort = 50000;

    private static readonly SolidColorBrush BrushDisconnected = new(Color.FromRgb(0xF8, 0x51, 0x49));
    private static readonly SolidColorBrush BrushConnecting = new(Color.FromRgb(0xD2, 0x99, 0x22));
    private static readonly SolidColorBrush BrushConnected = new(Color.FromRgb(0x3F, 0xB9, 0x50));

    private ReceiverService? _service;

    [ObservableProperty]
    private string _connectionStatusText = "未接続";

    [ObservableProperty]
    private Brush _connectionStatusBrush = BrushDisconnected;

    [ObservableProperty]
    private string _currentOutputFile = "（未接続）";

    [ObservableProperty]
    private long _totalMessageCount;

    [ObservableProperty]
    private long _parseErrorCount;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ConnectCommand))]
    [NotifyCanExecuteChangedFor(nameof(DisconnectCommand))]
    private bool _isRunning;

    [ObservableProperty]
    private string _smisHost = DefaultHost;

    [ObservableProperty]
    private int _smisPort = DefaultPort;

    [ObservableProperty]
    private bool _autoReconnect = true;

    [ObservableProperty]
    private string _lastMessageInfo = "メッセージ未受信";

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

            _service = new ReceiverService(options);
            _service.StateChanged += OnStateChanged;
            _service.ErrorOccurred += OnErrorOccurred;
            _service.MessageReceived += OnMessageReceived;

            await _service.StartAsync().ConfigureAwait(true);

            IsRunning = true;
            CurrentOutputFile = _service.CurrentRawLogPath ?? "（未確定）";
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
        }
        catch (Exception ex)
        {
            MessageBox.Show($"切断エラー: {ex.Message}", "MOLA_Timing-Receiver",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _service = null;
            IsRunning = false;
            ConnectionStatusText = "未接続";
            ConnectionStatusBrush = BrushDisconnected;
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
    private void OpenConnectionSettings()
    {
        var dialog = new ConnectionSettingsDialog
        {
            Owner = Application.Current?.MainWindow,
        };
        dialog.LoadValues(SmisHost, SmisPort, AutoReconnect);

        if (dialog.ShowDialog() == true)
        {
            SmisHost = dialog.Host;
            SmisPort = dialog.Port;
            AutoReconnect = dialog.AutoReconnect;
        }
    }

    [RelayCommand]
    private void ShowComingSoon(string? featureName)
    {
        string name = string.IsNullOrEmpty(featureName) ? "この機能" : featureName;
        MessageBox.Show(
            $"{name} は W2 末で実装予定です。\n\n現状は接続設定のみ利用可能です。",
            "MOLA_Timing-Receiver",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    [RelayCommand]
    private void ShowAbout()
    {
        MessageBox.Show(
            "MOLA_Timing-Receiver\n" +
            "Version 0.1.0\n\n" +
            "岡山国際サーキット計時室常駐の SMIS 受信・ロガー・ローカル WS 配信アプリ。\n" +
            "内部実装は SMIS プロトコル準拠。\n\n" +
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
                    ConnectionStatusText = $"接続中 ({SmisHost}:{SmisPort})";
                    ConnectionStatusBrush = BrushConnecting;
                    break;
                case SmisTcpClient.ConnectionState.Connected:
                    ConnectionStatusText = $"接続済 ({SmisHost}:{SmisPort})";
                    ConnectionStatusBrush = BrushConnected;
                    break;
                case SmisTcpClient.ConnectionState.Reconnecting:
                    ConnectionStatusText = "再接続待機中…";
                    ConnectionStatusBrush = BrushConnecting;
                    break;
                case SmisTcpClient.ConnectionState.Disconnected:
                    ConnectionStatusText = "未接続";
                    ConnectionStatusBrush = BrushDisconnected;
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
        Application.Current?.Dispatcher.Invoke(() =>
        {
            if (_service is not null)
            {
                TotalMessageCount = _service.TotalMessages;
                ParseErrorCount = _service.ParseErrors;
            }
            LastMessageInfo = $"最新: {message.GetType().Name}";
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
