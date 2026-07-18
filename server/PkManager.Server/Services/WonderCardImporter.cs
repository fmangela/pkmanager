using System.Globalization;
using System.Text.RegularExpressions;
using Dapper;
using Npgsql;
using PKHeX.Core;
using PkManager.Server.Models.Entity;

namespace PkManager.Server.Services;

/// <summary>
/// L.7 配信功能 — Wonder Card 种子导入器
/// 扫描 data/wondercards/{gen6,gen7}/，用 PKHeX.Core 解析 .wc6/.wc7 元数据，
/// UPSERT 到 wonder_cards 表。详见 docs/配信功能-技术文档.md。
/// </summary>
public class WonderCardImporter
{
    private readonly NpgsqlConnection _db;
    private readonly ILogger<WonderCardImporter> _logger;
    private readonly IWebHostEnvironment _env;

    public WonderCardImporter(NpgsqlConnection db, ILogger<WonderCardImporter> logger, IWebHostEnvironment env)
    {
        _db = db;
        _logger = logger;
        _env = env;
    }

    // 文件名格式：{cardId} {gameTag} - {description} ({lang})[ (flags)].{ext}
    // 例：0043 X - XY Charizard with Charizardite Y (ENG).wc6
    //     0000 SMUSUM - (Trainer) Decidueye (CHS).wc7
    //     0011 XY - XY Garchomp (ENG) (P).wc6full
    private static readonly Regex FileNameRegex = new(
        @"^(?<cardId>\d+)\s+(?<gameTag>[A-Za-z]+)\s+-\s+(?<description>.+?)\s+\((?<lang>[A-Za-z0-9]+)\)(?:\s+\((?<flags>[PFM]+)\))?\.(?<ext>wc[67](?:full)?)$",
        RegexOptions.Compiled);

    public async Task<WonderCardImportResult> ImportAllAsync(CancellationToken ct = default)
    {
        var root = Path.Combine(_env.ContentRootPath, "data", "wondercards");
        var result = new WonderCardImportResult();

        if (!Directory.Exists(root))
        {
            _logger.LogWarning("[Wonder] data/wondercards/ 不存在，跳过导入");
            return result;
        }

        var subdirs = new[] { "gen6", "gen7" };
        foreach (var sub in subdirs)
        {
            var dir = Path.Combine(root, sub);
            if (!Directory.Exists(dir))
            {
                _logger.LogInformation("[Wonder] 跳过不存在的目录: {Dir}", dir);
                continue;
            }

            var files = Directory.EnumerateFiles(dir)
                .Where(f => f.EndsWith(".wc6", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".wc6full", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".wc7", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".wc7full", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var file in files)
            {
                ct.ThrowIfCancellationRequested();
                await ImportOneAsync(file, sub, result);
            }
        }

        _logger.LogInformation("[Wonder] 导入完成：成功 {Ok}，跳过 {Skip}，失败 {Fail}",
            result.Ok, result.Skipped, result.Failed);
        return result;
    }

    private async Task ImportOneAsync(string filePath, string genSubdir, WonderCardImportResult result)
    {
        var fileName = Path.GetFileName(filePath);
        var match = FileNameRegex.Match(fileName);
        if (!match.Success)
        {
            _logger.LogWarning("[Wonder] 文件名无法解析，跳过: {File}", fileName);
            result.Skipped++;
            return;
        }

        try
        {
            var bytes = await File.ReadAllBytesAsync(filePath);
            var ext = "." + match.Groups["ext"].Value.ToLowerInvariant();
            var gift = MysteryGift.GetMysteryGift(bytes, ext);
            if (gift is null)
            {
                _logger.LogWarning("[Wonder] PKHeX 无法识别为 wonder card: {File}", fileName);
                result.Failed++;
                return;
            }

            var cardId = gift.CardID;
            var title = gift.CardTitle?.Replace('　', ' ').Trim() ?? string.Empty;
            int? speciesId = gift.Species > 0 ? (int)gift.Species : null;
            int? itemId = gift.ItemID > 0 ? gift.ItemID : null;
            var releaseDate = ExtractDate(gift);

            var gameVersion = match.Groups["gameTag"].Value.ToUpperInvariant();
            var language = match.Groups["lang"].Value.ToUpperInvariant();
            var description = match.Groups["description"].Value;
            var cardType = ext.TrimStart('.').ToLowerInvariant();

            // 规范化 file_path 为相对路径（相对 ContentRootPath），避免机器相关绝对路径
            var relPath = Path.GetRelativePath(_env.ContentRootPath, filePath)
                .Replace('\\', '/');

            await _db.ExecuteAsync("""
                INSERT INTO wonder_cards
                    (card_id, game_version, title, description, species_id, item_id,
                     language, card_type, file_path, release_date)
                VALUES
                    (@CardId, @GameVersion, @Title, @Description, @SpeciesId, @ItemId,
                     @Language, @CardType, @FilePath, @ReleaseDate)
                ON CONFLICT (card_id, game_version, language, card_type) DO UPDATE SET
                    title        = EXCLUDED.title,
                    description  = EXCLUDED.description,
                    species_id   = EXCLUDED.species_id,
                    item_id      = EXCLUDED.item_id,
                    file_path    = EXCLUDED.file_path,
                    release_date = EXCLUDED.release_date
                """,
                new
                {
                    CardId = cardId,
                    GameVersion = gameVersion,
                    Title = title,
                    Description = description,
                    SpeciesId = speciesId,
                    ItemId = itemId,
                    Language = language,
                    CardType = cardType,
                    FilePath = relPath,
                    ReleaseDate = releaseDate
                });

            result.Ok++;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Wonder] 解析失败: {File}", fileName);
            result.Failed++;
        }
    }

    /// <summary>
    /// 从 MysteryGift 提取发布日期。WC6/WC7 暴露 Date 属性，但基类 MysteryGift 无此属性，
    /// 用反射安全访问 — 升级 PKHeX 时若 API 变化只需在此补分支。
    /// </summary>
    private static DateOnly? ExtractDate(MysteryGift gift)
    {
        var prop = gift.GetType().GetProperty("Date");
        if (prop?.GetValue(gift) is DateOnly d)
            return d;
        return null;
    }
}

public class WonderCardImportResult
{
    public int Ok { get; set; }
    public int Skipped { get; set; }
    public int Failed { get; set; }
}
