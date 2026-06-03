namespace PkManager.Server.Helpers;

/// <summary>
/// 将 PKHeX 内部版本号（如 RS=56, RSE=57, DP=62）归一化为项目自定义简化版本号。
/// PKHeX.Core GameVersion 枚举值参考：
///   Gen1:  RD=35,GN=36,BU=37,YW=38, RB=52,RBY=53
///   Gen2:  GD=39,SI=40,C=41,          GS=54,GSC=55
///   Gen3:  S=1,R=2,E=3,FR=4,LG=5,     RS=56,RSE=57,FRLG=58,RSBOX=59
///   Gen4:  D=10,P=11,Pt=12,HG=7,SS=8, DP=62,DPPt=63,HGSS=64
///   Gen5:  W=20,B=21,W2=22,B2=23,      BW=66,B2W2=67
///   Gen6:  X=24,Y=25,AS=26,OR=27,      XY=68,ORASDEMO=69,ORAS=70
///   Gen7:  SN=30,MN=31,US=32,UM=33,    SM=71,USUM=72,GG=73
///   Gen8:  SW=44,SH=45,PLA=47,BD=48,SP=49, SWSH=74,BDSP=75
///   Gen9:  SL=50,VL=51,                SV=76
/// </summary>
public static class GameVersionNormalizer
{
    private static readonly Dictionary<int, int> Map = new()
    {
        // Gen1-2 (PKHeX specific → pass through, 暂未使用)
        { 35, 35 }, { 36, 36 }, { 37, 37 }, { 38, 38 },
        { 39, 39 }, { 40, 40 }, { 41, 41 },
        // Gen1-2 (PKHeX composite → best-guess)
        { 52, 35 }, { 53, 35 },
        { 54, 39 }, { 55, 39 },
        // GBA Gen3 (PKHeX composite → best-guess)
        { 56, 2 },  // RS → 红宝石（默认）
        { 57, 3 },  // RSE → 绿宝石（默认）
        { 58, 4 },  // FRLG → 火红（默认）
        { 59, 1 },  // RSBOX → 蓝宝石
        // NDS Gen4 (PKHeX specific → pass through)
        { 7, 7 }, { 8, 8 }, { 10, 10 }, { 11, 11 }, { 12, 12 },
        // NDS Gen4 (PKHeX composite → best-guess)
        { 62, 10 }, // DP → 钻石
        { 63, 12 }, // DPPt → 白金
        { 64, 7 },  // HGSS → 心金
        // NDS Gen5 (PKHeX specific → pass through)
        { 20, 20 }, { 21, 21 }, { 22, 22 }, { 23, 23 },
        // NDS Gen5 (PKHeX composite → best-guess)
        { 66, 21 }, // BW → 黑
        { 67, 22 }, // B2W2 → 黑2
        // 3DS Gen6 (PKHeX specific → pass through)
        { 24, 24 }, { 25, 25 }, { 26, 26 }, { 27, 27 },
        // 3DS Gen6 (PKHeX composite → best-guess)
        { 68, 24 }, // XY → X
        { 70, 26 }, // ORAS → α蓝宝石
        // 3DS Gen7 (PKHeX specific → pass through)
        { 30, 30 }, { 31, 31 }, { 32, 32 }, { 33, 33 }, { 34, 34 },
        { 42, 42 }, { 43, 43 },
        // 3DS Gen7 (PKHeX composite → best-guess)
        { 71, 30 }, // SM → 太阳
        { 72, 32 }, // USUM → 究极日
        { 73, 42 }, // GG → Let's Go 皮卡丘
        // Switch Gen8 (PKHeX specific → pass through)
        { 44, 44 }, { 45, 45 }, { 47, 47 }, { 48, 48 }, { 49, 49 },
        // Switch Gen8 (PKHeX composite → best-guess)
        { 74, 44 }, // SWSH → 剑
        { 75, 48 }, // BDSP → 晶灿钻石
        // Switch Gen9 (PKHeX specific → pass through)
        { 50, 50 }, { 51, 51 },
        // Switch Gen9 (PKHeX composite → best-guess)
        { 76, 50 }, // SV → 朱
    };

    /// <summary>复合版本号范围（PKHeX 无法从存档二进制中分辨具体游戏时返回的版本）</summary>
    public static bool IsCompositeVersion(int v) => v >= 52 && v <= 76;

    public static int Normalize(int pkhexVersion) =>
        Map.TryGetValue(pkhexVersion, out var normalized) ? normalized : pkhexVersion;

    public static int? Normalize(int? pkhexVersion) =>
        pkhexVersion.HasValue ? Normalize(pkhexVersion.Value) : null;

    /// <summary>
    /// 安全归一化：当 PKHeX 返回复合版本时，回退到已有的具体版本（如 CreateNewGame 所记录）。
    /// </summary>
    public static int? NormalizeOrKeepExisting(int? pkhexVersion, int? existingVersion)
    {
        if (pkhexVersion == null) return existingVersion;
        if (IsCompositeVersion(pkhexVersion.Value) && existingVersion != null)
            return existingVersion; // 复合版本无法区分具体游戏，保留 CreateNewGame 时记录的正确版本
        return Normalize(pkhexVersion.Value);
    }
}
