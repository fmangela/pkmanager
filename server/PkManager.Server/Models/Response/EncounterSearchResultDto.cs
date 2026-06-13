namespace PkManager.Server.Models.Response;

/// <summary>
/// 遭遇数据库搜索结果。
/// </summary>
public class EncounterSearchResultDto
{
    public int TotalCount { get; set; }
    public List<EncounterItemDto> Items { get; set; } = new();
}

/// <summary>
/// 单条遭遇模板信息。
/// </summary>
public class EncounterItemDto
{
    /// <summary>结果序号（用于 RecomputeToken 定位）</summary>
    public int Index { get; set; }

    /// <summary>遭遇类型: "Egg"|"Mystery"|"Static"|"Trade"|"Slot"</summary>
    public string EncounterType { get; set; } = string.Empty;

    /// <summary>PKHeX 具体类型名 (e.g. "EncounterSlot3")</summary>
    public string TypeName { get; set; } = string.Empty;

    /// <summary>详细描述（来自 IEncounterable.LongName）</summary>
    public string LongName { get; set; } = string.Empty;

    /// <summary>所属游戏版本 (PKHeX GameVersion 枚举值)</summary>
    public int Version { get; set; }

    /// <summary>版本中文名称</summary>
    public string VersionName { get; set; } = string.Empty;

    /// <summary>世代</summary>
    public int Generation { get; set; }

    /// <summary>中文地点名</summary>
    public string? LocationName { get; set; }

    /// <summary>最低等级</summary>
    public int LevelMin { get; set; }

    /// <summary>最高等级</summary>
    public int LevelMax { get; set; }

    /// <summary>闪光规格: "Never"|"Random"|"Always"|"AlwaysStar"|"AlwaysSquare"|"FixedValue"</summary>
    public string Shiny { get; set; } = string.Empty;

    /// <summary>特性权限描述 (e.g. "Any12", "OnlyFirst")</summary>
    public string Ability { get; set; } = string.Empty;

    /// <summary>招式 ID 列表</summary>
    public int[] Moves { get; set; } = Array.Empty<int>();

    /// <summary>招式中文名称列表</summary>
    public string[] MoveNames { get; set; } = Array.Empty<string>();

    /// <summary>固定球种（仅 IFixedBall 且不为 None 时）</summary>
    public int? FixedBall { get; set; }

    /// <summary>球种中文名称</summary>
    public string? FixedBallName { get; set; }

    /// <summary>固定性格（仅 IFixedNature 时）</summary>
    public int? FixedNature { get; set; }

    /// <summary>固定性别（仅 IFixedGender.IsFixedGender 时，0=♂ 1=♀ 2=无性别）</summary>
    public int? Gender { get; set; }

    /// <summary>回忆招式 ID 列表</summary>
    public int[]? RelearnMoves { get; set; }

    /// <summary>重算 Token: base64(JSON {searchRequest全字段 + resultIndex})</summary>
    public string RecomputeToken { get; set; } = string.Empty;
}
