namespace PkManager.Server.Models.Response;

public class PokemonSearchResultDto
{
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public List<PokemonSearchItemDto> Items { get; set; } = new();
}

public class PokemonSearchItemDto
{
    // ── 展示字段 ──
    public int SpeciesId { get; set; }
    public string SpeciesName { get; set; } = string.Empty;
    public string Nickname { get; set; } = string.Empty;
    public int Level { get; set; }
    public int Nature { get; set; }
    public string NatureName { get; set; } = string.Empty;
    public int Ability { get; set; }
    public string AbilityName { get; set; } = string.Empty;
    public int? HeldItem { get; set; }
    public string? HeldItemName { get; set; }
    public bool IsShiny { get; set; }
    public bool IsEgg { get; set; }
    public bool? IsValid { get; set; }
    public string? PkmDataBase64 { get; set; }

    // ── 位置（存档搜索时有值）──
    public int? BoxIndex { get; set; }
    public int? SlotIndex { get; set; }
    public bool IsParty { get; set; }
    public string? LocationLabel { get; set; }     // "Box 3 · 槽 12" / "同行 · 槽 2"

    // ── 银行搜索时有值 ──
    public string? BankId { get; set; }
}
