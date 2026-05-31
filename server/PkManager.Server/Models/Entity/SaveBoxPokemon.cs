namespace PkManager.Server.Models.Entity;

public class SaveBoxPokemon
{
    public Guid Id { get; set; }
    public Guid SaveFileId { get; set; }
    public int BoxIndex { get; set; }
    public int SlotIndex { get; set; }
    public bool IsEmpty { get; set; } = true;
    public int? Species { get; set; }
    public string? SpeciesName { get; set; }
    public int? Level { get; set; }
    public bool? IsShiny { get; set; }
    public bool? IsEgg { get; set; }
    public string? PokemonJson { get; set; }
    public Guid? SourceBankId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
