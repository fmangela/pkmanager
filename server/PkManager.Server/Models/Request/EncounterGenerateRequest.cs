namespace PkManager.Server.Models.Request;

/// <summary>
/// 请求: 从遭遇模板生成全新合法宝可梦并写入存档槽位。
/// </summary>
public class EncounterGenerateRequest
{
    /// <summary>搜索结果中的重算 Token</summary>
    public string RecomputeToken { get; set; } = string.Empty;

    /// <summary>目标存档 ID</summary>
    public Guid SaveFileId { get; set; }

    /// <summary>目标箱子索引</summary>
    public int BoxIndex { get; set; }

    /// <summary>目标槽位索引</summary>
    public int SlotIndex { get; set; }

    /// <summary>是否允许覆盖已占用的槽位（默认 false）</summary>
    public bool AllowOverwrite { get; set; }

    /// <summary>强制等级（覆盖遭遇模板的默认等级）</summary>
    public int? Level { get; set; }

    /// <summary>强制性格 (0-24)</summary>
    public int? Nature { get; set; }

    /// <summary>强制性别 (0=♂, 1=♀, 2=无性别)</summary>
    public int? Gender { get; set; }

    /// <summary>强制闪光</summary>
    public bool? ForceShiny { get; set; }
}
