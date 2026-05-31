using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BankController : ControllerBase
{
    private readonly BankService _bankService;
    private readonly UserContext _userContext;

    public BankController(BankService bankService, UserContext userContext)
    {
        _bankService = bankService;
        _userContext = userContext;
    }

    /// <summary>
    /// 查询个人银行（支持筛选/分页）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<BankListResult>>> List(
        [FromQuery] int? generation,
        [FromQuery] bool? isShiny,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BankListResult>.Error(401, "未登录"));

        var filter = new BankFilter
        {
            Generation = generation,
            IsShiny = isShiny,
            Search = search,
            Page = page,
            PageSize = Math.Min(pageSize, 100) // 最多100条/页
        };

        var result = await _bankService.GetBankList(userId.Value, filter);
        return Ok(ApiResponse<BankListResult>.Ok(result));
    }

    /// <summary>
    /// 从存档保存宝可梦到银行
    /// </summary>
    [HttpPost("from-save")]
    public async Task<ActionResult<ApiResponse<object>>> MoveFromSave([FromBody] MoveFromSaveRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            var (bankId, pokemon) = await _bankService.MoveFromSave(
                userId.Value, request.SaveFileId, request.BoxIndex, request.SlotIndex);

            return Ok(ApiResponse<object>.Ok(new
            {
                BankPokemonId = bankId,
                Pokemon = pokemon
            }, "已存入银行"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 获取银行中单只宝可梦详情
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<PokemonDto>>> Detail(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<PokemonDto>.Error(401, "未登录"));

        var pokemon = await _bankService.GetBankDetail(id, userId.Value);
        if (pokemon == null)
            return NotFound(ApiResponse<PokemonDto>.Error(404, "宝可梦不存在"));

        return Ok(ApiResponse<PokemonDto>.Ok(pokemon));
    }

    /// <summary>
    /// 从银行删除宝可梦
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _bankService.Delete(id, userId.Value);
            return Ok(ApiResponse<object>.Ok(new { }, "已删除"));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 批量删除
    /// </summary>
    [HttpPost("batch-delete")]
    public async Task<ActionResult<ApiResponse<object>>> BatchDelete([FromBody] BatchDeleteRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        var count = await _bankService.BatchDelete(request.Ids, userId.Value);
        return Ok(ApiResponse<object>.Ok(new { DeletedCount = count }, $"已删除 {count} 只宝可梦"));
    }
}

public class MoveFromSaveRequest
{
    public Guid SaveFileId { get; set; }
    public int BoxIndex { get; set; }
    public int SlotIndex { get; set; }
}

public class BatchDeleteRequest
{
    public List<Guid> Ids { get; set; } = new();
}
