using System.Security.Claims;

namespace PkManager.Server.Helpers;

/// <summary>
/// 从 JWT 认证后的 HttpContext.User 中提取当前用户信息
/// </summary>
public class UserContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UserContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var userIdStr = _httpContextAccessor.HttpContext?.User
                ?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (Guid.TryParse(userIdStr, out var userId))
                return userId;
            return null;
        }
    }

    public string? Username
    {
        get
        {
            return _httpContextAccessor.HttpContext?.User
                ?.FindFirstValue(ClaimTypes.Name);
        }
    }
}
