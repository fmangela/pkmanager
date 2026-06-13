namespace PkManager.Server.Models.Request;

/// <summary>
/// 请求: 搜索 PKHeX.Core 内置遭遇数据库中的合法遭遇模板。
/// </summary>
public class EncounterSearchRequest
{
    /// <summary>物种 ID (1-1025, 必填)</summary>
    public int Species { get; set; }

    /// <summary>形态 (默认 0)</summary>
    public int Form { get; set; }

    /// <summary>目标存档 ID (必填 — 从中提取训练家信息和目标世代上下文)</summary>
    public Guid SaveFileId { get; set; }

    /// <summary>最低等级过滤</summary>
    public int? LevelMin { get; set; }

    /// <summary>最高等级过滤</summary>
    public int? LevelMax { get; set; }

    /// <summary>遭遇类型过滤: "Egg"|"Mystery"|"Static"|"Trade"|"Slot"。空数组表示全部类型。</summary>
    public string[]? EncounterTypes { get; set; }
}
