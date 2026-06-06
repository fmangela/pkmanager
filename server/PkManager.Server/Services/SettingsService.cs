using Dapper;
using Npgsql;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

public class SettingsService
{
    private readonly NpgsqlConnection _db;

    public SettingsService(NpgsqlConnection db) => _db = db;

    /// <summary>获取当前用户+设备的模拟器配置（key → value 字典）</summary>
    public async Task<Dictionary<string, string>> GetEmulatorSettings(Guid userId, Guid deviceId)
    {
        var rows = await _db.QueryAsync<UserSettingsRow>(
            "SELECT key, value FROM user_settings WHERE user_id = @UserId AND device_id = @DeviceId",
            new { UserId = userId, DeviceId = deviceId });
        return rows.ToDictionary(r => r.key, r => r.value);
    }

    /// <summary>批量保存模拟器配置（upsert）</summary>
    public async Task SaveEmulatorSettings(Guid userId, Guid deviceId, Dictionary<string, string> settings)
    {
        foreach (var kv in settings)
        {
            await _db.ExecuteAsync(@"
                INSERT INTO user_settings (user_id, device_id, key, value)
                VALUES (@UserId, @DeviceId, @Key, @Value)
                ON CONFLICT (user_id, device_id, key) DO UPDATE SET value = @Value, updated_at = NOW()",
                new { UserId = userId, DeviceId = deviceId, Key = kv.Key, Value = kv.Value });
        }
    }
}

// Internal row type for Dapper mapping
internal class UserSettingsRow
{
    public string key { get; set; } = "";
    public string value { get; set; } = "";
}
