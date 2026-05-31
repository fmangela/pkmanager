using Npgsql;

namespace PkManager.Server.Data;

/// <summary>
/// 封装 NpgsqlConnection 创建逻辑，便于测试和依赖注入
/// </summary>
public class DbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(string connectionString)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
    }

    public NpgsqlConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}
