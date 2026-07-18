using Dapper;
using Npgsql;
using PKHeX.Core;
using PkManager.Server.Helpers;
using PkManager.Server.Localization;
using PkManager.Server.Models.Entity;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

/// <summary>
/// L.7 配信功能 — Wonder Card 注入/查询/移除服务
/// 通过直接修改 SaveFile 的 MysteryGift 存储块（MysteryBlock6/7）实现，
/// 无需模拟器层级改动。详见 docs/配信功能-技术文档.md。
/// </summary>
public class MysteryGiftService
{
    private readonly NpgsqlConnection _db;
    private readonly SaveFileService _saveFileService;
    private readonly IWebHostEnvironment _env;
    private readonly IBackendMessageLocalizer _messages;
    private readonly IPkhexStringProvider _pkhexStrings;
    private readonly ILanguageResolver _languageResolver;
    private readonly ILogger<MysteryGiftService> _logger;

    public MysteryGiftService(
        NpgsqlConnection db,
        SaveFileService saveFileService,
        IWebHostEnvironment env,
        IBackendMessageLocalizer messages,
        IPkhexStringProvider pkhexStrings,
        ILanguageResolver languageResolver,
        ILogger<MysteryGiftService> logger)
    {
        _db = db;
        _saveFileService = saveFileService;
        _env = env;
        _messages = messages;
        _pkhexStrings = pkhexStrings;
        _languageResolver = languageResolver;
        _logger = logger;
    }

    private string Text(string key, params object?[] args) => _messages.Get(key, args);

    // ═══════════════════════════════════════════════════════════
    //  查询
    // ═══════════════════════════════════════════════════════════

    /// <summary>
    /// 列出当前存档已注入的 wonder card 列表（按槽位顺序）。
    /// </summary>
    public async Task<List<MysteryGiftSlotDto>> ListInjectedAsync(Guid userId, Guid saveFileId)
    {
        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        var storage = GetMysteryGiftStorage(sav);
        if (storage is null)
            throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        var result = new List<MysteryGiftSlotDto>();
        for (var i = 0; i < storage.GiftCountMax; i++)
        {
            var gift = storage.GetMysteryGift(i);
            if (gift is null || IsEmpty(gift)) continue;
            result.Add(ToSlotDto(i, gift));
        }
        return result;
    }

    /// <summary>
    /// 列出可注入的 wonder card（按 gameVersion + language 过滤），从 wonder_cards 索引表查询。
    /// </summary>
    public async Task<List<WonderCardDto>> ListAvailableAsync(Guid userId, Guid saveFileId, string? language = null)
    {
        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        if (sav is not IMysteryGiftStorageProvider)
            throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        // 存档游戏版本 → 文件名 gameTag 过滤（XY → X/Y/XY；ORAS → ORAS；SM → SM；USUM → USUM）
        var gameTags = GetCompatibleGameTags(sav);
        if (gameTags.Count == 0)
            throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        var langs = new List<string> { "ENG" };
        if (!string.IsNullOrEmpty(language))
        {
            langs = MapUiLangToCardLang(language);
        }
        else
        {
            // 默认按账号语言回退 — 找不到时回退到 ENG
            var userLang = await ResolveUserPreferredLangAsync(userId);
            langs = MapUiLangToCardLang(userLang);
        }

        const string sql = """
            SELECT id, card_id AS CardId, game_version AS GameVersion, title, description,
                   species_id AS SpeciesId, item_id AS ItemId, language, card_type AS CardType,
                   file_path AS FilePath, release_date AS ReleaseDate
            FROM wonder_cards
            WHERE game_version = ANY(@GameTags)
              AND language = ANY(@Langs)
            ORDER BY release_date DESC NULLS LAST, card_id
            """;
        var rows = await _db.QueryAsync<WonderCardDto>(sql, new { GameTags = gameTags, Langs = langs });
        return rows.ToList();
    }

    // ═══════════════════════════════════════════════════════════
    //  注入
    // ═══════════════════════════════════════════════════════════

    /// <summary>
    /// 将指定 wonder card 注入到存档的第一个空槽位（或指定槽位）。
    /// </summary>
    public async Task<MysteryGiftSlotDto> InjectAsync(Guid userId, Guid saveFileId, Guid cardId, int? slot = null)
    {
        var card = await LoadCardAsync(cardId)
            ?? throw BusinessException.FromKey("mysteryGift.cardNotFound", 404);

        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        var storage = GetMysteryGiftStorage(sav)
            ?? throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        // 校验版本兼容性 — XY 存档不能注入 ORAS 专属卡
        var compatibleTags = GetCompatibleGameTags(sav);
        if (!compatibleTags.Contains(card.GameVersion))
            throw BusinessException.FromKey("mysteryGift.incompatibleGameVersion", 400, card.GameVersion);

        // 从磁盘读取 wonder card 文件本体
        var absPath = Path.IsPathRooted(card.FilePath)
            ? card.FilePath
            : Path.Combine(_env.ContentRootPath, card.FilePath);
        if (!File.Exists(absPath))
            throw BusinessException.FromKey("mysteryGift.fileMissing", 500);
        var bytes = await File.ReadAllBytesAsync(absPath);
        var ext = "." + card.CardType.ToLowerInvariant();
        var gift = MysteryGift.GetMysteryGift(bytes, ext)
            ?? throw BusinessException.FromKey("mysteryGift.parseFailed", 500);

        // 找空槽位
        var targetSlot = slot ?? FindEmptySlot(storage);
        if (targetSlot < 0)
            throw BusinessException.FromKey("mysteryGift.noEmptySlot", 400);

        storage.SetMysteryGift(targetSlot, gift);

        await _saveFileService.WriteBackSave(sf, userId, sav);

        _logger.LogInformation("[Wonder] 注入 cardId={CardId} 到存档 {SaveFileId} 槽位 {Slot}",
            card.CardId, saveFileId, targetSlot);
        return ToSlotDto(targetSlot, gift);
    }

    /// <summary>
    /// 移除指定槽位的 wonder card（清空槽位）。
    /// </summary>
    public async Task RemoveAsync(Guid userId, Guid saveFileId, int slot)
    {
        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        var storage = GetMysteryGiftStorage(sav)
            ?? throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        if (slot < 0 || slot >= storage.GiftCountMax)
            throw BusinessException.FromKey("mysteryGift.invalidSlot", 400);

        // 构造空卡（全 0 字节）写入槽位
        var emptyGift = CreateEmptyGift(storage);
        storage.SetMysteryGift(slot, emptyGift);

        await _saveFileService.WriteBackSave(sf, userId, sav);

        _logger.LogInformation("[Wonder] 移除存档 {SaveFileId} 槽位 {Slot}", saveFileId, slot);
    }

    /// <summary>
    /// 清空所有已注入的 wonder card（恢复存档至未接收状态）。
    /// </summary>
    public async Task ClearAllAsync(Guid userId, Guid saveFileId)
    {
        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        var storage = GetMysteryGiftStorage(sav)
            ?? throw BusinessException.FromKey("mysteryGift.unsupportedVersion", 400);

        var emptyGift = CreateEmptyGift(storage);
        for (var i = 0; i < storage.GiftCountMax; i++)
        {
            storage.SetMysteryGift(i, emptyGift);
        }

        await _saveFileService.WriteBackSave(sf, userId, sav);
        _logger.LogInformation("[Wonder] 清空存档 {SaveFileId} 全部 wonder card", saveFileId);
    }

    // ═══════════════════════════════════════════════════════════
    //  辅助
    // ═══════════════════════════════════════════════════════════

    private static IMysteryGiftStorage? GetMysteryGiftStorage(PKHeX.Core.SaveFile sav) =>
        sav is IMysteryGiftStorageProvider provider ? provider.MysteryGiftStorage : null;

    private static bool IsEmpty(DataMysteryGift gift) => gift.IsEmpty;

    private static int FindEmptySlot(IMysteryGiftStorage storage)
    {
        for (var i = 0; i < storage.GiftCountMax; i++)
        {
            var gift = storage.GetMysteryGift(i);
            if (gift is null || IsEmpty(gift)) return i;
        }
        return -1;
    }

    private static DataMysteryGift CreateEmptyGift(IMysteryGiftStorage storage)
    {
        // 通过反射构造对应类型的空礼物（WC6/WC7）
        var sample = storage.GetMysteryGift(0);
        var type = sample?.GetType() ?? typeof(WC6);
        var size = (int)(type.GetField("Size")?.GetRawConstantValue() ?? 0x108);
        var empty = new byte[size];
        return (DataMysteryGift)Activator.CreateInstance(type, new object[] { empty })!;
    }

    private MysteryGiftSlotDto ToSlotDto(int slot, DataMysteryGift gift)
    {
        var speciesName = string.Empty;
        if (gift.Species > 0)
        {
            try { speciesName = _pkhexStrings.GetStrings().Species[gift.Species]; }
            catch { /* 越界则忽略 */ }
        }
        return new MysteryGiftSlotDto
        {
            Slot = slot,
            CardId = gift.CardID,
            Title = gift.CardTitle?.Replace('　', ' ').Trim() ?? string.Empty,
            SpeciesId = gift.Species > 0 ? (int)gift.Species : null,
            SpeciesName = speciesName,
            ItemId = gift.ItemID > 0 ? gift.ItemID : null,
            CardType = gift.Extension,
            IsItem = gift.IsItem,
            IsEntity = gift.IsEntity,
        };
    }

    private async Task<WonderCard?> LoadCardAsync(Guid cardId)
    {
        const string sql = "SELECT * FROM wonder_cards WHERE id = @Id";
        return await _db.QueryFirstOrDefaultAsync<WonderCard>(sql, new { Id = cardId });
    }

    private async Task<string> ResolveUserPreferredLangAsync(Guid userId)
    {
        const string sql = "SELECT preferred_lang FROM users WHERE id = @Id";
        var lang = await _db.QueryFirstOrDefaultAsync<string>(sql, new { Id = userId });
        return lang ?? "zh-Hans";
    }

    /// <summary>
    /// 把 UI 语言代码（zh-Hans/en/ja/...）映射为 EventsGallery 文件名使用的语言标签（CHS/ENG/JPN/...）。
    /// </summary>
    private static List<string> MapUiLangToCardLang(string uiLang)
    {
        // 找不到时回退到 ENG（最大覆盖）
        var primary = uiLang?.ToLowerInvariant() switch
        {
            "zh-hans" or "zh-cn" => "CHS",
            "zh-hant" or "zh-tw" => "CHT",
            "en" or "en-us" => "ENG",
            "ja" or "ja-jp" => "JPN",
            "fr" or "fr-fr" => "FRE",
            "it" or "it-it" => "ITA",
            "de" or "de-de" => "GER",
            "es" or "es-es" => "SPA",
            "es-419" => "SPA",
            "ko" or "ko-kr" => "KOR",
            _ => "ENG"
        };
        // 主语言 + ENG 回退
        return primary == "ENG" ? new List<string> { "ENG" } : new List<string> { primary, "ENG" };
    }

    /// <summary>
    /// 根据存档版本返回兼容的文件名 gameTag 列表（用于查询 wonder_cards）。
    /// SM/USUM 之间可互相接收，XY/ORAS 之间可互相接收 — 返回全部兼容 tag 让前端选。
    /// </summary>
    private static List<string> GetCompatibleGameTags(PKHeX.Core.SaveFile sav)
    {
        var ver = sav.Version;
        return ver switch
        {
            GameVersion.X => new List<string> { "X", "Y", "XY" },
            GameVersion.Y => new List<string> { "X", "Y", "XY" },
            GameVersion.AS => new List<string> { "OR", "AS", "ORAS" },
            GameVersion.OR => new List<string> { "OR", "AS", "ORAS" },
            GameVersion.SN => new List<string> { "S", "M", "SM" },
            GameVersion.MN => new List<string> { "S", "M", "SM" },
            GameVersion.UM => new List<string> { "US", "UM", "USUM" },
            GameVersion.US => new List<string> { "US", "UM", "USUM" },
            _ => new List<string>()
        };
    }
}
