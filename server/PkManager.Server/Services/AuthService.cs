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
    public async Task<AuthResponse> Register(RegisterRequest request, string? acceptLanguage = null)
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

        return GenerateTokens(userId, request.Username, request.Email, preferredLang);
    }

    /// <summary>
    /// 用户登录 — 查询 + BCrypt 验证 + JWT 签发
    /// </summary>
    public async Task<AuthResponse> Login(LoginRequest request)
    {
        var user = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT * FROM users WHERE username = @Username",
            new { request.Username });

        if (user == null || !user.IsActive)
            throw BusinessException.FromKey("auth.invalidCredentials", 401);

        if (!BCrypt.Net.BCrypt.EnhancedVerify(request.Password, user.PasswordHash))
            throw BusinessException.FromKey("auth.invalidCredentials", 401);

        return GenerateTokens(user.Id, user.Username, user.Email, user.PreferredLang);
    }

    /// <summary>
    /// 刷新 access_token
    /// </summary>
    public async Task<AuthResponse> RefreshToken(string refreshToken)
    {
        // 验证 refresh token
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
            }, out _);

            var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var user = await _db.QueryFirstOrDefaultAsync<User>(
                "SELECT * FROM users WHERE id = @Id AND is_active = TRUE",
                new { Id = userId });

            if (user == null)
                throw BusinessException.FromKey("auth.userDisabledOrMissing", 401);

            return GenerateTokens(user.Id, user.Username, user.Email, user.PreferredLang);
        }
        catch (SecurityTokenException)
        {
            throw BusinessException.FromKey("auth.invalidRefreshToken", 401);
        }
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

    private AuthResponse GenerateTokens(Guid userId, string username, string email, string preferredLang)
    {
        var accessToken = GenerateJwt(userId, username,
            int.Parse(_configuration["Jwt:ExpireHours"] ?? "2"));
        var refreshToken = GenerateJwt(userId, username,
            int.Parse(_configuration["Jwt:RefreshExpireDays"] ?? "7") * 24);

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
            }
        };
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

    private string GenerateJwt(Guid userId, string username, int expireHours)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
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
