using System.IO.Compression;
using System.Text.Json;
using Dapper;
using Npgsql;
using PKHeX.Core;
using PkManager.Server.Models.Entity;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

/// <summary>
/// 个人宝可梦银行服务 — 增删改查、从存档导入
/// </summary>
public class BankService
{
    private readonly NpgsqlConnection _db;
    private readonly ParseService _parseService;
    private readonly SaveFileService _saveFileService;
    private readonly PokemonEditService _editService;

    public BankService(NpgsqlConnection db, ParseService parseService, SaveFileService saveFileService, PokemonEditService editService)
    {
        _db = db;
        _parseService = parseService;
        _saveFileService = saveFileService;
        _editService = editService;
    }

    /// <summary>
    /// 查询银行列表（分页+筛选+搜索）
    /// </summary>
    public async Task<BankListResult> GetBankList(Guid userId, BankFilter filter)
    {
        var where = "WHERE user_id = @UserId";
        var parameters = new DynamicParameters();
        parameters.Add("UserId", userId);

        if (filter.Generation.HasValue)
        {
            where += " AND generation = @Generation";
            parameters.Add("Generation", filter.Generation.Value);
        }

        if (filter.IsShiny.HasValue)
        {
            where += " AND is_shiny = @IsShiny";
            parameters.Add("IsShiny", filter.IsShiny.Value);
        }

        if (filter.Nature.HasValue)
        {
            where += " AND nature = @Nature";
            parameters.Add("Nature", filter.Nature.Value);
        }

        if (filter.Ability.HasValue)
        {
            where += " AND ability = @Ability";
            parameters.Add("Ability", filter.Ability.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            where += " AND (species_name ILIKE @Search OR nickname ILIKE @Search)";
            parameters.Add("Search", $"%{filter.Search}%");
        }

        // 排序（白名单防注入）
        var orderBy = filter.SortBy switch
        {
            "level" => "level",
            "species" => "species",
            _ => "created_at"
        };
        var dir = filter.SortAsc ? "ASC" : "DESC";

        // 计数
        var countSql = $"SELECT COUNT(*) FROM bank_pokemon {where}";
        var total = await _db.ExecuteScalarAsync<int>(countSql, parameters);

        // 分页查询
        var page = filter.Page;
        var pageSize = filter.PageSize;
        var offset = (page - 1) * pageSize;

        var dataSql = $@"
            SELECT id, species, species_name AS SpeciesName, nickname, level,
                   nature_name AS NatureName, ability_name AS AbilityName,
                   generation, game_version AS GameVersion, is_shiny AS IsShiny,
                   is_egg AS IsEgg, is_valid AS IsValid,
                   COALESCE((pokemon_json->>'isAlpha')::boolean, FALSE) AS IsAlpha,
                   COALESCE((pokemon_json->>'canGigantamax')::boolean, FALSE) AS CanGigantamax,
                   NULLIF(pokemon_json->>'heldItemName', '') AS HeldItemName,
                   source, source_save_id AS SourceSaveId, notes,
                   created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM bank_pokemon {where}
            ORDER BY {orderBy} {dir}, id ASC
            LIMIT @PageSize OFFSET @Offset";

        parameters.Add("PageSize", pageSize);
        parameters.Add("Offset", offset);

        var items = (await _db.QueryAsync<BankPokemonDto>(dataSql, parameters)).ToList();

        return new BankListResult
        {
            Total = total,
            Page = page,
            PageSize = pageSize,
            Items = items
        };
    }

    /// <summary>
    /// 获取银行中单只宝可梦详情
    /// </summary>
    public async Task<PokemonDto?> GetBankDetail(Guid bankPokemonId, Guid userId)
    {
        var record = await _db.QueryFirstOrDefaultAsync<BankPokemon>(
            "SELECT * FROM bank_pokemon WHERE id = @Id AND user_id = @UserId",
            new { Id = bankPokemonId, UserId = userId });

        if (record == null) return null;

        var pokemon = JsonSerializer.Deserialize<PokemonDto>(record.PokemonJson ?? "{}");
        if (pokemon != null)
        {
            pokemon.Id = record.Id;
            pokemon.PkmDataBase64 = record.PkmDataBase64;
        }
        return pokemon;
    }

    /// <summary>
    /// 从存档格子存入银行
    /// </summary>
    public async Task<Guid> AddToBank(Guid userId, PokemonDto pokemon, string? pkmDataBase64, Guid? sourceSaveId = null)
    {
        var bankId = Guid.NewGuid();
        var pokemonJson = JsonSerializer.Serialize(pokemon);

        await _db.ExecuteAsync(@"
            INSERT INTO bank_pokemon (id, user_id, species, species_name, nickname, level,
                nature, nature_name, ability, ability_name, generation, is_shiny, is_egg,
                is_valid, pokemon_json, pkm_data_base64, source, source_save_id)
            VALUES (@Id, @UserId, @Species, @SpeciesName, @Nickname, @Level,
                @Nature, @NatureName, @Ability, @AbilityName, @Generation, @IsShiny, @IsEgg,
                @IsValid, @PokemonJson::jsonb, @PkmDataBase64, @Source, @SourceSaveId)",
            new
            {
                Id = bankId,
                UserId = userId,
                pokemon.Species,
                pokemon.SpeciesName,
                pokemon.Nickname,
                pokemon.Level,
                pokemon.Nature,
                pokemon.NatureName,
                pokemon.Ability,
                pokemon.AbilityName,
                Generation = 0, // Will be updated when saving from save file
                pokemon.IsShiny,
                pokemon.IsEgg,
                pokemon.IsValid,
                PokemonJson = pokemonJson,
                PkmDataBase64 = pkmDataBase64,
                Source = sourceSaveId != null ? "save_import" : "manual",
                SourceSaveId = sourceSaveId
            });

        return bankId;
    }

    /// <summary>
    /// 从存档存入银行（完整事务：删除存档格子 + 插入银行）
    /// </summary>
    public async Task<(Guid bankId, PokemonDto pokemon)> MoveFromSave(
        Guid userId, Guid saveFileId, int boxIndex, int slotIndex)
    {
        // 读取存档二进制 → 解析盒子 → 获取指定槽位 PKM
        var pkm = _saveFileService.ReadBoxSlot(saveFileId, userId, boxIndex, slotIndex);
        if (pkm == null) throw new BusinessException("该位置没有宝可梦");

        // Map to DTO
        var pokemon = ParseService.MapToPokemonDto(pkm);
        var pkmDataBase64 = Convert.ToBase64String(pkm.DecryptedPartyData);

        // 获取世代
        var saveFile = await _db.QueryFirstOrDefaultAsync<Models.Entity.SaveFile>(
            "SELECT generation FROM save_files WHERE id = @Id", new { Id = saveFileId });
        var generation = saveFile?.Generation ?? 0;

        // 插入银行
        var bankId = Guid.NewGuid();
        await _db.ExecuteAsync(@"
            INSERT INTO bank_pokemon (id, user_id, species, species_name, nickname, level,
                nature, nature_name, ability, ability_name, generation,
                is_shiny, is_egg, is_valid, pokemon_json, pkm_data_base64,
                source, source_save_id)
            VALUES (@Id, @UserId, @Species, @SpeciesName, @Nickname, @Level,
                @Nature, @NatureName, @Ability, @AbilityName, @Generation,
                @IsShiny, @IsEgg, @IsValid, @PokemonJson::jsonb, @PkmDataBase64,
                @Source, @SourceSaveId)",
            new
            {
                Id = bankId, UserId = userId,
                pokemon.Species, pokemon.SpeciesName,
                pokemon.Nickname, pokemon.Level,
                pokemon.Nature, pokemon.NatureName,
                pokemon.Ability, pokemon.AbilityName,
                Generation = generation,
                pokemon.IsShiny, pokemon.IsEgg,
                IsValid = true,
                PokemonJson = JsonSerializer.Serialize(pokemon),
                PkmDataBase64 = pkmDataBase64,
                Source = "save_import",
                SourceSaveId = saveFileId
            });

        // 清空存档槽位
        await _saveFileService.ClearBoxSlot(saveFileId, userId, boxIndex, slotIndex);

        pokemon.Id = bankId;
        return (bankId, pokemon);
    }

    /// <summary>
    /// 从银行删除宝可梦
    /// </summary>
    public async Task Delete(Guid bankPokemonId, Guid userId)
    {
        var deleted = await _db.ExecuteAsync(
            "DELETE FROM bank_pokemon WHERE id = @Id AND user_id = @UserId",
            new { Id = bankPokemonId, UserId = userId });

        if (deleted == 0)
            throw new BusinessException("宝可梦不存在", 404);
    }

    /// <summary>
    /// 批量删除
    /// </summary>
    public async Task<int> BatchDelete(List<Guid> ids, Guid userId)
    {
        var deleted = await _db.ExecuteAsync(
            "DELETE FROM bank_pokemon WHERE id = ANY(@Ids) AND user_id = @UserId",
            new { Ids = ids, UserId = userId });

        return deleted;
    }

    /// <summary>
    /// 批量导出为 .zip（.pk* 文件）
    /// </summary>
    public async Task<byte[]> BatchExport(List<Guid> ids, Guid userId)
    {
        var records = (await _db.QueryAsync<BankPokemon>(
            "SELECT id, species_name, nickname, pkm_data_base64 FROM bank_pokemon WHERE id = ANY(@Ids) AND user_id = @UserId",
            new { Ids = ids, UserId = userId })).ToList();

        if (records.Count == 0)
            throw new BusinessException("未找到可导出的宝可梦", 404);

        using var ms = new MemoryStream();
        using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var rec in records)
            {
                if (string.IsNullOrEmpty(rec.PkmDataBase64)) continue;

                var pkm = EntityFormat.GetFromBytes(Convert.FromBase64String(rec.PkmDataBase64));
                if (pkm == null) continue;

                var data = _editService.ExportSinglePkm(pkm);
                var ext = $"pk{Math.Max(1, (int)pkm.Format)}";
                var name = SanitizeFileName(rec.SpeciesName ?? "unknown");
                var nick = string.IsNullOrWhiteSpace(rec.Nickname) ? null : SanitizeFileName(rec.Nickname);
                var label = nick ?? name;
                var shortId = rec.Id.ToString("N")[..8];
                var fileName = $"{label}_{shortId}.{ext}";

                // Deduplicate
                var entry = archive.CreateEntry(fileName, CompressionLevel.Fastest);
                using var es = entry.Open();
                es.Write(data, 0, data.Length);
            }
        }

        ms.Position = 0;
        return ms.ToArray();
    }

    /// <summary>
    /// 批量移动到存档（一箱、自动找空位）
    /// </summary>
    public async Task<BatchMoveResult> BatchMoveToSave(List<Guid> ids, Guid saveFileId, int targetBoxIndex, Guid userId)
    {
        if (ids.Count == 0)
            throw new BusinessException("请选择要移动的宝可梦", 400);

        // 加载存档
        var (sf, sav) = await _saveFileService.LoadSave(saveFileId, userId);
        var boxData = sav.GetBoxData(targetBoxIndex);
        var capacity = boxData.Length;

        // 找空位
        var emptySlots = new List<int>();
        for (int i = 0; i < capacity; i++)
        {
            if (boxData[i].Species == 0)
                emptySlots.Add(i);
        }

        if (emptySlots.Count == 0)
            throw new BusinessException("目标箱子已满");

        // 读取银行宝可梦
        var records = (await _db.QueryAsync<BankPokemon>(
            "SELECT * FROM bank_pokemon WHERE id = ANY(@Ids) AND user_id = @UserId",
            new { Ids = ids, UserId = userId })).ToList();

        if (records.Count == 0)
            throw new BusinessException("未找到可移动的宝可梦", 404);

        var recordMap = records.ToDictionary(r => r.Id);

        // 分配到空位（追踪成功/失败）
        var moved = 0;
        var movedIds = new List<Guid>();
        var failedIds = new List<Guid>();
        var slotIndex = 0;

        foreach (var id in ids)
        {
            if (!recordMap.TryGetValue(id, out var rec))
            {
                failedIds.Add(id);
                continue;
            }

            if (slotIndex >= emptySlots.Count)
            {
                failedIds.Add(id);
                continue;
            }

            if (string.IsNullOrEmpty(rec.PkmDataBase64))
            {
                failedIds.Add(rec.Id);
                continue;
            }

            PKM? pkm;
            try
            {
                pkm = EntityFormat.GetFromBytes(Convert.FromBase64String(rec.PkmDataBase64));
            }
            catch
            {
                failedIds.Add(rec.Id);
                continue;
            }

            if (pkm == null)
            {
                failedIds.Add(rec.Id);
                continue;
            }

            // 兼容转换（仿 SaveFileService.MoveFromBank 路径）
            var compat = sav.GetCompatiblePKM(pkm);
            if (compat == null)
            {
                failedIds.Add(rec.Id);
                continue;
            }

            boxData[emptySlots[slotIndex]] = compat;
            movedIds.Add(rec.Id);
            moved++;
            slotIndex++;
        }

        if (moved > 0)
        {
            sav.SetBoxData(boxData, targetBoxIndex);
            await _saveFileService.WriteBackSave(sf, userId, sav);
        }

        // 只删除成功移动的记录
        if (movedIds.Count > 0)
        {
            await _db.ExecuteAsync(
                "DELETE FROM bank_pokemon WHERE id = ANY(@Ids) AND user_id = @UserId",
                new { Ids = movedIds, UserId = userId });
        }

        return new BatchMoveResult
        {
            MovedCount = moved,
            FailedCount = failedIds.Count,
            FailedIds = failedIds
        };
    }

    /// <summary>
    /// 文件名安全化
    /// </summary>
    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sanitized = new string(name.Where(c => !invalid.Contains(c)).ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? "pokemon" : sanitized;
    }
}

// ── 辅助类型 ────────────────────────────────────────────

public class BankFilter
{
    public int? Generation { get; set; }
    public bool? IsShiny { get; set; }
    public int? Nature { get; set; }
    public int? Ability { get; set; }
    public string? SortBy { get; set; }    // "created" | "level" | "species"
    public bool SortAsc { get; set; }
    public string? Search { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class BankListResult
{
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public List<BankPokemonDto> Items { get; set; } = new();
}

public class BankPokemonDto
{
    public Guid Id { get; set; }
    public int Species { get; set; }
    public string SpeciesName { get; set; } = string.Empty;
    public string? Nickname { get; set; }
    public int Level { get; set; }
    public string? NatureName { get; set; }
    public string? AbilityName { get; set; }
    public int Generation { get; set; }
    public int? GameVersion { get; set; }
    public bool IsShiny { get; set; }
    public bool IsEgg { get; set; }
    public bool IsValid { get; set; }
    public bool IsAlpha { get; set; }
    public bool CanGigantamax { get; set; }
    public string? HeldItemName { get; set; }
    public string? Source { get; set; }
    public Guid? SourceSaveId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class BatchMoveResult
{
    public int MovedCount { get; set; }
    public int FailedCount { get; set; }
    public List<Guid> FailedIds { get; set; } = new();
}
