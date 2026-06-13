namespace PkManager.Server.Models.Request;

/// <summary>
/// 请求: 将遭遇模板的约束字段应用到当前编辑中的宝可梦（不写盘）。
/// </summary>
public class EncounterApplyRequest
{
    /// <summary>搜索结果中的重算 Token（base64 编码的搜索参数 + 结果序号）</summary>
    public string RecomputeToken { get; set; } = string.Empty;

    /// <summary>当前宝可梦的 Base64 二进制数据</summary>
    public string PkmDataBase64 { get; set; } = string.Empty;

    /// <summary>当前编辑面板的完整快照（保护未保存修改不被旧 base64 覆盖）</summary>
    public PokemonEditRequest EditSnapshot { get; set; } = null!;

    /// <summary>目标存档 ID（用于提取训练家信息）</summary>
    public Guid SaveFileId { get; set; }
}
