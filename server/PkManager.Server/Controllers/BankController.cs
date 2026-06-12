using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BankController : ControllerBase
{
    private readonly BankService _bankService;
    private readonly UserContext _userContext;
    private readonly LegalityCacheService _legalityCache;

    public BankController(BankService bankService, UserContext userContext, LegalityCacheService legalityCache)
    {
        _bankService = bankService;
        _userContext = userContext;
        _legalityCache = legalityCache;
    }

    /// <summary>
    /// 查询个人银行（支持筛选/排序/分页）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<BankListResult>>> List(
        [FromQuery] int? generation,
        [FromQuery] bool? isShiny,
        [FromQuery] int? nature,
        [FromQuery] int? ability,
        [FromQuery] string? sortBy,
        [FromQuery] bool sortAsc = false,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BankListResult>.Error(401, "未登录"));

        var filter = new BankFilter
        {
            Generation = generation,
            IsShiny = isShiny,
            Nature = nature,
            Ability = ability,
            SortBy = sortBy,
            SortAsc = sortAsc,
            Search = search,
            Page = page,
            PageSize = Math.Min(pageSize, 100)
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

    /// <summary>
    /// 批量导出为 .zip（.pk* 文件）
    /// </summary>
    [HttpPost("batch-export")]
    public async Task<IActionResult> BatchExport([FromBody] BatchDeleteRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized();

        try
        {
            var zipBytes = await _bankService.BatchExport(request.Ids, userId.Value);
            return File(zipBytes, "application/zip", "pokemon_export.zip");
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 批量移动到存档
    /// </summary>
    [HttpPost("batch-move-to-save")]
    public async Task<ActionResult<ApiResponse<object>>> BatchMoveToSave([FromBody] BatchMoveToSaveRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            var result = await _bankService.BatchMoveToSave(
                request.Ids, request.SaveFileId, request.TargetBoxIndex, userId.Value);
            var msg = result.FailedCount > 0
                ? $"已移动 {result.MovedCount} 只，{result.FailedCount} 只失败"
                : $"已移动 {result.MovedCount} 只宝可梦到存档";
            return Ok(ApiResponse<object>.Ok(new
            {
                MovedCount = result.MovedCount,
                FailedCount = result.FailedCount,
                FailedIds = result.FailedIds
            }, msg));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 保存银行宝可梦编辑
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<EditResultDto>>> Edit(Guid id, [FromBody] PokemonEditRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<EditResultDto>.Error(401, "未登录"));

        try
        {
            var result = await _bankService.SaveBankPokemon(id, userId.Value, request);
            var msg = result.Status == LegalityStatus.Legal ? "修改已保存" : "已保存（⚠️ 不合法）";
            return Ok(ApiResponse<EditResultDto>.Ok(result, msg));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<EditResultDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 单只宝可梦发送到存档
    /// </summary>
    [HttpPost("{id:guid}/move-to-save")]
    public async Task<ActionResult<ApiResponse<object>>> MoveToSave(Guid id, [FromBody] MoveToSaveRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _bankService.MoveSingleToSave(id, userId.Value, request.SaveFileId, request.TargetBoxIndex, request.TargetSlotIndex);
            return Ok(ApiResponse<object>.Ok(new { }, "已发送到存档"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 历史数据回填：修复 generation=0 或 game_version IS NULL 的存量记录
    /// </summary>
    [HttpPost("backfill")]
    public async Task<ActionResult<ApiResponse<BackfillResult>>> Backfill()
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BackfillResult>.Error(401, "未登录"));

        var result = await _bankService.Backfill(userId.Value);
        return Ok(ApiResponse<BackfillResult>.Ok(result,
            $"回填完成：修复 {result.Fixed} 条，跳过 {result.Skipped} 条（缺少原始数据），失败 {result.Failed} 条"));
    }

    /// <summary>
    /// 银行宝可梦批量合法性扫描（全量扫描，缓存 5 分钟，内存分页返回）。
    /// </summary>
    [HttpPost("legality-report")]
    public async Task<ActionResult<ApiResponse<BankBatchLegalityReportDto>>> BatchLegalityReport(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BankBatchLegalityReportDto>.Error(401, "未登录"));

        try
        {
            // 查缓存（key=userId，全量扫描）
            var cached = _legalityCache.GetBankReport(userId.Value);
            if (cached != null)
            {
                var paged = new BankBatchLegalityReportDto
                {
                    Total = cached.Total,
                    LegalCount = cached.LegalCount,
                    FishyCount = cached.FishyCount,
                    IllegalCount = cached.IllegalCount,
                    Slots = cached.Slots.Skip((page - 1) * pageSize).Take(pageSize).ToList()
                };
                return Ok(ApiResponse<BankBatchLegalityReportDto>.Ok(paged, "来自缓存"));
            }

            var report = await _bankService.BatchLegalityScan(userId.Value);
            _legalityCache.SetBankReport(userId.Value, report);

            // 内存分页
            var result = new BankBatchLegalityReportDto
            {
                Total = report.Total,
                LegalCount = report.LegalCount,
                FishyCount = report.FishyCount,
                IllegalCount = report.IllegalCount,
                Slots = report.Slots.Skip((page - 1) * pageSize).Take(pageSize).ToList()
            };

            return Ok(ApiResponse<BankBatchLegalityReportDto>.Ok(result,
                $"银行扫描完成: {report.Total} 只宝可梦"));
        }
        catch (Exception ex)
        {
            return BadRequest(ApiResponse<BankBatchLegalityReportDto>.Error(400, ex.Message));
        }
    }

    /// <summary>
    /// 高级搜索 — 在银行中按多条件筛选宝可梦。
    /// </summary>
    [HttpPost("search")]
    public async Task<ActionResult<ApiResponse<PokemonSearchResultDto>>> Search(
        [FromBody] PokemonSearchRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<PokemonSearchResultDto>.Error(401, "未登录"));

        try
        {
            var result = await _bankService.SearchBank(userId.Value, request);
            return Ok(ApiResponse<PokemonSearchResultDto>.Ok(result));
        }
        catch (BusinessException ex)
        {
            return ex.ErrorCode == 404
                ? NotFound(ApiResponse<PokemonSearchResultDto>.Error(ex.ErrorCode, ex.Message))
                : BadRequest(ApiResponse<PokemonSearchResultDto>.Error(ex.ErrorCode, ex.Message));
        }
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

public class BatchMoveToSaveRequest
{
    public List<Guid> Ids { get; set; } = new();
    public Guid SaveFileId { get; set; }
    public int TargetBoxIndex { get; set; }
}
