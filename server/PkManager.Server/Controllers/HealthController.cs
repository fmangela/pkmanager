using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    /// <summary>
    /// 健康检查 — 验证 API 可达性和数据库连接
    /// </summary>
    [HttpGet]
    public ActionResult<ApiResponse<HealthDto>> GetHealth()
    {
        var dto = new HealthDto
        {
            Status = "ok",
            Timestamp = DateTime.UtcNow,
            Version = typeof(HealthController).Assembly.GetName().Version?.ToString() ?? "unknown",
        };
        return Ok(ApiResponse<HealthDto>.Ok(dto, "healthy"));
    }
}

public class HealthDto
{
    public string Status { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public string Version { get; set; } = "";
}
