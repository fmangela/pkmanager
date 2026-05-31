using Dapper;
using Npgsql;
using PKHeX.Core;
using PkManager.Server.Models.Entity;
using PkManager.Server.Models.Response;
using SaveFileEntity = PkManager.Server.Models.Entity.SaveFile;

namespace PkManager.Server.Services;

/// <summary>
/// 存档文件管理服务 — 所有操作直接读写 raw_save_data 二进制
/// </summary>
public class SaveFileService
{
    private readonly NpgsqlConnection _db;
    private readonly ParseService _parseService;

    public SaveFileService(NpgsqlConnection db, ParseService parseService)
    {
        _db = db;
        _parseService = parseService;
    }

    // ═══ 查询 ═══════════════════════════════════════════

    public async Task<List<SaveFileDto>> GetUserSaves(Guid userId)
    {
        var saves = await _db.QueryAsync<SaveFileEntity>(
            "SELECT * FROM save_files WHERE user_id = @UserId ORDER BY updated_at DESC",
            new { UserId = userId });
        return saves.Select(MapToDto).ToList();
    }

    public async Task<SaveFileDetailDto> GetSaveDetail(Guid saveFileId, Guid userId)
    {
        var saveFile = await LoadSaveFileEntity(saveFileId, userId);
        await _db.ExecuteAsync(
            "UPDATE save_files SET last_accessed_at = NOW() WHERE id = @Id",
            new { Id = saveFileId });

        // 直接从 raw_save_data 解析 — boxes + party 统一来源
        var parsed = _parseService.ParseSaveFile(saveFile.RawSaveData, saveFile.Filename);
        parsed.SaveFileId = saveFile.Id;
        parsed.IsModified = saveFile.IsModified;
        parsed.CreatedAt = saveFile.CreatedAt;
        parsed.UpdatedAt = saveFile.UpdatedAt;
        return parsed;
    }

    // ═══ 上传 / 删除 ══════════════════════════════════════

    public async Task<SaveFileDetailDto> UploadSave(Guid userId, byte[] rawData, string filename)
    {
        var parsed = _parseService.ParseSaveFile(rawData, filename);
        var saveFileId = Guid.NewGuid();

        await _db.ExecuteAsync(@"
            INSERT INTO save_files (id, user_id, filename, file_size, generation, game_version,
                trainer_name, trainer_id, secret_id, play_time, box_count, pokemon_count,
                is_valid_save, raw_save_data)
            VALUES (@Id, @UserId, @Filename, @FileSize, @Generation, @GameVersion,
                @TrainerName, @TrainerId, @SecretId, @PlayTime, @BoxCount, @PokemonCount,
                @IsValidSave, @RawSaveData)",
            new { Id = saveFileId, UserId = userId, parsed.Filename, parsed.FileSize, parsed.Generation,
                parsed.GameVersion, parsed.TrainerName, parsed.TrainerId, parsed.SecretId,
                parsed.PlayTime, parsed.BoxCount, parsed.PokemonCount,
                IsValidSave = true, RawSaveData = rawData });

        parsed.SaveFileId = saveFileId;
        return parsed;
    }

    public async Task DeleteSave(Guid saveFileId, Guid userId)
    {
        var deleted = await _db.ExecuteAsync(
            "DELETE FROM save_files WHERE id = @Id AND user_id = @UserId",
            new { Id = saveFileId, UserId = userId });
        if (deleted == 0) throw new BusinessException("存档不存在", 404);
    }

    // ═══ 修改操作（直接写二进制）══════════════════════════

    public async Task MoveSlot(Guid saveFileId, Guid userId,
        int fromBox, int fromSlot, int toBox, int toSlot)
    {
        var (_, sav) = await LoadSave(saveFileId, userId);
        if (fromBox == toBox)
        {
            // Same box: swap in one array to avoid overwrite
            var boxData = sav.GetBoxData(fromBox);
            var temp = boxData[fromSlot];
            boxData[fromSlot] = boxData[toSlot];
            boxData[toSlot] = temp;
            sav.SetBoxData(boxData, fromBox);
        }
        else
        {
            var boxA = sav.GetBoxData(fromBox);
            var boxB = sav.GetBoxData(toBox);
            var temp = boxA[fromSlot];
            boxA[fromSlot] = boxB[toSlot];
            boxB[toSlot] = temp;
            sav.SetBoxData(boxA, fromBox);
            sav.SetBoxData(boxB, toBox);
        }
        await WriteBackSave(saveFileId, sav);
    }

    public async Task MoveFromBank(Guid saveFileId, Guid userId,
        Guid bankPokemonId, int targetBoxIndex, int targetSlotIndex)
    {
        var (_, sav) = await LoadSave(saveFileId, userId);
        var bankPkm = await _db.QueryFirstOrDefaultAsync<BankPokemon>(
            "SELECT * FROM bank_pokemon WHERE id = @Id AND user_id = @UserId",
            new { Id = bankPokemonId, UserId = userId })
            ?? throw new BusinessException("银行宝可梦不存在", 404);

        var boxData = sav.GetBoxData(targetBoxIndex);
        if (!string.IsNullOrEmpty(bankPkm.PkmDataBase64))
        {
            var pkm = EntityFormat.GetFromBytes(Convert.FromBase64String(bankPkm.PkmDataBase64));
            if (pkm != null) boxData[targetSlotIndex] = pkm;
        }
        sav.SetBoxData(boxData, targetBoxIndex);

        await _db.ExecuteAsync("DELETE FROM bank_pokemon WHERE id = @Id", new { Id = bankPkm.Id });
        await WriteBackSave(saveFileId, sav);
    }

    public async Task SwapBoxes(Guid saveFileId, Guid userId, int boxA, int boxB)
    {
        if (boxA == boxB) return;
        var (_, sav) = await LoadSave(saveFileId, userId);
        var dataA = sav.GetBoxData(boxA);
        var dataB = sav.GetBoxData(boxB);
        sav.SetBoxData(dataB, boxA);
        sav.SetBoxData(dataA, boxB);
        await WriteBackSave(saveFileId, sav);
    }

    /// <summary>直接写入 Box 指定槽位（用于宝可梦编辑）</summary>
    public async Task WriteBoxSlot(Guid saveFileId, Guid userId, int boxIndex, int slotIndex, PKM pkm)
    {
        var (_, sav) = await LoadSave(saveFileId, userId);
        var boxData = sav.GetBoxData(boxIndex);
        if (slotIndex < boxData.Length)
        {
            boxData[slotIndex] = pkm;
            sav.SetBoxData(boxData, boxIndex);
            await WriteBackSave(saveFileId, sav);
        }
    }

    /// <summary>清空 Box 指定槽位</summary>
    public async Task ClearBoxSlot(Guid saveFileId, Guid userId, int boxIndex, int slotIndex)
    {
        var (_, sav) = await LoadSave(saveFileId, userId);
        var boxData = sav.GetBoxData(boxIndex);
        if (slotIndex < boxData.Length)
        {
            boxData[slotIndex] = sav.BlankPKM;
            sav.SetBoxData(boxData, boxIndex);
            await WriteBackSave(saveFileId, sav);
        }
    }

    /// <summary>读取 Box 指定槽位的 PKM 对象</summary>
    public PKM? ReadBoxSlot(Guid saveFileId, Guid userId, int boxIndex, int slotIndex)
    {
        var saveFile = LoadSaveFileEntityAsync(saveFileId, userId).Result;
        var sav = SaveUtil.GetVariantSAV(saveFile.RawSaveData);
        if (sav == null) return null;
        var boxData = sav.GetBoxData(boxIndex);
        if (slotIndex >= boxData.Length) return null;
        var pkm = boxData[slotIndex];
        return pkm.Species > 0 && pkm.Valid ? pkm : null;
    }

    /// <summary>存档中是否存在指定 Box & Slot 的记录（用于编辑时判断 Box Index）</summary>
    public (int boxIndex, int slotIndex)? FindPokemonSlot(Guid saveFileId, Guid userId, Guid pokemonDbId)
    {
        // 在新架构中，pokemonDbId 来自银行而非存档
        // 存档里的宝可梦没有独立ID，此方法仅用于银行→存档查找
        return null;
    }

    // ═══ 备份管理 ═══════════════════════════════════════

    public async Task<List<SaveBackupDto>> ListBackups(Guid saveFileId, Guid userId)
    {
        await LoadSaveFileEntity(saveFileId, userId);
        var backups = await _db.QueryAsync<SaveBackupEntity>(
            "SELECT * FROM save_backups WHERE save_file_id = @Id ORDER BY created_at DESC LIMIT 5",
            new { Id = saveFileId });

        return backups.Select(b =>
        {
            var dto = new SaveBackupDto { Id = b.Id, SaveFileId = b.SaveFileId, Label = b.Label, CreatedAt = b.CreatedAt };
            try
            {
                var sav = SaveUtil.GetVariantSAV(b.RawSaveData);
                if (sav != null)
                {
                    dto.TrainerName = sav.OT;
                    dto.PokemonCount = sav.BoxCount > 0
                        ? Enumerable.Range(0, sav.BoxCount).Sum(box =>
                            sav.GetBoxData(box).Count(pkm => pkm.Species > 0 && pkm.Valid))
                            + Enumerable.Range(0, 6).Count(i => { var p = sav.GetPartySlotAtIndex(i); return p != null && p.Species > 0; })
                        : 0;
                    dto.PlayTime = $"{(int)sav.PlayedHours}h {(int)sav.PlayedMinutes}m";
                    dto.GameVersion = GameInfo.GetVersionName(sav.Version);
                    dto.BoxCount = sav.BoxCount;
                }
            }
            catch { /* keep defaults */ }
            return dto;
        }).ToList();
    }

    public async Task CreateBackup(Guid saveFileId, Guid userId, string? label = null)
    {
        var sf = await LoadSaveFileEntity(saveFileId, userId);
        await _db.ExecuteAsync(
            "INSERT INTO save_backups (save_file_id, raw_save_data, label) VALUES (@Id, @Data, @Label)",
            new { Id = saveFileId, Data = sf.RawSaveData, Label = label ?? $"备份 {DateTime.Now:yyyy-MM-dd HH:mm}" });

        // Trim to 5
        await _db.ExecuteAsync(@"
            DELETE FROM save_backups WHERE id IN (
                SELECT id FROM save_backups WHERE save_file_id = @Id ORDER BY created_at DESC OFFSET 5
            )", new { Id = saveFileId });
    }

    public async Task RestoreBackup(Guid saveFileId, Guid userId, Guid backupId)
    {
        var sf = await LoadSaveFileEntity(saveFileId, userId);
        var backup = await _db.QueryFirstOrDefaultAsync<SaveBackupEntity>(
            "SELECT * FROM save_backups WHERE id = @Id AND save_file_id = @SfId",
            new { Id = backupId, SfId = saveFileId })
            ?? throw new BusinessException("备份不存在", 404);

        await _db.ExecuteAsync(
            "UPDATE save_files SET raw_save_data = @Data, file_size = @Size, is_modified = TRUE, updated_at = NOW() WHERE id = @Id",
            new { Id = saveFileId, Data = backup.RawSaveData, Size = backup.RawSaveData.Length });
    }

    // ═══ 下载 / 扫描 ════════════════════════════════════

    public async Task<(byte[] data, string filename)> GetDownloadData(Guid saveFileId, Guid userId)
    {
        var saveFile = await LoadSaveFileEntity(saveFileId, userId);
        return (saveFile.RawSaveData, saveFile.Filename);
    }

    public async Task<BatchLegalityReportDto> BatchLegalityScan(
        Guid saveFileId, Guid userId, PokemonEditService pokemonEditService)
    {
        var saveFile = await LoadSaveFileEntity(saveFileId, userId);
        var sav = SaveUtil.GetVariantSAV(saveFile.RawSaveData)
            ?? throw new BusinessException("无法解析存档格式");
        return pokemonEditService.BatchScan(sav);
    }

    // ═══ 内部辅助 ═════════════════════════════════════════

    private async Task<SaveFileEntity> LoadSaveFileEntity(Guid saveFileId, Guid userId) =>
        await _db.QueryFirstOrDefaultAsync<SaveFileEntity>(
            "SELECT * FROM save_files WHERE id = @Id AND user_id = @UserId",
            new { Id = saveFileId, UserId = userId })
            ?? throw new BusinessException("存档不存在", 404);

    private Task<SaveFileEntity> LoadSaveFileEntityAsync(Guid saveFileId, Guid userId) =>
        LoadSaveFileEntity(saveFileId, userId);

    private async Task<(SaveFileEntity, PKHeX.Core.SaveFile)> LoadSave(Guid saveFileId, Guid userId)
    {
        var sf = await LoadSaveFileEntity(saveFileId, userId);
        var sav = SaveUtil.GetVariantSAV(sf.RawSaveData)
            ?? throw new BusinessException("无法解析存档格式");
        return (sf, sav);
    }

    private async Task WriteBackSave(Guid saveFileId, PKHeX.Core.SaveFile sav)
    {
        var data = sav.Write();
        await _db.ExecuteAsync(
            "UPDATE save_files SET raw_save_data = @Data, file_size = @Size, is_modified = TRUE, updated_at = NOW() WHERE id = @Id",
            new { Id = saveFileId, Data = data, Size = data.Length });
    }

    // ═══ 映射 ═════════════════════════════════════════════

    private static SaveFileDto MapToDto(SaveFileEntity entity) => new()
    {
        SaveFileId = entity.Id, Filename = entity.Filename, FileSize = entity.FileSize,
        Generation = entity.Generation, GameVersion = entity.GameVersion,
        TrainerName = entity.TrainerName, TrainerId = entity.TrainerId, SecretId = entity.SecretId,
        PlayTime = entity.PlayTime, BoxCount = entity.BoxCount, PokemonCount = entity.PokemonCount,
        IsModified = entity.IsModified, CreatedAt = entity.CreatedAt, UpdatedAt = entity.UpdatedAt
    };
}
