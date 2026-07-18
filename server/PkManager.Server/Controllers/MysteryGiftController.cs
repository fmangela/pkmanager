using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

/// <summary>
/// L.7 配信功能 — Wonder Card 注入/查询/移除
/// 路由前缀: /api/SaveFile/{saveFileId}/wonder-cards
/// 详见 docs/配信功能-技术文档.md
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
    public async Task<ActionResult<ApiResponse<List<MysteryGiftSlotDto>>>> ListInjected(
        Guid saveFileId)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<List<MysteryGiftSlotDto>>();

        try
        {
            var slots = await _mysteryGiftService.ListInjectedAsync(userId.Value, saveFileId);
            return Ok(ApiResponse<List<MysteryGiftSlotDto>>.Ok(slots));
        }
        catch (BusinessException ex)
        {
            return BadRequest(FromBusinessException<List<MysteryGiftSlotDto>>(ex));
        }
    }

    /// <summary>
    /// 列出可注入的 wonder card（按 gameVersion + language 过滤）
    /// </summary>
    [HttpGet("available")]
    public async Task<ActionResult<ApiResponse<List<WonderCardDto>>>> ListAvailable(
        Guid saveFileId,
        [FromQuery] string? language = null)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<List<WonderCardDto>>();

        try
        {
            var cards = await _mysteryGiftService.ListAvailableAsync(userId.Value, saveFileId, language);
            return Ok(ApiResponse<List<WonderCardDto>>.Ok(cards));
        }
        catch (BusinessException ex)
        {
            return BadRequest(FromBusinessException<List<WonderCardDto>>(ex));
        }
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

        try
        {
            var result = await _mysteryGiftService.InjectAsync(userId.Value, saveFileId, cardId, slot);
            var dto = new MysteryGiftInjectResultDto { Slot = result, CardId = cardId };
            return Ok(OkMessage(dto, "mysteryGift.injectSuccess"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(FromBusinessException<MysteryGiftInjectResultDto>(ex));
        }
    }

    /// <summary>
    /// 移除指定槽位的 wonder card
    /// </summary>
    [HttpDelete("slot/{slot:int}")]
    public async Task<ActionResult<ApiResponse<object>>> Remove(Guid saveFileId, int slot)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<object>();

        try
        {
            await _mysteryGiftService.RemoveAsync(userId.Value, saveFileId, slot);
            return Ok(OkMessage(new { }, "mysteryGift.removeSuccess"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(FromBusinessException<object>(ex));
        }
    }

    /// <summary>
    /// 清空所有已注入的 wonder card
    /// </summary>
    [HttpDelete]
    public async Task<ActionResult<ApiResponse<object>>> ClearAll(Guid saveFileId)
    {
        var userId = _userContext.UserId;
        if (userId == null) return UnauthorizedMessage<object>();

        try
        {
            await _mysteryGiftService.ClearAllAsync(userId.Value, saveFileId);
            return Ok(OkMessage(new { }, "mysteryGift.clearSuccess"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(FromBusinessException<object>(ex));
        }
    }
}
