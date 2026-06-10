namespace PkManager.Server.Models.Response;

/// <summary>
/// 自动生成/Showdown导入的结果。
/// </summary>
public class LegalizationResultDto
{
    /// <summary>是否生成成功</summary>
    public bool Success { get; set; }

    /// <summary>失败原因</summary>
    public string? Error { get; set; }

    /// <summary>生成的合法宝可梦 DTO</summary>
    public PokemonDto? Pokemon { get; set; }

    /// <summary>生成的 PKM Base64 二进制数据</summary>
    public string? PkmDataBase64 { get; set; }

    /// <summary>生成过程中的变更记录</summary>
    public List<string> Changes { get; set; } = new();

    /// <summary>使用的遭遇模板类型名称</summary>
    public string? EncounterType { get; set; }
}

/// <summary>
/// 自动修复的执行结果。
/// </summary>
public class AutoFixResultDto
{
    /// <summary>是否有修复被成功应用</summary>
    public bool Fixed { get; set; }

    /// <summary>成功应用的修复动作</summary>
    public List<string> AppliedFixes { get; set; } = new();

    /// <summary>失败的修复动作</summary>
    public List<string> FailedFixes { get; set; } = new();

    /// <summary>修复后的宝可梦 DTO（供前端更新面板）</summary>
    public PokemonDto? UpdatedPokemon { get; set; }

    /// <summary>修复后的 PKM Base64</summary>
    public string? PkmDataBase64 { get; set; }

    /// <summary>修复后合法性状态</summary>
    public LegalityStatus Status { get; set; }

    /// <summary>修复后逐字段判定</summary>
    public List<JudgementDto> Judgements { get; set; } = new();

    /// <summary>修复后合法性报告</summary>
    public string? Report { get; set; }
}

/// <summary>
/// Showdown 文本解析预览结果（不生成宝可梦）。
/// </summary>
public class ShowdownParseResultDto
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public List<ShowdownSetPreviewDto> Sets { get; set; } = new();
}

/// <summary>
/// Showdown 单套配置预览。
/// </summary>
public class ShowdownSetPreviewDto
{
    public string Species { get; set; } = string.Empty;
    public int SpeciesId { get; set; }
    public string? Nickname { get; set; }
    public int Level { get; set; }
    public bool Shiny { get; set; }
    public string? Gender { get; set; }
    public string? Ability { get; set; }
    public string? Nature { get; set; }
    public string? Item { get; set; }
    public string[] Moves { get; set; } = Array.Empty<string>();
    public string? Form { get; set; }
    public string RawText { get; set; } = string.Empty;
}

/// <summary>
/// 银行宝可梦批量合法性扫描报告。
/// </summary>
public class BankBatchLegalityReportDto
{
    public int Total { get; set; }
    public int LegalCount { get; set; }
    public int FishyCount { get; set; }
    public int IllegalCount { get; set; }
    public List<SlotLegalityDto> Slots { get; set; } = new();
}
