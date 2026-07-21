using System.Text.Json;
using System.Text.Json.Serialization;

namespace RfxTiming.Smis.Settings;

/// <summary>
/// MOLA_Timing-Receiver / VirtualServer のユーザー設定。
/// <para>
/// サーキット運用機での導入を念頭に、起動時に <c>%exe%/data/settings.json</c> を
/// 読み込み、変更時は同ファイルへ即時保存する。SQLite 化はフェーズ 2 で検討。
/// </para>
/// <para>
/// JSON 不在 / 壊れた場合はデフォルト値で動作を継続する (運用上、設定壊れで
/// 接続出来ないより、デフォルトで接続できる方が望ましい)。
/// </para>
/// </summary>
public sealed class UserSettings
{
    /// <summary>SMIS サーバーへの接続先・接続挙動。</summary>
    public ConnectionSettings Connection { get; set; } = new();

    /// <summary>UI 表示要素のオン/オフ。納品先ごとに表示項目を切り替えるため。</summary>
    public DisplaySettings Display { get; set; } = new();

    /// <summary>ログ出力に関する設定。</summary>
    public LoggingSettings Logging { get; set; } = new();

    /// <summary>ローカル LAN 向け WebSocket 配信に関する設定 (Phase 4 で本格利用)。</summary>
    public WebSocketSettings WebSocket { get; set; } = new();

    /// <summary>クラウドサーバーへの転送設定 (Phase 2: 6 月本番テスト対応)。</summary>
    public CloudSettings Cloud { get; set; } = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>JSON から読み込む。壊れていればデフォルト値を返す。</summary>
    public static UserSettings Load(string filePath)
    {
        if (!File.Exists(filePath))
        {
            return new UserSettings();
        }

        try
        {
            string json = File.ReadAllText(filePath);
            if (string.IsNullOrWhiteSpace(json)) return new UserSettings();
            UserSettings? settings = JsonSerializer.Deserialize<UserSettings>(json, JsonOptions);
            return settings ?? new UserSettings();
        }
        catch
        {
            // 破損ファイルでも起動を阻害しない
            return new UserSettings();
        }
    }

    /// <summary>JSON へ保存する (フォルダーが無ければ作る)。</summary>
    public void Save(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        string? dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        string json = JsonSerializer.Serialize(this, JsonOptions);
        File.WriteAllText(filePath, json);
    }
}

/// <summary>SMIS サーバーへの接続設定。</summary>
public sealed class ConnectionSettings
{
    /// <summary>接続先ホスト名 / IP。本番はサーキット計時室の SMIS サーバー。</summary>
    public string Host { get; set; } = "127.0.0.1";

    /// <summary>接続先ポート。MOLA-Timing は 50000 番が標準。</summary>
    public int Port { get; set; } = 50000;

    /// <summary>切断時に自動で再接続を試みる。</summary>
    public bool AutoReconnect { get; set; } = true;

    /// <summary>起動時に自動で接続を開始する。</summary>
    public bool AutoConnectOnStartup { get; set; } = false;

    /// <summary>切断後の初期リトライ間隔 (ms)。指数バックオフで増加する。</summary>
    public int InitialReconnectDelayMs { get; set; } = 1000;

    /// <summary>切断後の最大リトライ間隔 (ms)。</summary>
    public int MaxReconnectDelayMs { get; set; } = 30000;
}

/// <summary>UI 表示要素のオン/オフ。納品先・運用者の好みで切替。</summary>
public sealed class DisplaySettings
{
    /// <summary>受信件数カードを表示する。</summary>
    public bool ShowMessageCount { get; set; } = true;

    /// <summary>受信レート (msg/sec) カードを表示する。</summary>
    public bool ShowMessageRate { get; set; } = true;

    /// <summary>パースエラー数カードを表示する。</summary>
    public bool ShowParseErrors { get; set; } = true;

    /// <summary>当日ログサイズカードを表示する。</summary>
    public bool ShowLogSize { get; set; } = true;

    /// <summary>3 ステージ進行表示 (受信 → パース → ログ書込) を表示する。</summary>
    public bool ShowPipelineDiagram { get; set; } = true;

    /// <summary>最終受信メッセージのプレビューを表示する (デバッグ用)。</summary>
    public bool ShowLastMessagePreview { get; set; } = false;

    /// <summary>ステータスバーに最終受信時刻を表示する。</summary>
    public bool ShowLastReceivedAtInStatusBar { get; set; } = true;

    /// <summary>キーカラー (アクセント)。</summary>
    public string AccentColorHex { get; set; } = "#1F6FEB";
}

/// <summary>ログ出力設定。</summary>
public sealed class LoggingSettings
{
    /// <summary>生ログ + 解析済ログを書き出す。常に true 推奨。</summary>
    public bool EnableRawLog { get; set; } = true;

    /// <summary>解析済 JSONL を書き出す。</summary>
    public bool EnableParsedLog { get; set; } = true;

    /// <summary>1 ファイル最大サイズ (MB)。これを超えたら連番ファイルに分割。0 で無制限。</summary>
    public int MaxFileSizeMb { get; set; } = 0;

    /// <summary>USB ミラー出力先 (空文字なら無効)。</summary>
    public string UsbMirrorPath { get; set; } = string.Empty;
}

/// <summary>ローカル LAN 向け WebSocket 配信設定 (Phase 4 で本格運用)。</summary>
public sealed class WebSocketSettings
{
    /// <summary>WebSocket 配信を有効にする。</summary>
    public bool Enabled { get; set; } = false;

    /// <summary>待受ポート。</summary>
    public int Port { get; set; } = 8765;

    /// <summary>LAN 内クライアント向けに 0.0.0.0 でバインドする。false なら 127.0.0.1。</summary>
    public bool BindAllInterfaces { get; set; } = false;
}

/// <summary>
/// クラウドサーバーへの転送設定。
/// Receiver が解析済 SMIS メッセージを WebSocket 経由でクラウドへ送り、
/// クラウド側がフロントエンドへブロードキャストする構成。
/// 認証は <c>Authorization: Bearer {Token}</c> ヘッダーで行う。
/// </summary>
public sealed class CloudSettings
{
    /// <summary>クラウドへの転送を有効にする。</summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// クラウドの ingest エンドポイント URL。
    /// 本番: <c>wss://mola-timing-okayama.com/ingest</c>。
    /// 開発: <c>ws://127.0.0.1:4000/ingest</c> または <c>ws://localhost:4000/ingest</c>。
    /// </summary>
    public string IngestUrl { get; set; } = "ws://127.0.0.1:4000/ingest";

    /// <summary>
    /// 共有シークレットトークン (Bearer)。
    /// クラウド側で <c>RECEIVER_INGEST_TOKEN</c> 環境変数と一致するか検証される。
    /// </summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// 送信元サーキット ID (例: <c>okayama</c>)。
    /// クラウドが複数サーキットを束ねる際の名前空間として使う。
    /// </summary>
    public string CircuitId { get; set; } = "okayama";

    /// <summary>
    /// クラウド転送に失敗したメッセージを最大何件まで内部キューに保持するか。
    /// この件数を超えるとオフライン時に古いものから破棄される (生 XML ログは保持)。
    /// </summary>
    public int OfflineQueueLimit { get; set; } = 5000;

    /// <summary>切断時の初期再接続待機 (ms)。</summary>
    public int InitialReconnectDelayMs { get; set; } = 1000;

    /// <summary>切断時の最大再接続待機 (ms)。</summary>
    public int MaxReconnectDelayMs { get; set; } = 30000;
}
