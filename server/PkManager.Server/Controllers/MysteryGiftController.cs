using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

/// <summary>
/// L.7 配信功能 — Wonder Card 注入/查询/移除
/// 路由前缀: /api/SaveFile/{saveFileId}/wonder-cards
/// 详见 docs/配信功能-技术文档.md
///
/// 异常处理：BusinessException 由全局 BusinessExceptionFilter 统一捕获并按 ErrorCode 映射 HTTP 状态码，
/// Controller 不再写 try/catch — 状态码映射由 Filter 接管（404/400/500 各得其所）。
/// </summary>
[ApiController]
[Route("api/SaveFile/{saveFileId:guid}/wonder-cards")]
public class MysteryGiftController : LocalizedControllerBase
{
    private readonly MysteryGiftService _mysteryGiftService;
    private readonly UserContext _userContext;

    public MysteryGiftController(MysteryGiftService mysteryGiftService, UserContext userContext)
    {
        _mysteryGiftService = mysteryGiftService;
        _userContext = userContext;
    }

    /// <summary>
    /// 列出当前存档已注入的 wonder card（按槽位顺序）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<MysteryGiftSlotDto>>>> ListInjected(Guid saveFileId)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<List<MysteryGiftSlotDto>>();

        var slots = await _mysteryGiftService.ListInjectedAsync(userId.Value, saveFileId);
        return Ok(ApiResponse<List<MysteryGiftSlotDto>>.Ok(slots));
    }

    /// <summary>
    /// 列出可注入的 wonder card（按 gameVersion + language 过滤，支持分页）
    /// </summary>
    [HttpGet("available")]
    public async Task<ActionResult<ApiResponse<List<WonderCardDto>>>> ListAvailable(
        Guid saveFileId,
        [FromQuery] string? language = null,
        [FromQuery] int? limit = null,
        [FromQuery] int? offset = null)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<List<WonderCardDto>>();

        var cards = await _mysteryGiftService.ListAvailableAsync(
            userId.Value, saveFileId, language, limit ?? 200, offset ?? 0);
        return Ok(ApiResponse<List<WonderCardDto>>.Ok(cards));
    }

    /// <summary>
    /// 将指定 wonder card 注入到存档（自动选第一个空槽位，或通过 ?slot=N 指定）
    /// </summary>
    [HttpPost("{cardId:guid}/inject")]
    public async Task<ActionResult<ApiResponse<MysteryGiftInjectResultDto>>> Inject(
        Guid saveFileId,
        Guid cardId,
        [FromQuery] int? slot = null)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<MysteryGiftInjectResultDto>();

        var result = await _mysteryGiftService.InjectAsync(userId.Value, saveFileId, cardId, slot);
        var dto = new MysteryGiftInjectResultDto { Slot = result, CardId = cardId };
        return Ok(OkMessage(dto, "mysteryGift.injectSuccess"));
    }

    /// <summary>
    /// 移除指定槽位的 wonder card
    /// </summary>
    [HttpDelete("slot/{slot:int}")]
    public async Task<ActionResult<ApiResponse<object>>> Remove(Guid saveFileId, int slot)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<object>();

        await _mysteryGiftService.RemoveAsync(userId.Value, saveFileId, slot);
        return Ok(OkMessage(new { }, "mysteryGift.removeSuccess"));
    }

    /// <summary>
    /// 清空所有已注入的 wonder card
    /// </summary>
    [HttpDelete]
    public async Task<ActionResult<ApiResponse<object>>> ClearAll(Guid saveFileId)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<object>();

        await _mysteryGiftService.ClearAllAsync(userId.Value, saveFileId);
        return Ok(OkMessage(new { }, "mysteryGift.clearSuccess"));
    }
}
