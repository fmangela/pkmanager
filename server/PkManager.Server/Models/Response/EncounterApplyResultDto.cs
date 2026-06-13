namespace PkManager.Server.Models.Response;

/// <summary>
/// 应用遭遇模板到宝可梦的结果（不写盘）。
/// </summary>
public class EncounterApplyResultDto
{
    /// <summary>是否成功</summary>
    public bool Success { get; set; }

    /// <summary>错误信息</summary>
    public string? Error { get; set; }

    /// <summary>更新后的宝可梦 DTO（含新的 pkmDataBase64）</summary>
    public PokemonDto? Pokemon { get; set; }

    /// <summary>被应用的字段清单</summary>
    public List<string> AppliedFields { get; set; } = new();
}
