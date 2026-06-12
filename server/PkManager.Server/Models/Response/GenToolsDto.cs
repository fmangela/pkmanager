namespace PkManager.Server.Models.Response;

/// <summary>
/// 世代专属工具 capability — 前端条件渲染开关。
/// 后续 O-Power / Zygarde Cell 在此追加布尔字段。
/// </summary>
public class GenToolsCapability
{
    public bool HasRtc { get; set; }
}

/// <summary>
/// 单个 RTC3 时钟条目（初始时钟 或 已流逝时钟）。
/// </summary>
public class Rtc3EntryDto
{
    /// <summary>"initial" | "elapsed"</summary>
    public string Key { get; set; } = "";

    /// <summary>中文标签："初始时钟" | "已流逝时钟"</summary>
    public string Label { get; set; } = "";

    public int Day { get; set; }
    public int Hour { get; set; }
    public int Minute { get; set; }
    public int Second { get; set; }
}

/// <summary>
/// 世代专属工具统一响应 DTO。
/// 当前仅包含 RTC（Gen3 RS/Emerald），后续追加 OPower / ZygardeCell 等可空字段。
/// </summary>
public class GenToolsDto
{
    public GenToolsCapability Capability { get; set; } = new();

    /// <summary>RTC 时钟条目列表（Gen3 Hoenn 非 null，其他存档为 null）</summary>
    public List<Rtc3EntryDto>? RtcEntries { get; set; }
}
