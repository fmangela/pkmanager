namespace PkManager.Server.Models.Response;

/// <summary>
/// L.7 配信功能 — Wonder Card 索引（来自 wonder_cards 表，用于列表展示）
/// </summary>
public class WonderCardDto
{
    public Guid Id { get; set; }
    public int CardId { get; set; }
    public string GameVersion { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? SpeciesId { get; set; }
    public int? ItemId { get; set; }
    public string Language { get; set; } = string.Empty;
    public string CardType { get; set; } = string.Empty;
    public DateOnly? ReleaseDate { get; set; }
}

/// <summary>
/// L.7 配信功能 — 已注入到存档槽位的 wonder card
/// </summary>
public class MysteryGiftSlotDto
{
    public int Slot { get; set; }
    public int CardId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int? SpeciesId { get; set; }
    public string? SpeciesName { get; set; }
    public int? ItemId { get; set; }
    public string CardType { get; set; } = string.Empty;
    public bool IsItem { get; set; }
    public bool IsEntity { get; set; }
}

/// <summary>
/// L.7 配信功能 — 注入响应（注入后返回槽位信息 + 卡片索引）
/// </summary>
public class MysteryGiftInjectResultDto
{
    public MysteryGiftSlotDto Slot { get; set; } = new();
    public Guid CardId { get; set; }
}
