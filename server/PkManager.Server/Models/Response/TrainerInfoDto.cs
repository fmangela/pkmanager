namespace PkManager.Server.Models.Response;

/// <summary>
/// 训练家完整信息 — 包含 capability 描述和各分区数据。
/// 前端按 capability 条件渲染，不硬编码 generation。
/// </summary>
public class TrainerInfoDto
{
    public TrainerCapability Capability { get; set; } = new();

    // ── 基本信息 ──
    public string OT { get; set; } = "";
    public ushort TID16 { get; set; }
    public ushort SID16 { get; set; }
    public uint DisplayTID { get; set; }
    public uint DisplaySID { get; set; }
    public byte Gender { get; set; }
    public int Language { get; set; }
    public string? LanguageName { get; set; }
    public int PlayedHours { get; set; }
    public int PlayedMinutes { get; set; }
    public int PlayedSeconds { get; set; }
    public int Generation { get; set; }
    public string? GameVersionName { get; set; }

    // ── 货币（仅 capability 指示存在时非 null）──
    public uint? Money { get; set; }
    public int? Coins { get; set; }
    public int? BP { get; set; }
    public int? LeaguePoints { get; set; }

    // ── 徽章 ──
    public int? Badges { get; set; }

    // ── 训练家卡片（Gen8 SwSh）──
    public string? CardNumber { get; set; }

    // ── GameSync ID（只读）──
    public string? GameSyncID { get; set; }
}

/// <summary>
/// 训练家能力描述 — 指示该存档支持哪些训练家相关字段。
/// 后端通过接口检测（而非 generation switch）填充。
/// </summary>
public class TrainerCapability
{
    // ── 货币 ──
    public bool HasCoins { get; set; }
    public bool HasBP { get; set; }
    public bool HasLeaguePoints { get; set; }

    // ── 徽章 ──
    public bool HasBadges { get; set; }
    public int BadgeCount { get; set; }
    public string[] BadgeNames { get; set; } = [];

    // ── 训练家卡片 ──
    public bool HasTrainerCard { get; set; }
    public bool HasCardNumber { get; set; }

    // ── GameSync ID ──
    public bool HasGameSync { get; set; }

    // ── 基本限制 ──
    public int MaxStringLengthTrainer { get; set; }
    public int MaxMoney { get; set; }
    public int? MaxCoins { get; set; }
    public int TrainerIDFormat { get; set; }  // TrainerIDFormat 枚举值: 0=None, 1=16BitSingle, 2=16Bit, 3=SixDigit
}
