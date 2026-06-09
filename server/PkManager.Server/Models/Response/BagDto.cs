namespace PkManager.Server.Models.Response;

/// <summary>
/// 背包完整数据 — 包含 capability 描述和多 Pouch 道具列表
/// </summary>
public class BagDto
{
    public BagCapability Capability { get; set; } = new();
    public List<PouchDto> Pouches { get; set; } = [];
}

/// <summary>
/// 背包能力描述 — 指示该存档支持的道具特性（前端按此条件渲染，不硬编码 generation）
/// </summary>
public class BagCapability
{
    /// <summary>是否支持道具收藏（Gen7+ IItemFavorite）</summary>
    public bool HasFavorite { get; set; }

    /// <summary>是否支持新物品标记（Gen7+ IItemNewFlag）</summary>
    public bool HasNewFlag { get; set; }

    /// <summary>是否支持自由空间（Gen8+ IItemFreeSpace）</summary>
    public bool HasFreeSpace { get; set; }

    /// <summary>该存档的最大道具 ID（sav.MaxItemID）</summary>
    public int MaxItemID { get; set; }
}

/// <summary>
/// 单个 Pouch（道具分类袋）
/// </summary>
public class PouchDto
{
    /// <summary>InventoryType 枚举名：Items, Medicine, TMHMs, Berries, Balls, etc.</summary>
    public string Type { get; set; } = "";

    /// <summary>该 Pouch 单物品最大堆叠数</summary>
    public int MaxCount { get; set; }

    /// <summary>物品槽位列表（含空格）</summary>
    public List<BagItemDto> Items { get; set; } = [];
}

/// <summary>
/// 单个道具槽位
/// </summary>
public class BagItemDto
{
    /// <summary>道具 ID（0 = 空格）</summary>
    public int Index { get; set; }

    /// <summary>数量</summary>
    public int Count { get; set; }

    /// <summary>是否收藏（仅 HasFavorite 时有效）</summary>
    public bool? IsFavorite { get; set; }

    /// <summary>是否新物品（仅 HasNewFlag 时有效）</summary>
    public bool? IsNew { get; set; }

    /// <summary>是否自由空间格（仅 HasFreeSpace / Gen7 LGPE 时有效）</summary>
    public bool? IsFreeSpace { get; set; }
}
