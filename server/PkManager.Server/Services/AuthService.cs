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
    public async Task<AuthResponse> Register(RegisterRequest request)
    {
        // 检查用户名/邮箱唯一性
        var existing = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT id, username, email FROM users WHERE username = @Username OR email = @Email",
            new { request.Username, request.Email });

        if (existing != null)
        {
            if (existing.Username == request.Username)
                throw new BusinessException("用户名已被注册");
            else
                throw new BusinessException("邮箱已被注册");
        }

        var passwordHash = BCrypt.Net.BCrypt.EnhancedHashPassword(request.Password, 12);
        var userId = Guid.NewGuid();

        await _db.ExecuteAsync(@"
            INSERT INTO users (id, username, email, password_hash)
            VALUES (@Id, @Username, @Email, @PasswordHash)",
            new { Id = userId, request.Username, request.Email, PasswordHash = passwordHash });

        return GenerateTokens(userId, request.Username, request.Email);
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
            throw new BusinessException("用户名或密码错误");

        if (!BCrypt.Net.BCrypt.EnhancedVerify(request.Password, user.PasswordHash))
            throw new BusinessException("用户名或密码错误");

        return GenerateTokens(user.Id, user.Username, user.Email);
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
                throw new BusinessException("用户不存在或已禁用");

            return GenerateTokens(user.Id, user.Username, user.Email);
        }
        catch (SecurityTokenException)
        {
            throw new BusinessException("无效的刷新令牌");
        }
    }

    /// <summary>
    /// 获取当前用户信息
    /// </summary>
    public async Task<UserDto> GetCurrentUser(Guid userId)
    {
        var user = await _db.QueryFirstOrDefaultAsync<User>(
            "SELECT id, username, email FROM users WHERE id = @Id",
            new { Id = userId });

        if (user == null)
            throw new BusinessException("用户不存在");

        return new UserDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email
        };
    }

    // ── 私有方法 ────────────────────────────────────────

    private AuthResponse GenerateTokens(Guid userId, string username, string email)
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
                Email = email
            }
        };
    }

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

/// <summary>
/// 业务异常，用于返回可展示给用户的错误信息
/// </summary>
public class BusinessException : Exception
{
    public int ErrorCode { get; }

    public BusinessException(string message, int errorCode = 400) : base(message)
    {
        ErrorCode = errorCode;
    }
}
