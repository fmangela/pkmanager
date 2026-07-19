namespace PkManager.Server.Models.Response;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public UserDto User { get; set; } = null!;
    /// <summary>
    /// 本次登录绑定的设备 ID (前端用于持久化与 user_settings 对齐)
    /// </summary>
    public Guid DeviceId { get; set; }
}

public class UserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PreferredLang { get; set; } = "zh-Hans";
}

public class DeviceDto
{
    public Guid DeviceId { get; set; }
    public string? DeviceLabel { get; set; }
    public string? UserAgent { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime IssuedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsCurrent { get; set; }
}
