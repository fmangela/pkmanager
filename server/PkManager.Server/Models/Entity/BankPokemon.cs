namespace PkManager.Server.Models.Entity;

public class BankPokemon
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public int Species { get; set; }
    public string SpeciesName { get; set; } = string.Empty;
    public string? Nickname { get; set; }
    public int Level { get; set; } = 1;
    public int? Nature { get; set; }
    public string? NatureName { get; set; }
    public int? Ability { get; set; }
    public string? AbilityName { get; set; }
    public int Generation { get; set; }
    public int? GameVersion { get; set; }
    public bool IsShiny { get; set; }
    public bool IsEgg { get; set; }
    public bool IsValid { get; set; } = true;
    public string? PokemonJson { get; set; }
    public string? PkmDataBase64 { get; set; }
    public string? Source { get; set; }
    public Guid? SourceSaveId { get; set; }
    public int SortOrder { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
