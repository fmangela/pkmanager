using System.Security.Claims;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Npgsql;
using PkManager.Server.Helpers;

namespace PkManager.Server.Middleware;

public class LanguageMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _defaultLang;
    private readonly IMemoryCache _cache;

    public LanguageMiddleware(RequestDelegate next, IConfiguration config, IMemoryCache cache)
    {
        _next = next;
        _defaultLang = config["DEFAULT_LANG"] ?? "zh-Hans";
        _cache = cache;
    }

    public async Task InvokeAsync(HttpContext context, NpgsqlConnection db, ILanguageResolver languageResolver)
    {
        var lang = ResolveLang(context, db, languageResolver);
        context.Items["resolved_lang"] = lang;
        context.Response.Headers["Content-Language"] = lang;
        await _next(context);
    }

    private string ResolveLang(HttpContext ctx, NpgsqlConnection db, ILanguageResolver languageResolver)
    {
        var qRaw = ctx.Request.Query["lang"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(qRaw))
        {
            var qLang = languageResolver.ResolveOrDefault(qRaw);
            if (!string.IsNullOrWhiteSpace(qLang))
                return qLang;
        }

        if (ctx.User?.Identity?.IsAuthenticated == true)
        {
            var userIdStr = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (Guid.TryParse(userIdStr, out var userId))
            {
                var cacheKey = GetCacheKey(userId);
                if (_cache.TryGetValue<string>(cacheKey, out var cached))
                {
                    cached = languageResolver.ResolveOrDefault(cached);
                    if (!string.IsNullOrWhiteSpace(cached))
                        return cached;
                }

                var preferred = db.QueryFirstOrDefault<string?>(
                    "SELECT preferred_lang FROM users WHERE id = @UserId",
                    new { UserId = userId });
                preferred = languageResolver.ResolveOrDefault(preferred);
                if (!string.IsNullOrWhiteSpace(preferred))
                {
                    _cache.Set(cacheKey, preferred, TimeSpan.FromMinutes(5));
                    return preferred;
                }
            }
        }

        var header = ctx.Request.Headers["Accept-Language"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(header))
        {
            var first = header.Split(',')[0].Split(';')[0].Trim();
            var normalized = languageResolver.ResolveOrDefault(first);
            if (!string.IsNullOrWhiteSpace(normalized))
                return normalized;
        }

        return _defaultLang;
    }

    public static string GetCacheKey(Guid userId) => $"user-lang:{userId}";
}
