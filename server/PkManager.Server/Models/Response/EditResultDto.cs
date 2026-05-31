namespace PkManager.Server.Models.Response;

public class EditResultDto
{
    public bool IsValid { get; set; }
    public LegalityStatus Status { get; set; }  // Legal / Fishy / Illegal
    public string? Report { get; set; }
    public List<JudgementDto> Judgements { get; set; } = new();
    public PokemonDto UpdatedPokemon { get; set; } = null!;
}

public class JudgementDto
{
    public string Identifier { get; set; } = string.Empty;
    public string Judgement { get; set; } = string.Empty;  // Valid / Fishy / Invalid
    public string Comment { get; set; } = string.Empty;
    /// <summary>Human-readable issue description (Chinese)</summary>
    public string Issue { get; set; } = string.Empty;
    /// <summary>Whether a quick-fix is available for this issue</summary>
    public bool CanFix { get; set; }
    /// <summary>Quick-fix action name (e.g. "FixBall", "FixMetLocation")</summary>
    public string? FixAction { get; set; }
}

public enum LegalityStatus
{
    Legal = 0,
    Fishy = 1,
    Illegal = 2
}

public class LegalityReportDto
{
    public bool IsValid { get; set; }
    public LegalityStatus Status { get; set; }
    public string? Report { get; set; }
    public List<JudgementDto> Judgements { get; set; } = new();
}

/// <summary>
/// Per-field legality indicator for inline display in editor tabs.
/// </summary>
public class FieldLegalityDto
{
    public string FieldName { get; set; } = string.Empty;
    public LegalityStatus Status { get; set; }
    public string? Message { get; set; }
    public bool CanFix { get; set; }
    public string? FixAction { get; set; }
}

/// <summary>
/// Batch legality report for an entire save file.
/// </summary>
public class BatchLegalityReportDto
{
    public int Total { get; set; }
    public int LegalCount { get; set; }
    public int FishyCount { get; set; }
    public int IllegalCount { get; set; }
    public List<SlotLegalityDto> Slots { get; set; } = new();
}

public class SlotLegalityDto
{
    public string SlotId { get; set; } = string.Empty;
    public int BoxIndex { get; set; }
    public int SlotIndex { get; set; }
    public bool IsParty { get; set; }
    public int Species { get; set; }
    public string SpeciesName { get; set; } = string.Empty;
    public string? Nickname { get; set; }
    public int Level { get; set; }
    public bool IsShiny { get; set; }
    public LegalityStatus Status { get; set; }
    public string? FirstIssue { get; set; }
}
