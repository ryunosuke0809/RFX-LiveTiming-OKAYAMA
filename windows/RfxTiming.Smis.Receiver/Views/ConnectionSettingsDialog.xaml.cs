using System.Windows;

namespace RfxTiming.Smis.Receiver.Views;

/// <summary>
/// 接続設定ダイアログ。host/port/自動再接続を編集する。
/// </summary>
public partial class ConnectionSettingsDialog : Window
{
    public ConnectionSettingsDialog()
    {
        InitializeComponent();
    }

    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 50000;
    public bool AutoReconnect { get; set; } = true;

    /// <summary>呼び出し側から現在値を流し込んでから ShowDialog する。</summary>
    public void LoadValues(string host, int port, bool autoReconnect)
    {
        HostBox.Text = host;
        PortBox.Text = port.ToString(System.Globalization.CultureInfo.InvariantCulture);
        AutoReconnectBox.IsChecked = autoReconnect;
    }

    private void OnOkClick(object sender, RoutedEventArgs e)
    {
        string host = HostBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(host))
        {
            MessageBox.Show(this, "ホスト名 / IP アドレスを入力してください。", "入力エラー",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            HostBox.Focus();
            return;
        }

        if (!int.TryParse(PortBox.Text, System.Globalization.NumberStyles.Integer,
                          System.Globalization.CultureInfo.InvariantCulture, out int port)
            || port <= 0 || port > 65535)
        {
            MessageBox.Show(this, "ポートは 1〜65535 の整数で入力してください。", "入力エラー",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            PortBox.Focus();
            return;
        }

        Host = host;
        Port = port;
        AutoReconnect = AutoReconnectBox.IsChecked == true;
        DialogResult = true;
        Close();
    }
}
