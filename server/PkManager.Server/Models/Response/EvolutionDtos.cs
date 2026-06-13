namespace PkManager.Server.Models.Response;

/// <summary>
/// 查询进化路径请求（POST body，包含当前编辑快照）
/// </summary>
public class GetEvolutionsRequest
{
    public string PkmDataBase64 { get; set; } = string.Empty;
    public Guid SaveFileId { get; set; }
    public Dictionary<string, object?>? EditSnapshot { get; set; }
}

/// <summary>
/// 进化路径响应
/// </summary>
public class EvolutionPathDto
{
    /// <summary>至少有一个当前可进化的目标</summary>
    public bool HasAnyEvolution { get; set; }
    /// <summary>当前可进化的目标数 &gt; 1（需要分支选择器）</summary>
    public bool HasBranchingPaths { get; set; }
    /// <summary>是否为土居忍士（species==290），前端据此显示脱壳忍者选项</summary>
    public bool IsNincada { get; set; }
    public List<EvolutionOptionDto> Options { get; set; } = new();
}

public class EvolutionOptionDto
{
    public int Species { get; set; }
    public string SpeciesName { get; set; } = string.Empty;
    public byte Form { get; set; }
    public string FormName { get; set; } = string.Empty;
    /// <summary>中文进化方式描述，如 "等级16以上"、"使用水之石"</summary>
    public string MethodLabel { get; set; } = string.Empty;
    public byte RequiredLevel { get; set; }
    /// <summary>进化参数（道具ID / 招式ID 等）</summary>
    public ushort Argument { get; set; }

    /// <summary>TryEvolve 判定：当前是否满足进化条件</summary>
    public bool IsAvailable { get; set; }
    /// <summary>不满足条件时的中文原因，如 "等级不足"、"性别不符"</summary>
    public string? BlockReason { get; set; }
}

/// <summary>
/// 执行进化请求（含当前编辑快照）
/// </summary>
public class EvolveRequest
{
    public string PkmDataBase64 { get; set; } = string.Empty;
    public Guid SaveFileId { get; set; }
    public int BoxIndex { get; set; }
    public int SlotIndex { get; set; }
    public bool IsParty { get; set; }
    public Dictionary<string, object?>? EditSnapshot { get; set; }

    public int TargetSpecies { get; set; }
    public int TargetForm { get; set; }
    /// <summary>Nincada→Ninjask 时是否同时生成脱壳忍者</summary>
    public bool AlsoCreateShedinja { get; set; }
}

/// <summary>
/// 进化执行结果
/// </summary>
public class EvolveResultDto
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public PokemonDto? EvolvedPokemon { get; set; }
    public PokemonDto? Shedinja { get; set; }
    public string? ShedinjaLocation { get; set; }
}
