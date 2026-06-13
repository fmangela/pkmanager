namespace PkManager.Server.Models.Response;

/// <summary>
/// 从遭遇模板生成宝可梦并写入存档的结果。
/// </summary>
public class EncounterGenerateResultDto
{
    /// <summary>是否成功</summary>
    public bool Success { get; set; }

    /// <summary>错误信息</summary>
    public string? Error { get; set; }

    /// <summary>生成的宝可梦 DTO（GetCompatiblePKM 转换后的实体）</summary>
    public PokemonDto? Pokemon { get; set; }

    /// <summary>生成的 PKM Base64 二进制数据</summary>
    public string? PkmDataBase64 { get; set; }

    /// <summary>在兼容后实体上的合法性判定</summary>
    public bool IsLegal { get; set; }

    /// <summary>合法性报告（不合法时）</summary>
    public string? LegalityReport { get; set; }
}
