using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using PkManager.Server.Helpers;
using PkManager.Server.Localization;
using PkManager.Server.Middleware;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly IMemoryCache _cache;
    private readonly IBackendMessageLocalizer _messages;
    private readonly UserContext _userContext;

    public AuthController(
        AuthService authService,
        UserContext userContext,
        IMemoryCache cache,
        IBackendMessageLocalizer messages)
    {
        _authService = authService;
        _userContext = userContext;
        _cache = cache;
        _messages = messages;
    }

    /// <summary>
    /// 用户注册
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Error(
                400,
                _messages.Get("common.invalidRequest"),
                "common.invalidRequest"));

        var acceptLanguage = Request.Headers["Accept-Language"].FirstOrDefault();
        var deviceId = GetDeviceId();
        var userAgent = GetUserAgent();
        var result = await _authService.Register(request, acceptLanguage, deviceId, userAgent);
        return Ok(ApiResponse<AuthResponse>.Ok(
            result,
            _messages.Get("auth.registerSuccess"),
            "auth.registerSuccess"));
    }

    /// <summary>
    /// 用户登录，返回 JWT
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Error(
                400,
                _messages.Get("common.invalidRequest"),
                "common.invalidRequest"));

        var deviceId = GetDeviceId();
        var userAgent = GetUserAgent();
        var result = await _authService.Login(request, deviceId, userAgent);
        return Ok(ApiResponse<AuthResponse>.Ok(
            result,
            _messages.Get("auth.loginSuccess"),
            "auth.loginSuccess"));
    }

    /// <summary>
    /// 刷新 access_token (旋转 refresh_token)
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Refresh([FromBody] RefreshRequest request)
    {
        var deviceId = GetDeviceId();
        var userAgent = GetUserAgent();
        var result = await _authService.RefreshToken(request.RefreshToken, deviceId, userAgent);
        return Ok(ApiResponse<AuthResponse>.Ok(
            result,
            _messages.Get("common.success"),
            "common.success"));
    }

    /// <summary>
    /// 登出 — 撤销当前设备的 refresh_token
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> Logout([FromBody] LogoutRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        var deviceId = GetDeviceId();
        await _authService.Logout(userId.Value, deviceId, request.RefreshToken);
        return Ok(ApiResponse<object>.Ok(
            new { },
            _messages.Get("auth.logoutSuccess"),
            "auth.logoutSuccess"));
    }

    /// <summary>
    /// 获取当前用户信息
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<UserDto>>> Me()
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<UserDto>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        var user = await _authService.GetCurrentUser(userId.Value);
        return Ok(ApiResponse<UserDto>.Ok(
            user,
            _messages.Get("common.success"),
            "common.success"));
    }

    /// <summary>
    /// 列出当前用户所有有效设备
    /// </summary>
    [HttpGet("devices")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<DeviceDto>>>> ListDevices()
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<List<DeviceDto>>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        var currentDeviceId = GetDeviceId();
        var devices = await _authService.ListDevices(userId.Value, currentDeviceId);
        return Ok(ApiResponse<List<DeviceDto>>.Ok(
            devices,
            _messages.Get("common.success"),
            "common.success"));
    }

    /// <summary>
    /// 撤销指定设备的所有有效 token (踢出设备)
    /// </summary>
    [HttpDelete("devices/{deviceId:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> RevokeDevice(Guid deviceId)
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        await _authService.RevokeDevice(userId.Value, deviceId);
        return Ok(ApiResponse<object>.Ok(
            new { },
            _messages.Get("auth.deviceRevoked"),
            "auth.deviceRevoked"));
    }

    /// <summary>
    /// 更新设备显示名
    /// </summary>
    [HttpPut("devices/{deviceId:guid}/label")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> RenameDevice(Guid deviceId, [FromBody] RenameDeviceRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Error(
                400,
                _messages.Get("common.invalidRequest"),
                "common.invalidRequest"));

        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        await _authService.UpdateDeviceLabel(userId.Value, deviceId, request.Label);
        return Ok(ApiResponse<object>.Ok(
            new { },
            _messages.Get("auth.deviceRenamed"),
            "auth.deviceRenamed"));
    }

    /// <summary>
    /// 更新当前账号的语言偏好
    /// </summary>
    [HttpPut("language")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<bool>>> SetLanguage([FromBody] SetLanguageRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<bool>.Error(
                401,
                _messages.Get("common.unauthorized"),
                "common.unauthorized"));

        await _authService.SetPreferredLang(userId.Value, request.Lang);
        _cache.Remove(LanguageMiddleware.GetCacheKey(userId.Value));
        HttpContext.Items["resolved_lang"] = AuthService.NormalizeForClient(request.Lang);
        return Ok(ApiResponse<bool>.Ok(
            true,
            _messages.Get("auth.languageUpdated"),
            "auth.languageUpdated"));
    }

    // ── helpers ──────────────────────────────────────────

    private Guid GetDeviceId()
    {
        var header = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (Guid.TryParse(header, out var id)) return id;
        return Guid.NewGuid();
    }

    private string? GetUserAgent() => Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null;
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public class SetLanguageRequest
{
    public string Lang { get; set; } = "zh-Hans";
}
