using System.Globalization;
using System.Windows;
using RfxTiming.Smis.Settings;

namespace RfxTiming.Smis.Receiver.Views;

/// <summary>
/// 接続 / 表示 / ログ / WebSocket をタブ式で編集する設定ダイアログ。
/// 入力後 OK を押すと <see cref="ResultSettings"/> に検証済の新しい <see cref="UserSettings"/> を返す。
/// </summary>
public partial class SettingsDialog : Window
{
    private readonly UserSettings _input;

    public SettingsDialog(UserSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        InitializeComponent();
        _input = settings;

        // ===== 接続 =====
        HostBox.Text = settings.Connection.Host;
        PortBox.Text = settings.Connection.Port.ToString(CultureInfo.InvariantCulture);
        AutoReconnectBox.IsChecked = settings.Connection.AutoReconnect;
        AutoConnectBox.IsChecked = settings.Connection.AutoConnectOnStartup;
        InitialRetryBox.Text = settings.Connection.InitialReconnectDelayMs.ToString(CultureInfo.InvariantCulture);
        MaxRetryBox.Text = settings.Connection.MaxReconnectDelayMs.ToString(CultureInfo.InvariantCulture);

        // ===== 表示 =====
        ShowMessageCountBox.IsChecked = settings.Display.ShowMessageCount;
        ShowMessageRateBox.IsChecked = settings.Display.ShowMessageRate;
        ShowParseErrorsBox.IsChecked = settings.Display.ShowParseErrors;
        ShowLogSizeBox.IsChecked = settings.Display.ShowLogSize;
        ShowLastMessagePreviewBox.IsChecked = settings.Display.ShowLastMessagePreview;
        ShowLastReceivedAtInStatusBarBox.IsChecked = settings.Display.ShowLastReceivedAtInStatusBar;
        AccentColorBox.Text = settings.Display.AccentColorHex;

        // ===== ログ =====
        EnableRawLogBox.IsChecked = settings.Logging.EnableRawLog;
        EnableParsedLogBox.IsChecked = settings.Logging.EnableParsedLog;
        MaxFileSizeBox.Text = settings.Logging.MaxFileSizeMb.ToString(CultureInfo.InvariantCulture);
        UsbMirrorPathBox.Text = settings.Logging.UsbMirrorPath;

        // ===== WebSocket =====
        WsEnabledBox.IsChecked = settings.WebSocket.Enabled;
        WsPortBox.Text = settings.WebSocket.Port.ToString(CultureInfo.InvariantCulture);
        WsBindAllBox.IsChecked = settings.WebSocket.BindAllInterfaces;
    }

    /// <summary>OK で確定した設定。Cancel 時は null。</summary>
    public UserSettings ResultSettings { get; private set; } = new();

    private void OnOkClick(object sender, RoutedEventArgs e)
    {
        if (!TryValidateAndBuild(out UserSettings? next, out string? error, out string? focusField))
        {
            MessageBox.Show(this, error, "入力エラー", MessageBoxButton.OK, MessageBoxImage.Warning);
            FocusField(focusField);
            return;
        }

        ResultSettings = next!;
        DialogResult = true;
        Close();
    }

    private bool TryValidateAndBuild(out UserSettings? result, out string? error, out string? focusField)
    {
        result = null;
        error = null;
        focusField = null;

        // 接続
        string host = HostBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(host))
        {
            error = "ホスト名 / IP アドレスを入力してください。";
            focusField = nameof(HostBox);
            return false;
        }

        if (!TryParsePort(PortBox.Text, out int port))
        {
            error = "ポートは 1〜65535 の整数で入力してください。";
            focusField = nameof(PortBox);
            return false;
        }

        if (!int.TryParse(InitialRetryBox.Text, NumberStyles.Integer, CultureInfo.InvariantCulture,
                out int initialRetry) || initialRetry < 0)
        {
            error = "初期リトライ間隔は 0 以上の整数を指定してください (ミリ秒)。";
            focusField = nameof(InitialRetryBox);
            return false;
        }

        if (!int.TryParse(MaxRetryBox.Text, NumberStyles.Integer, CultureInfo.InvariantCulture,
                out int maxRetry) || maxRetry < initialRetry)
        {
            error = "最大リトライ間隔は初期リトライ間隔以上の整数を指定してください (ミリ秒)。";
            focusField = nameof(MaxRetryBox);
            return false;
        }

        // ログ
        if (!int.TryParse(MaxFileSizeBox.Text, NumberStyles.Integer, CultureInfo.InvariantCulture,
                out int maxFileMb) || maxFileMb < 0)
        {
            error = "最大ファイルサイズは 0 以上の整数 (MB) を指定してください。0 で無制限。";
            focusField = nameof(MaxFileSizeBox);
            return false;
        }

        // WebSocket
        if (!TryParsePort(WsPortBox.Text, out int wsPort))
        {
            error = "WebSocket ポートは 1〜65535 の整数で入力してください。";
            focusField = nameof(WsPortBox);
            return false;
        }

        string accent = (AccentColorBox.Text ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(accent)) accent = "#1F6FEB";

        result = new UserSettings
        {
            Connection = new ConnectionSettings
            {
                Host = host,
                Port = port,
                AutoReconnect = AutoReconnectBox.IsChecked == true,
                AutoConnectOnStartup = AutoConnectBox.IsChecked == true,
                InitialReconnectDelayMs = initialRetry,
                MaxReconnectDelayMs = maxRetry,
            },
            Display = new DisplaySettings
            {
                ShowMessageCount = ShowMessageCountBox.IsChecked == true,
                ShowMessageRate = ShowMessageRateBox.IsChecked == true,
                ShowParseErrors = ShowParseErrorsBox.IsChecked == true,
                ShowLogSize = ShowLogSizeBox.IsChecked == true,
                ShowPipelineDiagram = false,
                ShowLastMessagePreview = ShowLastMessagePreviewBox.IsChecked == true,
                ShowLastReceivedAtInStatusBar = ShowLastReceivedAtInStatusBarBox.IsChecked == true,
                AccentColorHex = accent,
            },
            Logging = new LoggingSettings
            {
                EnableRawLog = EnableRawLogBox.IsChecked == true,
                EnableParsedLog = EnableParsedLogBox.IsChecked == true,
                MaxFileSizeMb = maxFileMb,
                UsbMirrorPath = (UsbMirrorPathBox.Text ?? string.Empty).Trim(),
            },
            WebSocket = new WebSocketSettings
            {
                Enabled = WsEnabledBox.IsChecked == true,
                Port = wsPort,
                BindAllInterfaces = WsBindAllBox.IsChecked == true,
            },
        };
        return true;
    }

    private static bool TryParsePort(string? text, out int port)
    {
        if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out port)
            && port is > 0 and <= 65535)
        {
            return true;
        }
        port = 0;
        return false;
    }

    private void FocusField(string? name)
    {
        if (string.IsNullOrEmpty(name)) return;
        if (FindName(name) is System.Windows.Controls.Control c)
        {
            c.Focus();
        }
    }
}
