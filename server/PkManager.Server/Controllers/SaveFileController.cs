using Microsoft.AspNetCore.Mvc;
using PkManager.Server.Helpers;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SaveFileController : ControllerBase
{
    private readonly SaveFileService _saveFileService;
    private readonly PokemonEditService _pokemonEditService;
    private readonly UserContext _userContext;

    public SaveFileController(
        SaveFileService saveFileService,
        PokemonEditService pokemonEditService,
        UserContext userContext)
    {
        _saveFileService = saveFileService;
        _pokemonEditService = pokemonEditService;
        _userContext = userContext;
    }

    /// <summary>
    /// 列出当前用户所有存档
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<SaveFileDto>>>> List()
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<List<SaveFileDto>>.Error(401, "未登录"));

        var saves = await _saveFileService.GetUserSaves(userId.Value);
        return Ok(ApiResponse<List<SaveFileDto>>.Ok(saves));
    }

    /// <summary>
    /// 上传并解析存档文件
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(16 * 1024 * 1024)] // 16 MB
    public async Task<ActionResult<ApiResponse<SaveFileDetailDto>>> Upload(IFormFile file)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<SaveFileDetailDto>.Error(401, "未登录"));

        if (file == null || file.Length == 0)
            return BadRequest(ApiResponse<SaveFileDetailDto>.Error(400, "请选择要上传的文件"));

        if (file.Length > 16 * 1024 * 1024)
            return BadRequest(ApiResponse<SaveFileDetailDto>.Error(400, "文件大小不能超过 16MB"));

        try
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var rawData = ms.ToArray();

            var result = await _saveFileService.UploadSave(userId.Value, rawData, file.FileName);
            return Ok(ApiResponse<SaveFileDetailDto>.Ok(result, "存档上传并解析成功"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<SaveFileDetailDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 获取存档详情（含所有箱子数据）
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<SaveFileDetailDto>>> Detail(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<SaveFileDetailDto>.Error(401, "未登录"));

        try
        {
            var result = await _saveFileService.GetSaveDetail(id, userId.Value);
            return Ok(ApiResponse<SaveFileDetailDto>.Ok(result));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<SaveFileDetailDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 存档内部移动/交换宝可梦
    /// </summary>
    [HttpPost("{id:guid}/move-slot")]
    public async Task<ActionResult<ApiResponse<object>>> MoveSlot(Guid id, [FromBody] MoveSlotRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.MoveSlot(id, userId.Value,
                request.FromBoxIndex, request.FromSlotIndex,
                request.ToBoxIndex, request.ToSlotIndex);

            return Ok(ApiResponse<object>.Ok(new { }, "移动成功"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 从银行拖入宝可梦到存档
    /// </summary>
    [HttpPost("{id:guid}/move-from-bank")]
    public async Task<ActionResult<ApiResponse<object>>> MoveFromBank(Guid id, [FromBody] MoveFromBankRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.MoveFromBank(id, userId.Value,
                request.BankPokemonId, request.TargetBoxIndex, request.TargetSlotIndex);
            return Ok(ApiResponse<object>.Ok(new { }, "已移入存档"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 删除存档
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.DeleteSave(id, userId.Value);
            return Ok(ApiResponse<object>.Ok(new { }, "存档已删除"));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 存档备份管理
    /// </summary>
    [HttpPost("{id:guid}/save")]
    public async Task<ActionResult<ApiResponse<object>>> Save(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));
        await _saveFileService.CreateBackup(id, userId.Value, "手动保存");
        return Ok(ApiResponse<object>.Ok(new { }, "存档已保存并备份"));
    }

    [HttpGet("{id:guid}/backups")]
    public async Task<ActionResult<ApiResponse<List<SaveBackupDto>>>> ListBackups(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<List<SaveBackupDto>>.Error(401, "未登录"));
        try
        {
            var backups = await _saveFileService.ListBackups(id, userId.Value);
            return Ok(ApiResponse<List<SaveBackupDto>>.Ok(backups));
        }
        catch (BusinessException ex) { return NotFound(ApiResponse<List<SaveBackupDto>>.Error(ex.ErrorCode, ex.Message)); }
    }

    /// <summary>下载原始存档二进制（供模拟器使用）</summary>
    [HttpGet("{id:guid}/raw")]
    public async Task<IActionResult> DownloadRaw(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized();
        try
        {
            var (data, _) = await _saveFileService.GetDownloadData(id, userId.Value);
            return File(data, "application/octet-stream", $"save_{id}.sav");
        }
        catch (BusinessException) { return NotFound(); }
    }

    [HttpPost("{id:guid}/backups/{backupId:guid}/restore")]
    public async Task<ActionResult<ApiResponse<object>>> RestoreBackup(Guid id, Guid backupId)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));
        try
        {
            await _saveFileService.RestoreBackup(id, userId.Value, backupId);
            return Ok(ApiResponse<object>.Ok(new { }, "已从备份恢复"));
        }
        catch (BusinessException ex) { return NotFound(ApiResponse<object>.Error(ex.ErrorCode, ex.Message)); }
    }

    /// <summary>
    /// 下载存档文件
    /// </summary>
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized();

        try
        {
            var (data, filename) = await _saveFileService.GetDownloadData(id, userId.Value);
            return File(data, "application/octet-stream", filename);
        }
        catch (BusinessException)
        {
            return NotFound();
        }
    }

    /// <summary>
    /// 全存档合法性批量扫描
    /// </summary>
    [HttpPost("{id:guid}/legality-report")]
    public async Task<ActionResult<ApiResponse<BatchLegalityReportDto>>> BatchLegalityReport(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BatchLegalityReportDto>.Error(401, "未登录"));

        try
        {
            var report = await _saveFileService.BatchLegalityScan(id, userId.Value, _pokemonEditService);
            return Ok(ApiResponse<BatchLegalityReportDto>.Ok(report,
                $"扫描完成: {report.Total} 只宝可梦, {report.LegalCount} 合法, {report.FishyCount} 可疑, {report.IllegalCount} 不合法"));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<BatchLegalityReportDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 获取存档背包（道具列表）
    /// </summary>
    [HttpGet("{id:guid}/bag")]
    public async Task<ActionResult<ApiResponse<BagDto>>> GetBag(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<BagDto>.Error(401, "未登录"));

        try
        {
            var bag = await _saveFileService.GetBag(id, userId.Value);
            return Ok(ApiResponse<BagDto>.Ok(bag));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<BagDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 保存背包变更
    /// </summary>
    [HttpPut("{id:guid}/bag")]
    public async Task<ActionResult<ApiResponse<object>>> SaveBag(Guid id, [FromBody] BagDto bag)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SaveBag(id, userId.Value, bag);
            return Ok(ApiResponse<object>.Ok(new { }, "背包已保存"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 获取训练家信息
    /// </summary>
    [HttpGet("{id:guid}/trainer")]
    public async Task<ActionResult<ApiResponse<TrainerInfoDto>>> GetTrainer(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<TrainerInfoDto>.Error(401, "未登录"));

        try
        {
            var info = await _saveFileService.GetTrainerInfo(id, userId.Value);
            return Ok(ApiResponse<TrainerInfoDto>.Ok(info));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<TrainerInfoDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 保存训练家信息变更
    /// </summary>
    [HttpPut("{id:guid}/trainer")]
    public async Task<ActionResult<ApiResponse<object>>> SaveTrainer(Guid id, [FromBody] TrainerInfoDto info)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SaveTrainerInfo(id, userId.Value, info);
            return Ok(ApiResponse<object>.Ok(new { }, "训练家信息已保存"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 获取存档图鉴（seen/caught 条目列表 + 统计数据）
    /// </summary>
    [HttpGet("{id:guid}/pokedex")]
    public async Task<ActionResult<ApiResponse<PokedexDto>>> GetPokedex(Guid id)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<PokedexDto>.Error(401, "未登录"));

        try
        {
            var dto = await _saveFileService.GetPokedex(id, userId.Value);
            return Ok(ApiResponse<PokedexDto>.Ok(dto));
        }
        catch (BusinessException ex)
        {
            return NotFound(ApiResponse<PokedexDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 保存图鉴变更（seen/caught 切换）
    /// </summary>
    [HttpPut("{id:guid}/pokedex")]
    public async Task<ActionResult<ApiResponse<object>>> SavePokedex(Guid id, [FromBody] PokedexDto dto)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SavePokedex(id, userId.Value, dto);
            return Ok(ApiResponse<object>.Ok(new { }, "图鉴已保存"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 图鉴批量操作 — seenAll / caughtAll / clearAll
    /// </summary>
    [HttpPost("{id:guid}/pokedex/batch")]
    public async Task<ActionResult<ApiResponse<PokedexDto>>> BatchPokedex(Guid id, [FromBody] PokedexBatchRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<PokedexDto>.Error(401, "未登录"));

        try
        {
            if (request?.Action == null)
                return BadRequest(ApiResponse<PokedexDto>.Error(400, "缺少批量操作参数"));
            var result = await _saveFileService.BatchPokedex(id, userId.Value, request.Action);
            return Ok(ApiResponse<PokedexDto>.Ok(result));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<PokedexDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 交换两个箱子的全部宝可梦
    /// </summary>
    [HttpPost("{id:guid}/swap-boxes")]
    public async Task<ActionResult<ApiResponse<object>>> SwapBoxes(Guid id, [FromBody] SwapBoxesRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SwapBoxes(id, userId.Value, request.BoxIndexA, request.BoxIndexB);
            return Ok(ApiResponse<object>.Ok(new { }, "箱子已交换"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 对所有箱子分别执行内部排序
    /// </summary>
    [HttpPost("{id:guid}/sortBoxes")]
    public async Task<ActionResult<ApiResponse<object>>> SortBoxes(Guid id, [FromBody] SortBoxesRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SortAllBoxes(id, userId.Value, request.SortBy);
            return Ok(ApiResponse<object>.Ok(new { }, $"已按{GetSortLabel(request.SortBy)}完成箱子排序"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 对单个箱子执行内部排序
    /// </summary>
    [HttpPost("{id:guid}/sortBox")]
    public async Task<ActionResult<ApiResponse<object>>> SortBox(Guid id, [FromBody] SortBoxRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<object>.Error(401, "未登录"));

        try
        {
            await _saveFileService.SortBox(id, userId.Value, request.BoxIndex, request.SortBy);
            return Ok(ApiResponse<object>.Ok(new { }, $"已按{GetSortLabel(request.SortBy)}完成当前箱排序"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<object>.Error(ex.ErrorCode, ex.Message));
        }
    }

    /// <summary>
    /// 创建新游戏空白存档（用于模拟器新游戏入口）
    /// </summary>
    [HttpPost("new-game")]
    public async Task<ActionResult<ApiResponse<SaveFileDetailDto>>> NewGame([FromBody] NewGameRequest request)
    {
        var userId = _userContext.UserId;
        if (userId == null) return Unauthorized(ApiResponse<SaveFileDetailDto>.Error(401, "未登录"));

        try
        {
            var result = await _saveFileService.CreateNewGame(userId.Value, request.GameId);
            return Ok(ApiResponse<SaveFileDetailDto>.Ok(result, "新游戏存档已创建"));
        }
        catch (BusinessException ex)
        {
            return BadRequest(ApiResponse<SaveFileDetailDto>.Error(ex.ErrorCode, ex.Message));
        }
    }

    private static string GetSortLabel(string? sortBy) => sortBy?.Trim().ToLowerInvariant() switch
    {
        "species" => "物种编号",
        "level" => "等级",
        "shiny" => "闪光优先",
        "name" => "名称",
        _ => "指定方式",
    };
}

public class MoveFromBankRequest
{
    public Guid BankPokemonId { get; set; }
    public int TargetBoxIndex { get; set; }
    public int TargetSlotIndex { get; set; }
}

public class MoveSlotRequest
{
    public int FromBoxIndex { get; set; }
    public int FromSlotIndex { get; set; }
    public int ToBoxIndex { get; set; }
    public int ToSlotIndex { get; set; }
}

public class SwapBoxesRequest
{
    public int BoxIndexA { get; set; }
    public int BoxIndexB { get; set; }
}

public class SortBoxesRequest
{
    public string SortBy { get; set; } = "species";
}

public class SortBoxRequest
{
    public int BoxIndex { get; set; }
    public string SortBy { get; set; } = "species";
}

public class NewGameRequest
{
    public string GameId { get; set; } = "pkm_emerald";
}
