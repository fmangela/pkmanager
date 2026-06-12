namespace PkManager.Server.Models.Request;

/// <summary>
/// 宝可梦高级搜索筛选条件 — 存档搜索 &amp; 银行搜索共用。
/// </summary>
public class PokemonSearchRequest
{
    // ── 基础 ──
    public int? SpeciesId { get; set; }
    public bool? IsShiny { get; set; }
    public bool? IsEgg { get; set; }
    public int? Gender { get; set; }            // 0=M, 1=F, 2=Genderless
    public int? MinLevel { get; set; }
    public int? MaxLevel { get; set; }

    // ── 性格 / 特性 / 道具 / 球种 ──
    public int? Nature { get; set; }
    public int? Ability { get; set; }
    public int? HeldItem { get; set; }
    public int? Ball { get; set; }

    // ── 来源 ──
    public int? OriginGame { get; set; }         // PKHeX GameVersion 枚举值
    public int? Language { get; set; }           // 1=JPN, 2=ENG, 3=FRE, 4=ITA, 5=GER, 7=SPA, 8=KOR, 9=CHS, 10=CHT

    // ── IV 范围 ──
    public int? MinIV_HP { get; set; }
    public int? MaxIV_HP { get; set; }
    public int? MinIV_ATK { get; set; }
    public int? MaxIV_ATK { get; set; }
    public int? MinIV_DEF { get; set; }
    public int? MaxIV_DEF { get; set; }
    public int? MinIV_SPA { get; set; }
    public int? MaxIV_SPA { get; set; }
    public int? MinIV_SPD { get; set; }
    public int? MaxIV_SPD { get; set; }
    public int? MinIV_SPE { get; set; }
    public int? MaxIV_SPE { get; set; }
    public int? MinIVTotal { get; set; }
    public int? MaxIVTotal { get; set; }

    // ── EV 范围 ──
    public int? MinEV_HP { get; set; }
    public int? MaxEV_HP { get; set; }
    public int? MinEV_ATK { get; set; }
    public int? MaxEV_ATK { get; set; }
    public int? MinEV_DEF { get; set; }
    public int? MaxEV_DEF { get; set; }
    public int? MinEV_SPA { get; set; }
    public int? MaxEV_SPA { get; set; }
    public int? MinEV_SPD { get; set; }
    public int? MaxEV_SPD { get; set; }
    public int? MinEV_SPE { get; set; }
    public int? MaxEV_SPE { get; set; }
    public int? MinEVTotal { get; set; }
    public int? MaxEVTotal { get; set; }

    // ── 招式 ──
    public List<int>? RequiredMoves { get; set; }  // 必须全部拥有
    public List<int>? AnyMoves { get; set; }       // 拥有任一即可

    // ── 训练家 ──
    public string? OT_Name { get; set; }
    public int? TID { get; set; }

    // ── 合法性（仅银行搜索，查 is_valid 列）──
    public bool? IsLegal { get; set; }

    // ── 文本搜索 ──
    public string? SearchText { get; set; }        // 物种名/昵称模糊匹配

    // ── 分页 ──
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}
