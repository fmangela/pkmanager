using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly UserContext _userContext;

    public AuthController(AuthService authService, UserContext userContext)
    {
        _authService = authService;
        _userContext = userContext;
    }

    /// <summary>
    /// 用户注册
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Error(400, "请求参数不合法"));

        try
        {
            var result = await _authService.Register(request);
            return Ok(ApiResponse<AuthResponse>.Ok(result, "注册成功"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<AuthResponse>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 用户登录，返回 JWT
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<AuthResponse>.Error(400, "请求参数不合法"));

        try
        {
            var result = await _authService.Login(request);
            return Ok(ApiResponse<AuthResponse>.Ok(result, "登录成功"));
        }
        catch (BusinessException ex)
        {
            return Unauthorized(ApiResponse<AuthResponse>.Error(401, ex.Message));
        }
    }

    /// <summary>
    /// 刷新 access_token
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Refresh([FromBody] RefreshRequest request)
    {
        try
        {
            var result = await _authService.RefreshToken(request.RefreshToken);
            return Ok(ApiResponse<AuthResponse>.Ok(result));
        }
        catch (BusinessException ex)
        {
            return Unauthorized(ApiResponse<AuthResponse>.Error(401, ex.Message));
        }
    }

    /// <summary>
    /// 获取当前用户信息
    /// </summary>
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<UserDto>>> Me()
    {
        var userId = _userContext.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<UserDto>.Error(401, "未登录"));

        try
        {
            var user = await _authService.GetCurrentUser(userId.Value);
            return Ok(ApiResponse<UserDto>.Ok(user));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<UserDto>.Error(404, ex.Message));
        }
    }
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}
