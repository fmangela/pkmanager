using System.Text.Json;
using Dapper;
using Npgsql;
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

    public BankService(NpgsqlConnection db, ParseService parseService, SaveFileService saveFileService)
    {
        _db = db;
        _parseService = parseService;
        _saveFileService = saveFileService;
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

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            where += " AND (species_name ILIKE @Search OR nickname ILIKE @Search)";
            parameters.Add("Search", $"%{filter.Search}%");
        }

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
                   is_egg AS IsEgg, is_valid AS IsValid, source, notes,
                   created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM bank_pokemon {where}
            ORDER BY created_at DESC
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
}

// ── 辅助类型 ────────────────────────────────────────────

public class BankFilter
{
    public int? Generation { get; set; }
    public bool? IsShiny { get; set; }
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
    public string? Source { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
