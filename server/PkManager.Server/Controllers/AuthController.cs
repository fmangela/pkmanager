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
        var result = await _authService.Register(request, acceptLanguage);
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

        var result = await _authService.Login(request);
        return Ok(ApiResponse<AuthResponse>.Ok(
            result,
            _messages.Get("auth.loginSuccess"),
            "auth.loginSuccess"));
    }

    /// <summary>
    /// 刷新 access_token
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Refresh([FromBody] RefreshRequest request)
    {
        var result = await _authService.RefreshToken(request.RefreshToken);
        return Ok(ApiResponse<AuthResponse>.Ok(
            result,
            _messages.Get("common.success"),
            "common.success"));
    }

    /// <summary>
    /// 获取当前用户信息
    /// </summary>
    [HttpGet("me")]
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
    /// 更新当前账号的语言偏好
    /// </summary>
    [HttpPut("language")]
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
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public class SetLanguageRequest
{
    public string Lang { get; set; } = "zh-Hans";
}
