using System.Data;
using Dapper;

namespace PkManager.Server.Helpers;

/// <summary>
/// Dapper TypeHandler — 让 Dapper 能将 DateOnly/DateOnly? 作为参数传给 PostgreSQL DATE 列。
/// Dapper 默认不支持 DateOnly（.NET 6+ 引入），未注册时会抛 NotSupportedException。
/// 注册时机：Program.cs 启动早期，与 DefaultTypeMap.MatchNamesWithUnderscores 同处。
/// </summary>
public sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
        parameter.DbType = DbType.Date;
    }

    public override DateOnly Parse(object value) =>
        value switch
        {
            DateTime dt => DateOnly.FromDateTime(dt),
            DateOnly d => d,
            string s when DateOnly.TryParse(s, out var d) => d,
            _ => default
        };
}

/// <summary>
/// 可空 DateOnly 包装 — Dapper 按具体类型查找 TypeHandler，Nullable&lt;T&gt; 单独注册。
/// </summary>
public sealed class NullableDateOnlyTypeHandler : SqlMapper.ITypeHandler
{
    public void SetValue(IDbDataParameter parameter, object value)
    {
        if (value is null)
        {
            parameter.Value = DBNull.Value;
        }
        else if (value is DateOnly d)
        {
            parameter.Value = d.ToDateTime(TimeOnly.MinValue);
        }
        else
        {
            parameter.Value = value;
        }
        parameter.DbType = DbType.Date;
    }

    public object Parse(Type destinationType, object value) =>
        value switch
        {
            null or DBNull => null!,
            DateTime dt => DateOnly.FromDateTime(dt),
            DateOnly d => d,
            string s when DateOnly.TryParse(s, out var d) => d,
            _ => null!
        };
}
