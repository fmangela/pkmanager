using PkManager.Server.Models.Response;

namespace PkManager.Server.Models.Request;

/// <summary>
/// 请求: 从模板（物种 + 版本 + 可选约束）自动生成合法宝可梦。
/// </summary>
public class LegalizationRequest
{
    /// <summary>物种 ID (1-1025)</summary>
    public int Species { get; set; }

    /// <summary>目标游戏版本 (PKHeX.GameVersion 枚举值)</summary>
    public int TargetGameVersion { get; set; }

    /// <summary>闪光</summary>
    public bool? IsShiny { get; set; }

    /// <summary>性格 (0-24)</summary>
    public byte? Nature { get; set; }

    /// <summary>性别 (0=♂ / 1=♀ / 2=无性别)</summary>
    public byte? Gender { get; set; }

    /// <summary>特性 ID（如 65=Blaze）</summary>
    public int? Ability { get; set; }

    /// <summary>形态</summary>
    public byte? Form { get; set; }

    /// <summary>等级 (默认 50)</summary>
    public byte? Level { get; set; }

    /// <summary>期望招式 ID 列表（0 表示空槽位）</summary>
    public int[]? DesiredMoves { get; set; }

    /// <summary>是否保留用户指定的 OT 名称</summary>
    public bool PreserveOT { get; set; }

    /// <summary>原始训练家名称（PreserveOT=true 时生效）</summary>
    public string? OriginalTrainerName { get; set; }

    /// <summary>训练家来源存档 ID（从中提取 OT/TID/SID 信息）。版本信息按 TargetGameVersion 覆盖。</summary>
    public Guid? TrainerSaveFileId { get; set; }

    /// <summary>
    /// 强制创建:遭遇搜索失败时,跳过合法性校验直接生成 PKM。
    /// 用于化石复活/幻兽等无自然遭遇模板的物种。生成的 PKM 可能显示 Illegal,但可正常写入存档。
    /// </summary>
    public bool ForceCreate { get; set; }
}

/// <summary>
/// 请求: 从 Showdown 文本导入并生成合法宝可梦。
/// </summary>
public class ShowdownImportRequest
{
    /// <summary>Showdown 格式文本（如 "Garchomp @ Life Orb\nAbility: Rough Skin\n..."）</summary>
    public string ShowdownText { get; set; } = string.Empty;

    /// <summary>目标游戏版本</summary>
    public int TargetGameVersion { get; set; }

    /// <summary>训练家来源存档 ID</summary>
    public Guid? TrainerSaveFileId { get; set; }
}

/// <summary>
/// 请求: 对非法宝可梦应用自动修复（仅更新面板临时状态，不持久化）。
/// </summary>
public class AutoFixRequest
{
    /// <summary>Base64 编码的 PKM 原始二进制数据</summary>
    public string PkmDataBase64 { get; set; } = string.Empty;

    /// <summary>当前编辑面板的快照（避免修旧 base64）</summary>
    public PokemonEditRequest EditSnapshot { get; set; } = null!;

    /// <summary>要执行的修复动作。为空/"all" 时执行全部可用修复。</summary>
    public string[]? FixActions { get; set; }

    /// <summary>训练家来源存档 ID</summary>
    public Guid? TrainerSaveFileId { get; set; }

    /// <summary>目标游戏版本（覆盖存档版本）</summary>
    public int? TargetGameVersion { get; set; }
}

/// <summary>
/// 请求: 仅解析 Showdown 文本预览（不执行遭遇搜索生成）。
/// </summary>
public class ShowdownParseRequest
{
    public string ShowdownText { get; set; } = string.Empty;
}
