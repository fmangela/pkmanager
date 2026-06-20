using PKHeX.Core;
using PkManager.Server.Helpers;
using PkManager.Server.Localization;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;
using System.Reflection;
using System.Text.RegularExpressions;

namespace PkManager.Server.Services;

/// <summary>
/// 宝可梦编辑与合法性校验服务
/// </summary>
public class PokemonEditService
{
    private static readonly MethodInfo? PK5CalculateAbilityIndexMethod =
        typeof(PK5).GetMethod("CalculateAbilityIndex", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
    private static readonly string[] MarkingPropertyNames =
    [
        "MarkingCircle",
        "MarkingTriangle",
        "MarkingSquare",
        "MarkingHeart",
        "MarkingStar",
        "MarkingDiamond"
    ];

    private readonly ParseService _parseService;
    private readonly IPkhexStringProvider _pkhexStrings;
    private readonly ILanguageResolver _languageResolver;
    private readonly IBackendMessageLocalizer _messages;

    public PokemonEditService(
        ParseService parseService,
        IPkhexStringProvider pkhexStrings,
        ILanguageResolver languageResolver,
        IBackendMessageLocalizer messages)
    {
        _parseService = parseService;
        _pkhexStrings = pkhexStrings;
        _languageResolver = languageResolver;
        _messages = messages;
    }

    /// <summary>
    /// 应用编辑并保存（不检查合法性——合法性由独立Tab负责）
    /// </summary>
    public EditResultDto ApplyEdits(PKM original, PokemonEditRequest request)
    {
        ApplyEditsToPkm(original, request);

        // 仅做轻量合法性标记，不拦截保存
        var legality = new LegalityAnalysis(original);
        var status = ComputeLegalityStatus(legality);

        return new EditResultDto
        {
            IsValid = true,  // 始终返回true允许保存
            Status = status,
            Report = status != LegalityStatus.Legal ? GetChineseReport(legality) : null,
            Judgements = BuildJudgements(legality),
            UpdatedPokemon = _parseService.MapToPokemonDto(original)
        };
    }

    /// <summary>
    /// 生成中文合法性报告
    /// </summary>
    private static string GetChineseReport(LegalityAnalysis la)
    {
        // PKHeX.Core 的报告使用内置本地化，通常跟随游戏语言
        return la.Report();
    }

    /// <summary>
    /// Apply edits without running legality (for internal temp use)
    /// </summary>
    public void ApplyEditsToPkm(PKM pkm, PokemonEditRequest request)
    {
        var originalLevel = pkm.CurrentLevel;
        var originalExp = pkm.EXP;
        var growth = pkm.PersonalInfo.EXPGrowth;
        var levelChanged = request.Level.HasValue && request.Level.Value != originalLevel;
        var expChanged = request.EXP.HasValue && (uint)request.EXP.Value != originalExp;

        // ── Main Tab ──────────────────────────────────────
        if (request.Species.HasValue)
            pkm.Species = (ushort)request.Species.Value;

        if (request.Nickname != null)
            pkm.Nickname = request.Nickname;

        if (request.IsNicknamed.HasValue)
            pkm.IsNicknamed = request.IsNicknamed.Value;

        if (request.Gender.HasValue)
            pkm.Gender = request.Gender.Value;

        if (request.Nature.HasValue)
        {
            var requestedNature = (Nature)request.Nature.Value;
            pkm.SetNature(requestedNature);
        }

        if (request.Ability.HasValue || request.AbilitySlot.HasValue)
            ApplyAbilitySelection(pkm, request.Ability, request.AbilitySlot);

        if (request.IsShiny.HasValue)
        {
            if (request.IsShiny.Value)
            {
                // 设为闪光：PKHeX.Core重新生成PID使TSV==PSV（保留性别/性格，Gen6+同步EC）
                pkm.SetShiny();
            }
            else if (pkm.IsShiny)
            {
                // 取消闪光：翻转PID高半部分使TSV≠PSV（保留性别/性格/其他PID属性）
                pkm.PID ^= 0x8000_0000;
                if (pkm.IsShiny)
                    pkm.PID ^= 0x1000_0000;
                if (pkm.Format >= 6 && (pkm.Generation >= 3 && pkm.Generation <= 5))
                    pkm.EncryptionConstant = pkm.PID;
            }
        }

        if (request.IsEgg.HasValue)
            pkm.IsEgg = request.IsEgg.Value;

        if (request.HeldItem.HasValue)
            pkm.HeldItem = request.HeldItem.Value;

        if (request.Ball.HasValue)
            pkm.Ball = (byte)request.Ball.Value;

        if (request.Form.HasValue)
            pkm.Form = request.Form.Value;

        if (request.FormArgument.HasValue)
        {
            var faProp = pkm.GetType().GetProperty("FormArgument");
            faProp?.SetValue(pkm, request.FormArgument.Value);
        }

        if (request.Language.HasValue)
            pkm.Language = request.Language.Value;

        if (levelChanged && expChanged)
        {
            var requestedExp = (uint)request.EXP!.Value;
            var derivedLevel = Experience.GetLevel(requestedExp, growth);
            if (derivedLevel == request.Level!.Value)
                pkm.EXP = requestedExp;
            else
                pkm.CurrentLevel = (byte)request.Level.Value;
        }
        else if (levelChanged)
        {
            pkm.CurrentLevel = (byte)request.Level!.Value;
        }
        else if (expChanged)
        {
            pkm.EXP = (uint)request.EXP!.Value;
        }

        if (request.Friendship.HasValue)
            pkm.OriginalTrainerFriendship = (byte)request.Friendship.Value;

        if (request.HandlingTrainerFriendship.HasValue)
            pkm.HandlingTrainerFriendship = (byte)request.HandlingTrainerFriendship.Value;

        if (request.PokerusStrain.HasValue)
            pkm.PokerusStrain = request.PokerusStrain.Value;

        if (request.PokerusDays.HasValue)
            pkm.PokerusDays = request.PokerusDays.Value;

        if (request.FatefulEncounter.HasValue)
            pkm.FatefulEncounter = request.FatefulEncounter.Value;

        if (request.HeightScalar.HasValue)
        {
            var hProp = pkm.GetType().GetProperty("HeightScalar");
            hProp?.SetValue(pkm, request.HeightScalar.Value);
        }

        if (request.WeightScalar.HasValue)
        {
            var wProp = pkm.GetType().GetProperty("WeightScalar");
            wProp?.SetValue(pkm, request.WeightScalar.Value);
        }

        if (request.Scale.HasValue)
        {
            var sProp = pkm.GetType().GetProperty("Scale");
            sProp?.SetValue(pkm, request.Scale.Value);
        }

        // ── Stats Tab ─────────────────────────────────────
        if (request.IVs != null && request.IVs.Length == 6)
        {
            pkm.IV_HP = request.IVs[0];
            pkm.IV_ATK = request.IVs[1];
            pkm.IV_DEF = request.IVs[2];
            pkm.IV_SPA = request.IVs[3];
            pkm.IV_SPD = request.IVs[4];
            pkm.IV_SPE = request.IVs[5];
        }

        if (request.EVs != null && request.EVs.Length == 6)
        {
            pkm.EV_HP = (byte)request.EVs[0];
            pkm.EV_ATK = (byte)request.EVs[1];
            pkm.EV_DEF = (byte)request.EVs[2];
            pkm.EV_SPA = (byte)request.EVs[3];
            pkm.EV_SPD = (byte)request.EVs[4];
            pkm.EV_SPE = (byte)request.EVs[5];
        }

        if (request.AVs != null && request.AVs.Length == 6 && pkm is IAwakened av)
        {
            av.AV_HP = (byte)request.AVs[0];
            av.AV_ATK = (byte)request.AVs[1];
            av.AV_DEF = (byte)request.AVs[2];
            av.AV_SPA = (byte)request.AVs[3];
            av.AV_SPD = (byte)request.AVs[4];
            av.AV_SPE = (byte)request.AVs[5];
        }

        if (request.GVs != null && request.GVs.Length == 6 && pkm is IGanbaru gv)
        {
            gv.GV_HP = (byte)request.GVs[0];
            gv.GV_ATK = (byte)request.GVs[1];
            gv.GV_DEF = (byte)request.GVs[2];
            gv.GV_SPA = (byte)request.GVs[3];
            gv.GV_SPD = (byte)request.GVs[4];
            gv.GV_SPE = (byte)request.GVs[5];
        }

        if (request.DynamaxLevel.HasValue && pkm is IDynamaxLevel dl)
            dl.DynamaxLevel = (byte)request.DynamaxLevel.Value;

        if (request.CanGigantamax.HasValue && pkm is IGigantamax gmax)
            gmax.CanGigantamax = request.CanGigantamax.Value;

        if (request.TeraTypeOriginal.HasValue && pkm is ITeraType ttype)
            ttype.TeraTypeOriginal = (MoveType)request.TeraTypeOriginal.Value;

        if (request.TeraTypeOverride.HasValue && pkm is ITeraType ttype2)
            ttype2.TeraTypeOverride = (MoveType)request.TeraTypeOverride.Value;

        if (request.IsAlpha.HasValue && pkm is IAlpha alpha)
            alpha.IsAlpha = request.IsAlpha.Value;

        if (request.IsNoble.HasValue && pkm is INoble noble)
            noble.IsNoble = request.IsNoble.Value;

        // StatNature only for Gen8+ (in Gen7 it aliases Nature and would overwrite it)
        if (request.StatNature.HasValue && pkm.Format >= 8)
        {
            pkm.StatNature = (Nature)request.StatNature.Value;
        }

        // ── Moves Tab ─────────────────────────────────────
        if (request.Moves != null)
        {
            for (int i = 0; i < Math.Min(4, request.Moves.Length); i++)
                pkm.SetMove(i, (ushort)request.Moves[i]);
        }

        if (request.MovePPs != null)
        {
            var ppProps = new[] { "Move1_PP", "Move2_PP", "Move3_PP", "Move4_PP" };
            for (int i = 0; i < Math.Min(4, request.MovePPs.Length); i++)
            {
                var ppProp = pkm.GetType().GetProperty(ppProps[i]);
                ppProp?.SetValue(pkm, (byte)request.MovePPs[i]);
            }
        }

        if (request.MovePPUps != null)
        {
            var ppUpProps = new[] { "Move1_PPUps", "Move2_PPUps", "Move3_PPUps", "Move4_PPUps" };
            for (int i = 0; i < Math.Min(4, request.MovePPUps.Length); i++)
            {
                var ppUpProp = pkm.GetType().GetProperty(ppUpProps[i]);
                ppUpProp?.SetValue(pkm, request.MovePPUps[i]);
            }
        }

        if (request.RelearnMoves != null)
        {
            try
            {
                var rlMoves = pkm.RelearnMoves;
                if (rlMoves != null)
                {
                    for (int i = 0; i < Math.Min(4, Math.Min(request.RelearnMoves.Length, rlMoves.Length)); i++)
                        rlMoves[i] = (ushort)request.RelearnMoves[i];
                }
            }
            catch { /* RelearnMoves not available */ }
        }

        // ── Met Tab ───────────────────────────────────────
        if (request.MetLocation.HasValue)
            pkm.MetLocation = (ushort)request.MetLocation.Value;

        if (request.MetLevel.HasValue)
            pkm.MetLevel = request.MetLevel.Value;

        if (request.OriginGame.HasValue)
            pkm.Version = (GameVersion)request.OriginGame.Value;

        if (request.MetDate != null && DateOnly.TryParse(request.MetDate, out var metDate))
            pkm.MetDate = metDate;

        if (request.EggLocation.HasValue)
            pkm.EggLocation = (ushort)request.EggLocation.Value;

        if (request.EggDate != null && DateOnly.TryParse(request.EggDate, out var eggDate))
            pkm.EggMetDate = eggDate;

        if (request.MetTimeOfDay.HasValue)
        {
            var mtdProp = pkm.GetType().GetProperty("MetTimeOfDay");
            mtdProp?.SetValue(pkm, request.MetTimeOfDay.Value);
        }

        if (request.GroundTile.HasValue && pkm is IGroundTile gt)
            gt.GroundTile = (GroundTileType)request.GroundTile.Value;

        if (request.BattleVersion.HasValue && pkm is IBattleVersion bv)
            bv.BattleVersion = (GameVersion)request.BattleVersion.Value;

        if (request.ObedienceLevel.HasValue)
        {
            var olProp = pkm.GetType().GetProperty("ObedienceLevel");
            if (olProp != null)
                olProp.SetValue(pkm, request.ObedienceLevel.Value);
        }

        // ── OT/Misc Tab ───────────────────────────────────
        if (request.OriginalTrainerName != null)
            pkm.OriginalTrainerName = request.OriginalTrainerName;

        if (request.OriginalTrainerGender.HasValue)
            pkm.OriginalTrainerGender = request.OriginalTrainerGender.Value;

        if (request.TID16.HasValue)
            pkm.TID16 = request.TID16.Value;

        if (request.SID16.HasValue)
            pkm.SID16 = request.SID16.Value;

        if (request.HandlingTrainerName != null)
        {
            var htProp = pkm.GetType().GetProperty("HandlingTrainerName");
            htProp?.SetValue(pkm, request.HandlingTrainerName);
        }

        if (request.HandlingTrainerGender.HasValue)
        {
            var htgProp = pkm.GetType().GetProperty("HandlingTrainerGender");
            htgProp?.SetValue(pkm, request.HandlingTrainerGender.Value);
        }

        if (request.HandlingTrainerLanguage.HasValue)
        {
            var hlProp = pkm.GetType().GetProperty("HandlingTrainerLanguage");
            hlProp?.SetValue(pkm, request.HandlingTrainerLanguage.Value);
        }

        if (request.Affection.HasValue)
        {
            var affProp = pkm.GetType().GetProperty("Affection");
            affProp?.SetValue(pkm, request.Affection.Value);
        }

        if (request.HomeTracker.HasValue && pkm is IHomeTrack home)
            home.Tracker = (ulong)request.HomeTracker.Value;

        if (request.IsFavorite.HasValue && pkm is IFavorite fav)
            fav.IsFavorite = request.IsFavorite.Value;

        // Geo Locations (Gen6-7) — use reflection
        if (request.GeoLocation1_Country.HasValue)
        {
            var geoProp = pkm.GetType().GetProperty("GeoLocation");
            if (geoProp != null)
            {
                var geoVal = geoProp.GetValue(pkm);
                if (geoVal is IList<int> geoList && geoList.Count >= 2)
                    geoList[0] = request.GeoLocation1_Country.Value;
            }
        }

        // IRegionOrigin (Gen6-7)
        if (pkm is IRegionOrigin ro)
        {
            if (request.Country.HasValue) SetPropertyValue(pkm, "Country", request.Country.Value);
            if (request.SubRegion.HasValue) SetPropertyValue(pkm, "Region", request.SubRegion.Value);
            if (request.ConsoleRegion.HasValue) SetPropertyValue(pkm, "ConsoleRegion", request.ConsoleRegion.Value);
        }

        // Affixed Ribbon/Mark (Gen8+)
        if (request.AffixedRibbon.HasValue && pkm is IRibbonSetAffixed affixed)
            affixed.AffixedRibbon = (sbyte)request.AffixedRibbon.Value;

        // ── Cosmetic Tab ──────────────────────────────────
        if (request.Markings != null && request.Markings.Length >= 6)
            ApplyMarkings(pkm, request.Markings);

        if (request.ContestCool.HasValue && pkm is IContestStats cs)
        {
            cs.ContestCool = request.ContestCool.Value;
            if (request.ContestBeauty.HasValue) cs.ContestBeauty = request.ContestBeauty.Value;
            if (request.ContestCute.HasValue) cs.ContestCute = request.ContestCute.Value;
            if (request.ContestSmart.HasValue) cs.ContestSmart = request.ContestSmart.Value;
            if (request.ContestTough.HasValue) cs.ContestTough = request.ContestTough.Value;
            if (request.ContestSheen.HasValue) cs.ContestSheen = request.ContestSheen.Value;
        }

        // ── Gen-Specific Tab ──────────────────────────────
        // Gen3 Colosseum/XD Shadow (Purification = Heart Gauge absolute counter)
        if (request.Purification.HasValue && pkm is IShadowCapture sc)
            sc.Purification = Math.Clamp(request.Purification.Value, -10000, 10000);

        // Gen4 HGSS Shiny Leaves (raw bitfield, backed by byte[0x41])
        if (request.ShinyLeaf.HasValue && pkm is G4PKM g4)
            g4.ShinyLeaf = request.ShinyLeaf.Value & 0xFF;

        // Gen5 NSparkle / PokeStar
        if (pkm is PK5 pk5)
        {
            if (request.NSparkle.HasValue) pk5.NSparkle = request.NSparkle.Value;
            if (request.PokeStarFame.HasValue) pk5.PokeStarFame = request.PokeStarFame.Value;
        }

        // Gen6-7 Super Training (strict length guards)
        if (request.SecretSuperTrainingUnlocked.HasValue && pkm is ISuperTrain st1)
            st1.SecretSuperTrainingUnlocked = request.SecretSuperTrainingUnlocked.Value;
        if (request.SuperTrainRegimenFlags is { Length: 30 } && pkm is ISuperTrainRegimen str1)
            for (int i = 0; i < 30; i++) str1.SetRegimenState(i, request.SuperTrainRegimenFlags[i]);
        if (request.DistSuperTrainFlags is { Length: 6 } && pkm is ISuperTrainRegimen str2)
            for (int i = 0; i < 6; i++) str2.SetRegimenStateDistribution(i, request.DistSuperTrainFlags[i]);

        // Gen6-7 Amie Fullness/Enjoyment (clamped to byte range)
        if (pkm is IFullnessEnjoyment fe)
        {
            if (request.Fullness.HasValue) fe.Fullness = (byte)Math.Clamp((int)request.Fullness.Value, 0, 255);
            if (request.Enjoyment.HasValue) fe.Enjoyment = (byte)Math.Clamp((int)request.Enjoyment.Value, 0, 255);
        }

        // Gen7 Hyper Training (strict length guard)
        if (request.HyperTrainFlags is { Length: 6 } && pkm is IHyperTrain ht)
        {
            ht.HT_HP = request.HyperTrainFlags[0];
            ht.HT_ATK = request.HyperTrainFlags[1];
            ht.HT_DEF = request.HyperTrainFlags[2];
            ht.HT_SPA = request.HyperTrainFlags[3];
            ht.HT_SPD = request.HyperTrainFlags[4];
            ht.HT_SPE = request.HyperTrainFlags[5];
        }

        // Gen7 LGPE Combat Power / Spirit / Mood
        if (request.CombatPower.HasValue && pkm is ICombatPower cp)
            cp.Stat_CP = Math.Max(0, request.CombatPower.Value);
        if (pkm is PB7 pb7)
        {
            if (request.Spirit.HasValue) pb7.Spirit = (byte)Math.Clamp((int)request.Spirit.Value, 0, 255);
            if (request.Mood.HasValue) pb7.Mood = (byte)Math.Clamp((int)request.Mood.Value, 0, 255);
        }
    }

    public static int GetAbilitySlotIndex(PKM pkm)
    {
        if (pkm is PK5 pk5Calculated && PK5CalculateAbilityIndexMethod != null)
            return (int)(PK5CalculateAbilityIndexMethod.Invoke(pk5Calculated, null) ?? 0);

        if (pkm is PK5 pk5 && pk5.HiddenAbility)
            return 2;

        var personalInfo = pkm.PersonalInfo;
        if (personalInfo == null)
            return 0;

        var currentAbility = pkm.Ability;
        for (int i = 0; i < personalInfo.AbilityCount; i++)
        {
            if (personalInfo.GetAbilityAtIndex(i) != currentAbility)
                continue;

            return i;
        }

        return 0;
    }

    public static void ApplyAbilitySelection(PKM pkm, int? abilityId, int? requestedSlot)
    {
        var personalInfo = pkm.PersonalInfo;
        if (personalInfo == null)
            return;

        var slot = requestedSlot;
        if (slot is < 0 or > 2)
            slot = null;

        if (abilityId.HasValue)
        {
            if (slot is >= 0 && slot < personalInfo.AbilityCount &&
                personalInfo.GetAbilityAtIndex(slot.Value) == abilityId.Value)
            {
                // Requested slot is already coherent with this ability ID.
            }
            else
            {
                var mappedSlot = personalInfo.GetIndexOfAbility(abilityId.Value);
                if (mappedSlot < 0)
                    return;
                slot = mappedSlot;
            }
        }

        if (!slot.HasValue)
            return;

        var index = slot.Value;
        if (index < 0 || index >= personalInfo.AbilityCount)
            return;

        if (pkm is PK5 pk5)
        {
            if (index == 2)
            {
                pk5.RefreshAbility(index);
                return;
            }

            pk5.HiddenAbility = false;
        }

        if (pkm.Format <= 5 && index > 0 && index < 2)
            pkm.SetAbilityIndex(index);

        pkm.RefreshAbility(index);
    }

    /// <summary>
    /// 仅校验，不保存
    /// </summary>
    public LegalityReportDto ValidateOnly(PKM pkm)
    {
        var legality = new LegalityAnalysis(pkm);
        var status = ComputeLegalityStatus(legality);

        return new LegalityReportDto
        {
            IsValid = status == LegalityStatus.Legal,
            Status = status,
            Report = status == LegalityStatus.Legal ? null : GetChineseReport(legality),
            Judgements = BuildJudgements(legality)
        };
    }

    /// <summary>
    /// 全存档批量合法性扫描
    /// </summary>
    public BatchLegalityReportDto BatchScan(SaveFile sav)
    {
        var report = new BatchLegalityReportDto();
        var slots = new List<SlotLegalityDto>();
        var strings = _pkhexStrings.GetStrings();

        // Party
        for (int i = 0; i < 6; i++)
        {
            var pkm = sav.GetPartySlotAtIndex(i);
            if (pkm is not { Species: > 0, Valid: true }) continue;

            var la = new LegalityAnalysis(pkm);
            var status = ComputeLegalityStatus(la);
            slots.Add(new SlotLegalityDto
            {
                SlotId = $"party:{i}",
                BoxIndex = -1, SlotIndex = i, IsParty = true,
                Species = pkm.Species,
                SpeciesName = GetSafeString(strings.Species, pkm.Species, $"#{pkm.Species}"),
                Nickname = pkm.Nickname,
                Level = pkm.CurrentLevel,
                IsShiny = pkm.IsShiny,
                Status = status,
                FirstIssue = status != LegalityStatus.Legal ? GetFirstIssue(la, _languageResolver.CurrentLang) : null
            });
        }

        // Boxes
        for (int box = 0; box < sav.BoxCount; box++)
        {
            var boxData = sav.GetBoxData(box);
            for (int slot = 0; slot < boxData.Length; slot++)
            {
                var pkm = boxData[slot];
                if (pkm.Species == 0 || !pkm.Valid) continue;

                var la = new LegalityAnalysis(pkm);
                var status = ComputeLegalityStatus(la);
                slots.Add(new SlotLegalityDto
                {
                    SlotId = $"box:{box}:{slot}",
                    BoxIndex = box, SlotIndex = slot, IsParty = false,
                    Species = pkm.Species,
                    SpeciesName = GetSafeString(strings.Species, pkm.Species, $"#{pkm.Species}"),
                    Nickname = pkm.Nickname,
                    Level = pkm.CurrentLevel,
                    IsShiny = pkm.IsShiny,
                    Status = status,
                    FirstIssue = status != LegalityStatus.Legal ? GetFirstIssue(la, _languageResolver.CurrentLang) : null
                });
            }
        }

        report.Total = slots.Count;
        report.LegalCount = slots.Count(s => s.Status == LegalityStatus.Legal);
        report.FishyCount = slots.Count(s => s.Status == LegalityStatus.Fishy);
        report.IllegalCount = slots.Count(s => s.Status == LegalityStatus.Illegal);
        report.Slots = slots;

        return report;
    }

    /// <summary>
    /// 导出单个宝可梦为 .pk* 文件
    /// </summary>
    public byte[] ExportSinglePkm(PKM pkm, string? format = null)
    {
        var buf = new byte[pkm.SIZE_PARTY]; pkm.WriteDecryptedDataParty(buf); return buf;
    }

    // ── 合法性辅助方法（委托到 LegalizationService 统一实现）──

    public static LegalityStatus ComputeLegalityStatus(LegalityAnalysis la)
        => LegalizationService.ComputeLegalityStatus(la);

    public string GetFirstIssue(LegalityAnalysis la, string? lang = null)
        => LocalizeIssue(LegalizationService.GetFirstIssue(la), lang);

    public string GetHumanReadableIssue(CheckResult r, string? lang = null)
        => LocalizeIssue(LegalizationService.GetHumanReadableIssue(r), lang);

    public static bool CanAutoFix(CheckResult r)
        => LegalizationService.CanAutoFix(r);

    public static string? GetFixAction(CheckResult r)
        => LegalizationService.GetFixAction(r);

    private static string GetSafeString(IReadOnlyList<string> list, int index, string fallback)
    {
        if (index >= 0 && index < list.Count)
            return list[index];
        return fallback;
    }

    internal List<JudgementDto> BuildJudgements(LegalityAnalysis legality)
    {
        var context = LegalityLocalizationContext.Create(legality, NormalizePkhexLanguage(_languageResolver.CurrentLang));
        var judgements = new List<JudgementDto>(legality.Results.Count);

        foreach (var result in legality.Results)
        {
            judgements.Add(new JudgementDto
            {
                Identifier = result.Identifier.ToString(),
                Judgement = result.Judgement.ToString(),
                Comment = context.Humanize(result, verbose: false),
                Issue = GetHumanReadableIssue(result, _languageResolver.CurrentLang),
                CanFix = CanAutoFix(result),
                FixAction = GetFixAction(result)
            });
        }

        return judgements;
    }

    private static void ApplyMarkings(PKM pkm, int[] markings)
    {
        var type = pkm.GetType();
        var markingCount = GetMarkingCount(pkm);
        var count = Math.Min(Math.Min(markings.Length, markingCount), 6);

        var setMarking = type.GetMethod("SetMarking", [typeof(int), typeof(bool)])
            ?? type.GetMethod("SetMarking", BindingFlags.Instance | BindingFlags.Public, null, [typeof(int), typeof(MarkingColor)], null)
            ?? type.GetMethod("SetMarking");
        if (setMarking != null)
        {
            var valueType = setMarking.GetParameters()[1].ParameterType;
            for (int i = 0; i < count; i++)
                setMarking.Invoke(pkm, [i, ConvertMarkingValue(markings[i], valueType)]);
            return;
        }

        for (int i = 0; i < count; i++)
        {
            var prop = type.GetProperty(MarkingPropertyNames[i]);
            if (prop == null || !prop.CanWrite)
                continue;

            prop.SetValue(pkm, ConvertMarkingValue(markings[i], prop.PropertyType));
        }
    }

    private static int GetMarkingCount(PKM pkm)
    {
        var prop = pkm.GetType().GetProperty("MarkingCount");
        if (prop?.GetValue(pkm) is int count)
            return count;
        return 6;
    }

    private static object ConvertMarkingValue(int value, Type targetType)
    {
        var normalizedType = Nullable.GetUnderlyingType(targetType) ?? targetType;
        if (normalizedType == typeof(bool))
            return value != 0;

        if (normalizedType.IsEnum)
        {
            if (Enum.IsDefined(normalizedType, value))
                return Enum.ToObject(normalizedType, value);
            return Enum.ToObject(normalizedType, 0);
        }

        return Convert.ChangeType(value, normalizedType);
    }

    private string LocalizeIssue(string issue, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(issue))
            return issue;

        if (issue == "__LEGALIZE_INVALID_MOVES_PRESENT__")
            return _messages.GetForLanguage(lang, "legalize.invalidMovesPresent");
        if (issue == "__LEGALIZE_INVALID_RELEARN_MOVES_PRESENT__")
            return _messages.GetForLanguage(lang, "legalize.invalidRelearnMovesPresent");

        var match = Regex.Match(issue, @"^(?<icon>⚠️|❌)\s(?<name>.+?):\s(?<comment>.+)$");
        if (!match.Success)
            return issue;

        var icon = match.Groups["icon"].Value;
        var token = match.Groups["name"].Value;
        var name = LocalizeCheckName(token, lang);
        var comment = _messages.GetForLanguage(lang, "legalize.checkFailed", name);
        return $"{icon} {name}: {comment}";
    }

    private string LocalizeCheckName(string token, string? lang)
    {
        var key = token switch
        {
            "__LEGALIZE_CHECK_NAME_ENCOUNTER__" => "legalize.checkName.encounter",
            "__LEGALIZE_CHECK_NAME_CURRENT_MOVE__" => "legalize.checkName.currentMove",
            "__LEGALIZE_CHECK_NAME_RELEARN_MOVE__" => "legalize.checkName.relearnMove",
            "__LEGALIZE_CHECK_NAME_SHINY__" => "legalize.checkName.shiny",
            "__LEGALIZE_CHECK_NAME_GENDER__" => "legalize.checkName.gender",
            "__LEGALIZE_CHECK_NAME_LANGUAGE__" => "legalize.checkName.language",
            "__LEGALIZE_CHECK_NAME_NICKNAME__" => "legalize.checkName.nickname",
            "__LEGALIZE_CHECK_NAME_TRAINER__" => "legalize.checkName.trainer",
            "__LEGALIZE_CHECK_NAME_LEVEL__" => "legalize.checkName.level",
            "__LEGALIZE_CHECK_NAME_BALL__" => "legalize.checkName.ball",
            "__LEGALIZE_CHECK_NAME_MEMORY__" => "legalize.checkName.memory",
            "__LEGALIZE_CHECK_NAME_GEOGRAPHY__" => "legalize.checkName.geography",
            "__LEGALIZE_CHECK_NAME_FORM__" => "legalize.checkName.form",
            "__LEGALIZE_CHECK_NAME_EGG__" => "legalize.checkName.egg",
            "__LEGALIZE_CHECK_NAME_MISC__" => "legalize.checkName.misc",
            "__LEGALIZE_CHECK_NAME_FATEFUL__" => "legalize.checkName.fateful",
            "__LEGALIZE_CHECK_NAME_RIBBON__" => "legalize.checkName.ribbon",
            "__LEGALIZE_CHECK_NAME_TRAINING__" => "legalize.checkName.training",
            "__LEGALIZE_CHECK_NAME_ABILITY__" => "legalize.checkName.ability",
            "__LEGALIZE_CHECK_NAME_EVOLUTION__" => "legalize.checkName.evolution",
            "__LEGALIZE_CHECK_NAME_NATURE__" => "legalize.checkName.nature",
            "__LEGALIZE_CHECK_NAME_GAME_ORIGIN__" => "legalize.checkName.gameOrigin",
            "__LEGALIZE_CHECK_NAME_HELD_ITEM__" => "legalize.checkName.heldItem",
            "__LEGALIZE_CHECK_NAME_RIBBON_MARK__" => "legalize.checkName.ribbonMark",
            "__LEGALIZE_CHECK_NAME_MARKING__" => "legalize.checkName.marking",
            _ => null
        };

        return key == null ? token : _messages.GetForLanguage(lang, key);
    }

    private static string NormalizePkhexLanguage(string? lang) => lang switch
    {
        "zh-Hans" => "zh-Hans",
        "zh-Hant" => "zh-Hant",
        "es-419" => "es",
        _ when string.IsNullOrWhiteSpace(lang) => "zh-Hans",
        _ => lang!
    };

    /// <summary>Set a property by name using reflection, with automatic type conversion.</summary>
    private static void SetPropertyValue(object obj, string propertyName, object value)
    {
        var prop = obj.GetType().GetProperty(propertyName);
        if (prop == null) return;
        var targetType = Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType;
        try
        {
            var convertedValue = Convert.ChangeType(value, targetType);
            prop.SetValue(obj, convertedValue);
        }
        catch { /* silently skip if conversion fails */ }
    }
}
