using System.Text.Json;
using PKHeX.Core;
using PkManager.Server.Helpers;
using PkManager.Server.Localization;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

/// <summary>
/// 一键进化服务 — 查询进化路径、执行进化。
/// PKHeX.Core EvolutionTree 是只读分析系统，进化需手动设置 pk.Species / pk.Form。
/// </summary>
public class EvolutionService
{
    private readonly PokemonEditService _editService;
    private readonly ParseService _parseService;
    private readonly IPkhexStringProvider _pkhexStrings;
    private readonly IBackendMessageLocalizer _messages;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public EvolutionService(
        PokemonEditService editService,
        ParseService parseService,
        IPkhexStringProvider pkhexStrings,
        IBackendMessageLocalizer messages)
    {
        _editService = editService;
        _parseService = parseService;
        _pkhexStrings = pkhexStrings;
        _messages = messages;
    }

    private string Text(string key, params object?[] args) => _messages.Get(key, args);

    /// <summary>
    /// 将前端 editSnapshot (camelCase Dictionary) 应用到 PKM。
    /// editSnapshot 的 key 与 PokemonEditRequest 属性名对应（小驼峰 vs PascalCase）。
    /// </summary>
    private void ApplyEditSnapshot(PKM pkm, Dictionary<string, object?>? editSnapshot)
    {
        if (editSnapshot == null || editSnapshot.Count == 0) return;

        // System.Text.Json 默认将 Dictionary<string,object?> 序列化为 JSON object。
        // editSnapshot 的 key 已是 camelCase（来自前端 buildEditRequest 输出）。
        var json = JsonSerializer.Serialize(editSnapshot);
        var request = JsonSerializer.Deserialize<PokemonEditRequest>(json, _jsonOptions);
        if (request != null)
            _editService.ApplyEditsToPkm(pkm, request);
    }

    /// <summary>
    /// 获取当前宝可梦的进化路径（含 TryEvolve 可用性判定）。
    /// </summary>
    public EvolutionPathDto GetEvolutionPaths(PKM pkm, Dictionary<string, object?>? editSnapshot)
    {
        // 1. 应用当前未保存编辑
        ApplyEditSnapshot(pkm, editSnapshot);

        // 2. 获取当前世代的进化树
        var tree = EvolutionTree.GetEvolutionTree(pkm.Context);

        // 3. 获取所有可能的进化方法
        var methods = tree.Forward.GetForward(pkm.Species, pkm.Form);
        if (methods.IsEmpty)
            return new EvolutionPathDto { HasAnyEvolution = false };

        var strings = _pkhexStrings.GetStrings();
        var groupedMethods = new Dictionary<(ushort Species, byte Form), List<EvolutionMethod>>();
        var options = new List<EvolutionOptionDto>();

        foreach (var method in methods.Span)
        {
            var targetSpecies = method.Species;
            var targetForm = method.GetDestinationForm(pkm.Form);
            var key = (targetSpecies, targetForm);
            if (!groupedMethods.TryGetValue(key, out var list))
            {
                list = new List<EvolutionMethod>();
                groupedMethods[key] = list;
            }
            list.Add(method);
        }

        foreach (var ((targetSpecies, targetForm), methodGroup) in groupedMethods)
        {
            var displayMethod = SelectPreferredMethod(methodGroup, pkm, out var displayResult);

            var destForm = targetForm != 0 && targetForm != byte.MaxValue ? targetForm : (byte)0;
            string formName = destForm > 0 ? $"Form {destForm}" : "";

            var target = (ISpeciesForm)new EvoTarget(targetSpecies, destForm);
            bool isAvailable = tree.Forward.TryEvolve(
                pkm, target, pkm,
                pkm.CurrentLevel, pkm.MetLevel, skipChecks: false,
                EvolutionRuleTweak.Default, out _);

            if (isAvailable)
            {
                foreach (var method in methodGroup)
                {
                    var result = GetCheckResult(method, pkm);
                    if (result == EvolutionCheckResult.Valid)
                    {
                        displayMethod = method;
                        displayResult = result;
                        break;
                    }
                }
            }

            string? blockReason = isAvailable ? null : GetBlockReason(displayResult);

            options.Add(new EvolutionOptionDto
            {
                Species = targetSpecies,
                SpeciesName = strings.Species[targetSpecies],
                Form = destForm,
                FormName = formName,
                MethodLabel = GetMethodLabel(displayMethod, strings),
                RequiredLevel = displayMethod.Level,
                Argument = displayMethod.Argument,
                IsAvailable = isAvailable,
                BlockReason = blockReason,
            });

        }

        return new EvolutionPathDto
        {
            HasAnyEvolution = options.Count > 0,
            HasBranchingPaths = options.Count > 1,
            IsNincada = pkm.Species == 290,
            Options = options,
        };
    }

    /// <summary>
    /// 执行进化：应用 editSnapshot → 强制补足可写回条件 → 公共状态同步 → 处理脱壳忍者 → 修改物种/形态 → 写回。
    /// 返回 EvolveResultDto（调用方负责 WriteBackSave 持久化）。
    /// </summary>
    public EvolveResultDto ExecuteEvolve(PKM pkm, PKHeX.Core.SaveFile sav, EvolveRequest request)
    {
        // 1. 应用当前未保存编辑
        ApplyEditSnapshot(pkm, request.EditSnapshot);

        // 2. 获取进化树并找到匹配的 EvolutionMethod
        var tree = EvolutionTree.GetEvolutionTree(pkm.Context);
        var matchedMethods = new List<EvolutionMethod>();
        foreach (var m in tree.Forward.GetForward(pkm.Species, pkm.Form).Span)
        {
            if (m.Species == request.TargetSpecies && m.GetDestinationForm(pkm.Form) == request.TargetForm)
                matchedMethods.Add(m);
        }
        if (matchedMethods.Count == 0)
            return new EvolveResultDto { Success = false, Error = Text("evolution.targetNotInPath") };

        var method = SelectPreferredMethod(matchedMethods, pkm, out _);

        // 3. 强制补齐可直接写回的进化条件
        ApplyForcedEvolutionConditions(pkm, method);

        // 4. 按宝可梦自身语言获取物种名（用于昵称同步）
        var langCode = GetLanguageCode(pkm.Language);
        var langStrings = GameInfo.GetStrings(langCode);

        // 5. 昵称同步：仅当未自定义昵称时，用对应语言的物种名更新
        if (!pkm.IsNicknamed)
        {
            var nameList = langStrings.Species;
            if (request.TargetSpecies < nameList.Count)
                pkm.Nickname = nameList[request.TargetSpecies];
        }

        // 6. Nincada → Shedinja 特例（在状态同步后克隆，共享 level/exp）
        EvolveResultDto? shedinjaResult = null;
        if (pkm.Species == 290 && request.TargetSpecies == 291 && request.AlsoCreateShedinja)
        {
            PKM shedinja;
            try
            {
                shedinja = pkm.Clone();
            }
            catch
            {
                var buf = new byte[pkm.SIZE_PARTY];
                pkm.WriteDecryptedDataParty(buf);
                shedinja = EntityFormat.GetFromBytes(buf)!;
                if (shedinja == null)
                    return new EvolveResultDto { Success = false, Error = Text("evolution.cloneFailed") };
            }

            shedinja.Species = 292;  // Shedinja
            shedinja.Form = 0;
            shedinja.IsNicknamed = false;
            // Shedinja 使用与 Nincada 相同的语言/物种名
            var nameList = langStrings.Species;
            if (292 < nameList.Count)
                shedinja.Nickname = nameList[292];

            // 找第一个空箱位
            (int boxIdx, int slotIdx)? emptySlot = null;
            for (int b = 0; b < sav.BoxCount; b++)
            {
                var boxData = sav.GetBoxData(b);
                for (int s = 0; s < boxData.Length; s++)
                {
                    if (boxData[s].Species == 0)
                    {
                        emptySlot = (b, s);
                        break;
                    }
                }
                if (emptySlot.HasValue) break;
            }

            if (!emptySlot.HasValue)
                return new EvolveResultDto { Success = false, Error = Text("evolution.noShedinjaSlot") };

            var (sBox, sSlot) = emptySlot.Value;
            var compatShedinja = sav.GetCompatiblePKM(shedinja);
            var boxData2 = sav.GetBoxData(sBox);
            boxData2[sSlot] = compatShedinja;
            sav.SetBoxData(boxData2, sBox);

            shedinjaResult = new EvolveResultDto
            {
                Shedinja = _parseService.MapToPokemonDto(compatShedinja),
                ShedinjaLocation = $"Box {sBox + 1} Slot {sSlot + 1}",
            };
        }

        // 7. 执行进化
        pkm.Species = (ushort)request.TargetSpecies;
        if (method.Form != byte.MaxValue) // AnyForm → 保留当前形态
            pkm.Form = method.Form;

        // 8. 写回原始槽位，返回 compat（实际落盘对象）
        PKM compat;
        if (request.IsParty)
        {
            if (request.SlotIndex < 0 || request.SlotIndex >= 6)
                return new EvolveResultDto { Success = false, Error = Text("evolution.invalidPartySlot") };
            compat = sav.GetCompatiblePKM(pkm);
            sav.SetPartySlotAtIndex(compat, request.SlotIndex);
        }
        else
        {
            if (request.BoxIndex < 0 || request.BoxIndex >= sav.BoxCount)
                return new EvolveResultDto { Success = false, Error = Text("evolution.invalidBoxIndex") };
            var boxData = sav.GetBoxData(request.BoxIndex);
            if (request.SlotIndex < 0 || request.SlotIndex >= boxData.Length)
                return new EvolveResultDto { Success = false, Error = Text("evolution.invalidBoxSlot") };
            compat = sav.GetCompatiblePKM(pkm);
            boxData[request.SlotIndex] = compat;
            sav.SetBoxData(boxData, request.BoxIndex);
        }

        // 9. 返回 compat（实际落盘对象），与现有保存链路一致
        return new EvolveResultDto
        {
            Success = true,
            EvolvedPokemon = _parseService.MapToPokemonDto(compat),
            Shedinja = shedinjaResult?.Shedinja,
            ShedinjaLocation = shedinjaResult?.ShedinjaLocation,
        };
    }

    /// <summary>
    /// PKHeX 语言 ID → ISO 语言代码映射。
    /// </summary>
    private static string GetLanguageCode(int langId) => langId switch
    {
        1 => "ja",
        2 => "en",
        3 => "fr",
        4 => "it",
        5 => "de",
        7 => "es",
        8 => "ko",
        9 => "zh",       // 简体中文
        10 => "zh-Hant", // 繁體中文
        _ => "en",       // 回退
    };

    /// <summary>
    /// 将 EvolutionCheckResult 映射为中文阻塞原因。
    /// </summary>
    private static EvolutionCheckResult GetCheckResult(EvolutionMethod method, PKM pkm) =>
        method.Check(pkm, (byte)pkm.CurrentLevel, pkm.MetLevel,
            skipChecks: false, EvolutionRuleTweak.Default);

    private static EvolutionMethod SelectPreferredMethod(
        IReadOnlyList<EvolutionMethod> methods,
        PKM pkm,
        out EvolutionCheckResult result)
    {
        foreach (var method in methods)
        {
            var check = GetCheckResult(method, pkm);
            if (check == EvolutionCheckResult.Valid)
            {
                result = check;
                return method;
            }
        }

        var fallback = methods.OrderBy(m => m.Level).First();
        result = GetCheckResult(fallback, pkm);
        return fallback;
    }

    /// <summary>
    /// 强制补足可直接写回的进化条件。
    /// 目标是尽量让当前 PKM 满足目标进化方式，而不是严格模拟游戏内交互。
    /// </summary>
    private void ApplyForcedEvolutionConditions(PKM pkm, EvolutionMethod method)
    {
        if (method.Level > 0 && pkm.CurrentLevel < method.Level)
            pkm.CurrentLevel = method.Level;

        switch (method.Method)
        {
            case EvolutionType.LevelUpMale:
                pkm.Gender = 0;
                break;

            case EvolutionType.LevelUpFemale:
            case EvolutionType.LevelUpFormFemale1:
                pkm.Gender = 1;
                break;

            case EvolutionType.LevelUpFriendship:
            case EvolutionType.LevelUpFriendshipMorning:
            case EvolutionType.LevelUpFriendshipNight:
            case EvolutionType.LevelUpWithTeammate:
                pkm.OriginalTrainerFriendship = 255;
                break;

            case EvolutionType.LevelUpBeauty:
                if (pkm is IContestStats contest)
                    contest.ContestBeauty = 255;
                break;

            case EvolutionType.LevelUpAffection50MoveType:
                SetAffection(pkm, 255);
                pkm.OriginalTrainerFriendship = 255;
                if (TryGetMoveOfType(pkm, method.Argument, out var affectionMove))
                    pkm.SetMove(0, affectionMove);
                break;

            case EvolutionType.LevelUpKnowMove:
            case EvolutionType.LevelUpKnowMoveECElse:
            case EvolutionType.LevelUpKnowMoveEC100:
                if (method.Argument > 0)
                    pkm.SetMove(0, method.Argument);
                break;

            case EvolutionType.LevelUpMoveType:
                if (TryGetMoveOfType(pkm, method.Argument, out var moveId))
                    pkm.SetMove(0, moveId);
                break;

            case EvolutionType.LevelUpUseMoveSpecial:
                if (method.Argument > 0)
                    pkm.SetMove(0, method.Argument);
                break;

            case EvolutionType.Trade:
            case EvolutionType.TradeHeldItem:
            case EvolutionType.TradeShelmetKarrablast:
                ApplyTradedState(pkm);
                break;
        }
    }

    private static void ApplyTradedState(PKM pkm)
    {
        // 通讯进化在 PKHeX 中主要依赖“已交换”状态。
        // 这里补足处理者信息，避免进化后被判定为 Untraded。
        var handledName = pkm.OriginalTrainerName;
        if (string.IsNullOrWhiteSpace(handledName))
            handledName = "PKHeX";

        var nameProp = pkm.GetType().GetProperty("HandlingTrainerName");
        nameProp?.SetValue(pkm, handledName);

        var genderProp = pkm.GetType().GetProperty("HandlingTrainerGender");
        if (genderProp != null)
        {
            var gender = pkm.OriginalTrainerGender;
            if (gender < 0)
                gender = 0;
            genderProp.SetValue(pkm, gender);
        }

        var languageProp = pkm.GetType().GetProperty("HandlingTrainerLanguage");
        if (languageProp != null)
            languageProp.SetValue(pkm, pkm.Language);

        // 保险起见，补满处理者亲密度，避免后续展示或校验出现低值状态。
        try
        {
            pkm.HandlingTrainerFriendship = 255;
        }
        catch
        {
            // 某些类型/版本可能不支持，忽略即可。
        }
    }

    private static void SetAffection(PKM pkm, int value)
    {
        var prop = pkm.GetType().GetProperty("Affection");
        prop?.SetValue(pkm, (byte)Math.Clamp(value, 0, 255));
    }

    private bool TryGetMoveOfType(PKM pkm, ushort typeId, out ushort moveId)
    {
        moveId = 0;
        var strings = _pkhexStrings.GetStrings();
        for (ushort id = 1; id < strings.Move.Count; id++)
        {
            try
            {
                if (MoveInfo.GetType(id, pkm.Context) == typeId)
                {
                    moveId = id;
                    return true;
                }
            }
            catch
            {
                // Ignore invalid IDs for this context and keep scanning.
            }
        }
        return false;
    }

    private string GetBlockReason(EvolutionCheckResult result) =>
        result switch
        {
            EvolutionCheckResult.Valid => Text("evolution.blockReasonUnknown"),
            EvolutionCheckResult.InsufficientLevel => Text("evolution.blockReasonLevel"),
            EvolutionCheckResult.BadGender => Text("evolution.blockReasonGender"),
            EvolutionCheckResult.BadForm => Text("evolution.blockReasonForm"),
            EvolutionCheckResult.WrongEC => Text("evolution.blockReasonEc"),
            EvolutionCheckResult.VisitVersion => Text("evolution.blockReasonVersion"),
            EvolutionCheckResult.LowContestStat => Text("evolution.blockReasonContest"),
            EvolutionCheckResult.Untraded => Text("evolution.blockReasonTrade"),
            _ => Text("evolution.blockReasonGeneric", result),
        };

    /// <summary>
    /// 将 EvolutionMethod 映射为当前请求语言的进化方式标签。
    /// 覆盖 Gen1-7 使用的 ~30 种进化类型，其余回退到通用标签。
    /// </summary>
    private string GetMethodLabel(EvolutionMethod m, GameStrings strings)
    {
        string ItemName(int id) =>
            id > 0 && id < strings.Item.Count ? strings.Item[id] : Text("evolution.method.itemFallback", id);

        return m.Method switch
        {
            EvolutionType.LevelUp => m.Level > 1
                ? Text("evolution.method.levelUpAbove", m.Level)
                : Text("evolution.method.levelUp"),
            EvolutionType.LevelUpFriendship => Text("evolution.method.friendship", m.Level),
            EvolutionType.LevelUpFriendshipMorning => Text("evolution.method.friendshipMorning", m.Level),
            EvolutionType.LevelUpFriendshipNight => Text("evolution.method.friendshipNight", m.Level),
            EvolutionType.LevelUpATK => Text("evolution.method.levelUpAtk", m.Level),
            EvolutionType.LevelUpAeqD => Text("evolution.method.levelUpAeqD", m.Level),
            EvolutionType.LevelUpDEF => Text("evolution.method.levelUpDef", m.Level),
            EvolutionType.LevelUpECl5 => Text("evolution.method.levelUpEcLow", m.Level),
            EvolutionType.LevelUpECgeq5 => Text("evolution.method.levelUpEcHigh", m.Level),
            EvolutionType.LevelUpMale => Text("evolution.method.levelUpMale", m.Level),
            EvolutionType.LevelUpFemale => Text("evolution.method.levelUpFemale", m.Level),
            EvolutionType.LevelUpKnowMove => Text("evolution.method.knowMove", m.Argument, m.Level),
            EvolutionType.LevelUpBeauty => Text("evolution.method.beauty", m.Argument),
            EvolutionType.LevelUpVersion => Text("evolution.method.version", m.Level),
            EvolutionType.LevelUpVersionDay => Text("evolution.method.versionDay", m.Level),
            EvolutionType.LevelUpVersionNight => Text("evolution.method.versionNight", m.Level),
            EvolutionType.LevelUpMorning => Text("evolution.method.morning", m.Level),
            EvolutionType.LevelUpNight => Text("evolution.method.night", m.Level),
            EvolutionType.LevelUpDusk => Text("evolution.method.dusk", m.Level),
            EvolutionType.LevelUpElectric => Text("evolution.method.electric", m.Level),
            EvolutionType.LevelUpForest => Text("evolution.method.forest", m.Level),
            EvolutionType.LevelUpCold => Text("evolution.method.cold", m.Level),
            EvolutionType.LevelUpSummit => Text("evolution.method.summit", m.Level),
            EvolutionType.LevelUpWormhole => Text("evolution.method.wormhole", m.Level),
            EvolutionType.UseItem => Text("evolution.method.useItem", ItemName(m.Argument)),
            EvolutionType.UseItemMale => Text("evolution.method.useItemMale", ItemName(m.Argument)),
            EvolutionType.UseItemFemale => Text("evolution.method.useItemFemale", ItemName(m.Argument)),
            EvolutionType.UseItemWormhole => Text("evolution.method.useItemWormhole", ItemName(m.Argument)),
            EvolutionType.UseItemFullMoon => Text("evolution.method.useItemFullMoon", ItemName(m.Argument)),
            EvolutionType.Trade => Text("evolution.method.trade"),
            EvolutionType.TradeHeldItem => Text("evolution.method.tradeHeldItem", ItemName(m.Argument)),
            EvolutionType.TradeShelmetKarrablast => Text("evolution.method.tradeShelmetKarrablast"),
            EvolutionType.LevelUpWithTeammate => Text("evolution.method.withTeammate", m.Level),
            EvolutionType.LevelUpHeldItemDay => Text("evolution.method.heldItemDay", ItemName(m.Argument)),
            EvolutionType.LevelUpHeldItemNight => Text("evolution.method.heldItemNight", ItemName(m.Argument)),
            EvolutionType.LevelUpNatureAmped => Text("evolution.method.natureAmped", m.Level),
            EvolutionType.LevelUpNatureLowKey => Text("evolution.method.natureLowKey", m.Level),
            EvolutionType.LevelUpFormFemale1 => Text("evolution.method.formFemale1", m.Level),
            EvolutionType.LevelUpAffection50MoveType => Text("evolution.method.affectionMoveType", m.Level),
            EvolutionType.LevelUpMoveType => Text("evolution.method.moveType", m.Level),
            EvolutionType.LevelUpWeather => Text("evolution.method.weather", m.Level),
            EvolutionType.LevelUpInverted => Text("evolution.method.inverted", m.Level),
            EvolutionType.TowerOfDarkness => Text("evolution.method.towerOfDarkness"),
            EvolutionType.TowerOfWaters => Text("evolution.method.towerOfWaters"),
            EvolutionType.CriticalHitsInBattle => Text("evolution.method.criticalHits"),
            EvolutionType.HitPointsLostInBattle => Text("evolution.method.hitPointsLost"),
            EvolutionType.Spin => Text("evolution.method.spin"),
            EvolutionType.Hisui => Text("evolution.method.hisui"),
            EvolutionType.UseMoveAgileStyle => Text("evolution.method.useMoveAgile"),
            EvolutionType.UseMoveStrongStyle => Text("evolution.method.useMoveStrong"),
            EvolutionType.UseMoveBarbBarrage => Text("evolution.method.useMoveBarbBarrage"),
            EvolutionType.LevelUpWalkStepsWith => Text("evolution.method.walkSteps", m.Argument),
            EvolutionType.LevelUpUnionCircle => Text("evolution.method.unionCircle"),
            EvolutionType.LevelUpInBattleEC100 => Text("evolution.method.inBattleEc100"),
            EvolutionType.LevelUpInBattleECElse => Text("evolution.method.inBattleEcElse"),
            EvolutionType.LevelUpCollect999 => Text("evolution.method.collect999", m.Argument),
            EvolutionType.LevelUpDefeatEquals => Text("evolution.method.defeatEquals"),
            EvolutionType.LevelUpUseMoveSpecial => Text("evolution.method.useMoveSpecial"),
            EvolutionType.LevelUpKnowMoveECElse => Text("evolution.method.knowMoveEcElse"),
            EvolutionType.LevelUpKnowMoveEC100 => Text("evolution.method.knowMoveEc100"),
            EvolutionType.LevelUpRecoilDamageMale => Text("evolution.method.recoilDamageMale"),
            EvolutionType.LevelUpRecoilDamageFemale => Text("evolution.method.recoilDamageFemale"),
            _ => Text("evolution.method.special", m.Method),
        };
    }

    /// <summary>
    /// ISpeciesForm 临时实现，用于 TryEvolve 的 target 参数。
    /// </summary>
    private readonly record struct EvoTarget(ushort Species, byte Form) : ISpeciesForm;
}
