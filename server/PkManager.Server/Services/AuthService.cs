using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using PkManager.Server.Models.Entity;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

public class AuthService
{
    private static readonly HashSet<string> SupportedLangs = new(StringComparer.OrdinalIgnoreCase)
    {
        "zh-Hans", "zh-Hant", "en", "ja", "fr", "it", "de", "es", "es-419", "ko"
    };

    private readonly NpgsqlConnection _db;
    private readonly IConfiguration _configuration;

    public AuthService(NpgsqlConnection db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    /// <summary>
    /// 用户注册 — BCrypt 哈希 + 插入 users 表
    /// </summary>
    public async Task<AuthResponse> Register(RegisterRequest request, string? acceptLanguage = null,
        Guid? deviceId = null, string? userAgent = null)
    {
        // 检查用户名/邮箱唯一性
        var existing = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT id, username, email FROM users WHERE username = @Username OR email = @Email",
            new { request.Username, request.Email });

        if (existing != null)
        {
            if (existing.Username == request.Username)
                throw BusinessException.FromKey("auth.usernameTaken", 400);
            else
                throw BusinessException.FromKey("auth.emailTaken", 400);
        }

        var passwordHash = BCrypt.Net.BCrypt.EnhancedHashPassword(request.Password, 12);
        var userId = Guid.NewGuid();
        var preferredLang = NormalizeFirstLang(acceptLanguage);

        await _db.ExecuteAsync(@"
            INSERT INTO users (id, username, email, password_hash, preferred_lang)
            VALUES (@Id, @Username, @Email, @PasswordHash, @PreferredLang)",
            new { Id = userId, request.Username, request.Email, PasswordHash = passwordHash, PreferredLang = preferredLang });

        return await GenerateTokensAsync(userId, request.Username, request.Email, preferredLang, deviceId, userAgent);
    }

    /// <summary>
    /// 用户登录 — 查询 + BCrypt 验证 + JWT 签发
    /// </summary>
    public async Task<AuthResponse> Login(LoginRequest request,
        Guid? deviceId = null, string? userAgent = null)
    {
        var user = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT * FROM users WHERE username = @Username",
            new { request.Username });

        if (user == null || !user.IsActive)
            throw BusinessException.FromKey("auth.invalidCredentials", 401);

        if (!BCrypt.Net.BCrypt.EnhancedVerify(request.Password, user.PasswordHash))
            throw BusinessException.FromKey("auth.invalidCredentials", 401);

        return await GenerateTokensAsync(user.Id, user.Username, user.Email, user.PreferredLang, deviceId, userAgent);
    }

    /// <summary>
    /// 刷新 access_token — 验签 + 查 DB 未撤销记录 + 旋转 (旧 revoked + 新 INSERT)
    /// </summary>
    public async Task<AuthResponse> RefreshToken(string refreshToken,
        Guid? deviceId = null, string? userAgent = null)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!);

        try
        {
            var principal = tokenHandler.ValidateToken(refreshToken, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _configuration["Jwt:Issuer"],
                ValidateAudience = true,
                ValidAudience = _configuration["Jwt:Audience"],
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out var validatedToken);

            var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var username = principal.FindFirstValue(ClaimTypes.Name) ?? string.Empty;
            var jti = Guid.Parse(((JwtSecurityToken)validatedToken).Id);

            var user = await _db.QueryFirstOrDefaultAsync<User>(
                "SELECT * FROM users WHERE id = @Id AND is_active = TRUE",
                new { Id = userId });

            if (user == null)
                throw BusinessException.FromKey("auth.userDisabledOrMissing", 401);

            // 验证 DB 中此 token 未被撤销
            var tokenHash = HashToken(refreshToken);
            var record = await _db.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT id, device_id FROM refresh_tokens
                  WHERE jti = @Jti AND token_hash = @Hash
                    AND revoked_at IS NULL AND expires_at > NOW()",
                new { Jti = jti, Hash = tokenHash });

            if (record == null)
                throw BusinessException.FromKey("auth.invalidRefreshToken", 401);

            // 旋转: 旧 token 撤销
            await _db.ExecuteAsync(
                "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = @Id",
                new { Id = (Guid)record.id });

            // 沿用原 device_id (旋转不换设备); 若前端带了 device_id 则校验一致
            var effectiveDeviceId = deviceId ?? (Guid)record.device_id;

            return await GenerateTokensAsync(user.Id, user.Username, user.Email, user.PreferredLang,
                effectiveDeviceId, userAgent);
        }
        catch (BusinessException)
        {
            throw;
        }
        catch (SecurityTokenException)
        {
            throw BusinessException.FromKey("auth.invalidRefreshToken", 401);
        }
    }

    /// <summary>
    /// 登出 — 撤销当前设备的有效 refresh_token
    /// </summary>
    public async Task Logout(Guid userId, Guid deviceId, string? refreshToken)
    {
        if (!string.IsNullOrEmpty(refreshToken))
        {
            // 撤销特定 token (前端传当前 refresh_token)
            var tokenHash = HashToken(refreshToken);
            await _db.ExecuteAsync(@"
                UPDATE refresh_tokens SET revoked_at = NOW()
                WHERE user_id = @Uid AND token_hash = @Hash AND revoked_at IS NULL",
                new { Uid = userId, Hash = tokenHash });
        }
        else
        {
            // 兜底: 撤销该用户该设备的所有有效 token
            await _db.ExecuteAsync(@"
                UPDATE refresh_tokens SET revoked_at = NOW()
                WHERE user_id = @Uid AND device_id = @Did AND revoked_at IS NULL",
                new { Uid = userId, Did = deviceId });
        }
    }

    /// <summary>
    /// 列出当前用户所有有效设备
    /// </summary>
    public async Task<List<DeviceDto>> ListDevices(Guid userId, Guid? currentDeviceId)
    {
        var rows = await _db.QueryAsync<DeviceDto>(@"
            SELECT DISTINCT ON (device_id)
                   device_id AS DeviceId,
                   device_label AS DeviceLabel,
                   user_agent AS UserAgent,
                   last_used_at AS LastUsedAt,
                   issued_at AS IssuedAt,
                   expires_at AS ExpiresAt
              FROM refresh_tokens
             WHERE user_id = @Uid AND revoked_at IS NULL
             ORDER BY device_id, last_used_at DESC NULLS LAST",
            new { Uid = userId });

        foreach (var d in rows)
            d.IsCurrent = currentDeviceId.HasValue && d.DeviceId == currentDeviceId.Value;

        return rows.ToList();
    }

    /// <summary>
    /// 撤销指定设备的所有有效 token (踢出设备)
    /// </summary>
    public async Task RevokeDevice(Guid userId, Guid deviceId)
    {
        await _db.ExecuteAsync(@"
            UPDATE refresh_tokens SET revoked_at = NOW()
            WHERE user_id = @Uid AND device_id = @Did AND revoked_at IS NULL",
            new { Uid = userId, Did = deviceId });
    }

    /// <summary>
    /// 更新设备显示名
    /// </summary>
    public async Task UpdateDeviceLabel(Guid userId, Guid deviceId, string label)
    {
        if (string.IsNullOrWhiteSpace(label))
            throw BusinessException.FromKey("auth.deviceLabelEmpty", 400);
        if (label.Length > 50)
            throw BusinessException.FromKey("auth.deviceLabelTooLong", 400);

        await _db.ExecuteAsync(@"
            UPDATE refresh_tokens SET device_label = @Label
            WHERE user_id = @Uid AND device_id = @Did AND revoked_at IS NULL",
            new { Uid = userId, Did = deviceId, Label = label });
    }

    /// <summary>
    /// 获取当前用户信息
    /// </summary>
    public async Task<UserDto> GetCurrentUser(Guid userId)
    {
        var user = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT id, username, email, preferred_lang FROM users WHERE id = @Id",
            new { Id = userId });

        if (user == null)
            throw BusinessException.FromKey("auth.userNotFound", 404);

        return new UserDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            PreferredLang = NormalizeLang(user.PreferredLang)
        };
    }

    public async Task<string> SetPreferredLang(Guid userId, string lang)
    {
        var normalized = NormalizeLang(lang);
        if (!IsSupportedLang(normalized))
            throw BusinessException.FromKey("auth.unsupportedLanguage", 400);

        await _db.ExecuteAsync(
            "UPDATE users SET preferred_lang = @Lang, updated_at = NOW() WHERE id = @UserId",
            new { Lang = normalized, UserId = userId });

        return normalized;
    }

    // ── 私有方法 ────────────────────────────────────────

    private async Task<AuthResponse> GenerateTokensAsync(Guid userId, string username, string email,
        string preferredLang, Guid? deviceId, string? userAgent)
    {
        var accessExpireHours = int.Parse(_configuration["Jwt:ExpireHours"] ?? "2");
        var refreshExpireDays = int.Parse(_configuration["Jwt:RefreshExpireDays"] ?? "7");

        var accessJti = Guid.NewGuid();
        var refreshJti = Guid.NewGuid();

        var accessToken = GenerateJwt(userId, username, accessExpireHours, accessJti);
        var refreshToken = GenerateJwt(userId, username, refreshExpireDays * 24, refreshJti);

        // 持久化 refresh_token 记录
        var effectiveDeviceId = deviceId ?? Guid.NewGuid();
        var tokenHash = HashToken(refreshToken);
        var expiresAt = DateTime.UtcNow.AddDays(refreshExpireDays);

        await _db.ExecuteAsync(@"
            INSERT INTO refresh_tokens
                (user_id, device_id, token_hash, jti, expires_at, device_label, user_agent)
            VALUES
                (@Uid, @Did, @Hash, @Jti, @ExpiresAt, @Label, @UserAgent)",
            new
            {
                Uid = userId,
                Did = effectiveDeviceId,
                Hash = tokenHash,
                Jti = refreshJti,
                ExpiresAt = expiresAt,
                Label = (string?)null,
                UserAgent = TruncateUserAgent(userAgent)
            });

        return new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            User = new UserDto
            {
                Id = userId,
                Username = username,
                Email = email,
                PreferredLang = NormalizeLang(preferredLang)
            },
            DeviceId = effectiveDeviceId
        };
    }

    private static string HashToken(string token)
    {
        var bytes = Encoding.UTF8.GetBytes(token);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string? TruncateUserAgent(string? ua)
    {
        if (string.IsNullOrEmpty(ua)) return null;
        return ua.Length > 256 ? ua[..256] : ua;
    }

    private static bool IsSupportedLang(string? lang) =>
        !string.IsNullOrWhiteSpace(lang) && SupportedLangs.Contains(NormalizeLang(lang));

    private static string NormalizeFirstLang(string? acceptLanguage)
    {
        if (string.IsNullOrWhiteSpace(acceptLanguage))
            return "zh-Hans";

        var first = acceptLanguage.Split(',')[0].Split(';')[0].Trim();
        var normalized = NormalizeLang(first);
        return IsSupportedLang(normalized) ? normalized : "zh-Hans";
    }

    private static string NormalizeLang(string? lang) => lang switch
    {
        "zh-Hans" or "zh-hans" => "zh-Hans",
        "zh-Hant" or "zh-hant" => "zh-Hant",
        "es-419" => "es-419",
        "zh" or "zh-CN" or "zh-cn" => "zh-Hans",
        "zh-TW" or "zh-tw" => "zh-Hant",
        "en-US" or "en-us" or "en-GB" or "en-gb" => "en",
        "es-MX" or "es-mx" or "es-AR" or "es-ar" => "es-419",
        _ when string.IsNullOrWhiteSpace(lang) => "zh-Hans",
        _ when lang.StartsWith("zh-", StringComparison.OrdinalIgnoreCase) =>
            lang.Equals("zh-HK", StringComparison.OrdinalIgnoreCase) ||
            lang.Equals("zh-MO", StringComparison.OrdinalIgnoreCase)
                ? "zh-Hant"
                : "zh-Hans",
        _ when lang.StartsWith("es-", StringComparison.OrdinalIgnoreCase) =>
            lang.Equals("es-419", StringComparison.OrdinalIgnoreCase) ? "es-419" : "es",
        _ when lang.Contains('-', StringComparison.Ordinal) => lang.Split('-')[0],
        _ => lang
    };

    public static string NormalizeForClient(string? lang) => NormalizeLang(lang);

    private string GenerateJwt(Guid userId, string username, int expireHours, Guid jti)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Jti, jti.ToString()),
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Name, username),
        };

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(expireHours),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
