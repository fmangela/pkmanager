namespace PkManager.Server.Models.Entity;

public class SaveFile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Filename { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int Generation { get; set; }
    public int? GameVersion { get; set; }
    public string? TrainerName { get; set; }
    public int? TrainerId { get; set; }
    public int? SecretId { get; set; }
    public int PlayTime { get; set; }
    public int BoxCount { get; set; }
    public int PokemonCount { get; set; }
    public bool IsValidSave { get; set; } = true;
    public byte[] RawSaveData { get; set; } = Array.Empty<byte>();
    public bool IsModified { get; set; }
    public DateTime? LastAccessedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class SaveBackupEntity
{
    public Guid Id { get; set; }
    public Guid SaveFileId { get; set; }
    public byte[] RawSaveData { get; set; } = Array.Empty<byte>();
    public string? Label { get; set; }
    public DateTime CreatedAt { get; set; }
}
