namespace PkManager.Server.Models.Entity;

/// <summary>
/// 配信 Wonder Card 完整数据 — 二进制本体在 RawData 列，
/// 文件镜像在 client/public/assets/wondercards/{gen6,gen7}/。
/// 详见 docs/配信功能-技术文档.md。
/// </summary>
public class WonderCard
{
    public Guid Id { get; set; }
    public int CardId { get; set; }              // Wonder Card 内部 ID (0-2047)
    public string GameVersion { get; set; } = string.Empty;  // 文件名 gameTag: X/Y/XY/ORAS/XYORAS/SM/USUM/SMUSUM
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? SpeciesId { get; set; }
    public int? ItemId { get; set; }
    public string Language { get; set; } = string.Empty;     // ENG/JPN/FRE/GER/ITA/SPA/KOR/CHS/CHT
    public string CardType { get; set; } = string.Empty;     // wc6/wc6full/wc7/wc7full
    public byte[] RawData { get; set; } = Array.Empty<byte>();  // Wonder Card 二进制本体
    public string? FilePath { get; set; }   // 素材文件相对仓库根路径，仅调试/审计
    public DateOnly? ReleaseDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
