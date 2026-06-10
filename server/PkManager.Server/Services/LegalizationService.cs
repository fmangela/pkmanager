using PKHeX.Core;
using PkManager.Server.Models.Request;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

/// <summary>
/// 合法性生成与自动修复服务 — 封装 PKHeX.Core EncounterMovesetGenerator + LegalityAnalysis API。
/// 提供: Showdown导入 / 模板生成 / 自动修复 三大能力。
/// </summary>
public class LegalizationService
{
    private readonly PokemonEditService _editService;

    public LegalizationService(PokemonEditService editService)
    {
        _editService = editService;
    }

    // ── Showdown 导入 ──────────────────────────────────────

    /// <summary>
    /// 从 Showdown 文本解析并生成合法宝可梦。多套文本只取第一只。
    /// </summary>
    public (PKM? Pkm, string? Error, string? EncounterType) GenerateFromShowdown(
        ShowdownImportRequest request, ITrainerInfo trainerInfo)
    {
        // 1. 解析 Showdown 文本（支持多套，只取第一只）
        List<ShowdownSet> sets;
        try
        {
            sets = ShowdownParsing.GetShowdownSets(request.ShowdownText).ToList();
        }
        catch (Exception ex)
        {
            return (null, $"Showdown 格式解析失败: {ex.Message}", null);
        }

        if (sets.Count == 0)
            return (null, "未识别到有效的 Showdown 格式文本", null);

        var set = sets[0];
        if (set.Species == 0)
            return (null, "无法识别物种名称，请检查拼写", null);

        // 2. 创建空白 PKM 并投影 ShowdownSet 字段
        var pk = EntityBlank.GetBlank(trainerInfo);

        try
        {
            pk.Species = set.Species;
            pk.Form = set.Form;
            if (set.Gender.HasValue)
                pk.Gender = set.Gender.Value;
            pk.CurrentLevel = (byte)Math.Clamp((int)set.Level, 1, 100);

            // IsShiny 只读 → 用 SetShiny()
            if (set.Shiny)
                pk.SetShiny();

            if (set.Nature.IsFixed)
                pk.SetNature(set.Nature);

            // Ability: ShowdownSet.Ability 是 int (ability ID)
            if (set.Ability >= 0)
            {
                var slot = MapAbilityIdToSlot(set.Ability, pk.PersonalInfo);
                if (slot == null)
                    return (null, $"特性 #{set.Ability} 不适用于该物种", null);
                pk.AbilityNumber = slot.Value;
            }
        }
        catch (Exception ex)
        {
            return (null, $"字段投影失败: {ex.Message}", null);
        }

        // 3. 获取招式列表
        var moves = new ReadOnlyMemory<ushort>(set.Moves);

        // 4. 搜索合法遭遇
        var version = (GameVersion)request.TargetGameVersion;
        IEnumerable<IEncounterable> encounters;
        try
        {
            encounters = EncounterMovesetGenerator.GenerateEncounters(pk, trainerInfo, moves, version);
        }
        catch (Exception ex)
        {
            return (null, $"遭遇搜索失败: {ex.Message}", null);
        }

        // 5. 逐个尝试生成
        foreach (var enc in encounters)
        {
            try
            {
                if (enc is not IEncounterConvertible convertible)
                    continue;

                var criteria = EncounterCriteria.Unrestricted;
                var generated = convertible.ConvertToPKM(trainerInfo, criteria);
                if (generated == null)
                    continue;

                // 应用 ShowdownSet 全部字段到生成结果
                ApplyShowdownTraits(generated, set);

                var la = new LegalityAnalysis(generated);
                if (la.Valid)
                    return (generated, null, enc.GetType().Name);
            }
            catch
            {
                continue;
            }
        }

        return (null, "未找到合法遭遇模板，请检查物种、招式组合或目标版本", null);
    }

    // ── 模板生成 ────────────────────────────────────────────

    /// <summary>
    /// 从模板（物种 + 版本 + 可选约束）生成合法宝可梦。
    /// </summary>
    public (PKM? Pkm, string? Error, List<string> Changes) GenerateFromTemplate(
        LegalizationRequest request, ITrainerInfo trainerInfo)
    {
        var changes = new List<string>();

        // 1. 创建空白 PKM
        var blank = EntityBlank.GetBlank(trainerInfo);

        blank.Species = (ushort)request.Species;
        blank.Form = (byte)(request.Form ?? 0);
        blank.Gender = request.Gender ?? blank.GetSaneGender();
        blank.CurrentLevel = (byte)(request.Level ?? 50);

        // 2. 构建 EncounterCriteria
        var criteria = EncounterCriteria.Unrestricted;
        if (request.Nature.HasValue)
            criteria = criteria with { Nature = (Nature)request.Nature.Value };
        if (request.IsShiny == true)
            criteria = criteria with { Shiny = Shiny.Always };

        // Ability: ID → 槽位映射，不匹配则 fail
        if (request.Ability.HasValue)
        {
            var slot = MapAbilityIdToSlot(request.Ability.Value, blank.PersonalInfo);
            if (slot == null)
                return (null, "请求的特性不适用于该物种", changes);
            criteria = criteria with { Ability = SlotToAbilityPermission(slot.Value) };
        }

        // 3. 构建招式列表
        var moves = request.DesiredMoves is { Length: > 0 }
            ? new ReadOnlyMemory<ushort>(request.DesiredMoves.Select(m => (ushort)m).ToArray())
            : new ReadOnlyMemory<ushort>();

        // 4. 搜索遭遇
        var version = (GameVersion)request.TargetGameVersion;
        IEnumerable<IEncounterable> encounters;
        try
        {
            encounters = EncounterMovesetGenerator.GenerateEncounters(blank, trainerInfo, moves, version);
        }
        catch (Exception ex)
        {
            return (null, $"遭遇搜索失败: {ex.Message}", changes);
        }

        // 5. 逐个尝试生成
        foreach (var enc in encounters)
        {
            try
            {
                if (enc is not IEncounterConvertible convertible)
                    continue;

                var pk = convertible.ConvertToPKM(trainerInfo, criteria);
                if (pk == null)
                    continue;

                // 先验证生成结果，再应用用户指定的覆写字段
                var la = new LegalityAnalysis(pk);
                if (!la.Valid)
                    continue;

                changes.Add($"EncounterType={enc.GetType().Name}");
                changes.Add($"MetLocation={pk.MetLocation}");
                changes.Add($"OriginGame={pk.Version}");

                // 保留用户指定的 OT 信息
                if (request.PreserveOT && !string.IsNullOrEmpty(request.OriginalTrainerName))
                {
                    pk.OriginalTrainerName = request.OriginalTrainerName;
                    changes.Add("PreservedOT");
                }

                // 显式写回 DesiredMoves（encounter search 只筛选，这里覆盖最终招式）
                if (request.DesiredMoves is { Length: > 0 })
                {
                    for (int i = 0; i < 4; i++)
                        pk.SetMove(i, i < request.DesiredMoves.Length
                            ? (ushort)request.DesiredMoves[i] : (ushort)0);
                }

                // 覆写字段后复验合法性（OT名称/招式变更可能引入新的非法性）
                if (request.PreserveOT || request.DesiredMoves is { Length: > 0 })
                {
                    var la2 = new LegalityAnalysis(pk);
                    if (!la2.Valid)
                        continue;
                }

                return (pk, null, changes);
            }
            catch
            {
                continue;
            }
        }

        return (null, "未找到合法遭遇模板，请调整物种、招式或目标版本", changes);
    }

    // ── 自动修复 ────────────────────────────────────────────

    /// <summary>
    /// 对非法宝可梦应用自动修复（临时状态，不持久化）。
    /// 先 Apply 当前编辑快照，再按 capability 分层执行修复。
    /// </summary>
    public AutoFixResultDto AutoFix(PKM pkm, PokemonEditRequest editSnapshot,
        string[]? fixActions, ITrainerInfo trainerInfo)
    {
        var result = new AutoFixResultDto();

        // Step 0: 应用当前编辑状态（解决修旧 base64 问题）
        try
        {
            _editService.ApplyEditsToPkm(pkm, editSnapshot);
        }
        catch (Exception ex)
        {
            result.FailedFixes.Add($"ApplyEdits: {ex.Message}");
            result.Status = LegalityStatus.Illegal;
            result.Report = ex.Message;
            return result;
        }

        // Step 1: 运行 LegalityAnalysis
        var la = new LegalityAnalysis(pkm);
        if (la.Valid)
        {
            result.Fixed = false;
            result.Status = LegalityStatus.Legal;
            return result;
        }

        var enc = la.EncounterMatch;
        if (enc == null)
        {
            result.FailedFixes.Add("FindEncounter");
            result.Status = LegalityStatus.Illegal;
            result.Report = "无法匹配合法遭遇模板";
            return result;
        }

        // 确定要执行的修复动作：null/空/"all" → 全部 7 项
        var allActions = new[] { "FixBall", "FixMetLocation", "FixMoves", "FixRelearnMoves",
                                "FixAbility", "FixNature", "FixShiny" };
        var actions = fixActions is { Length: > 0 }
                && !(fixActions.Length == 1 && string.Equals(fixActions[0], "all", StringComparison.OrdinalIgnoreCase))
            ? new HashSet<string>(fixActions, StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(allActions, StringComparer.OrdinalIgnoreCase);

        // FixBall — IFixedBall 一定可用
        if (actions.Contains("FixBall"))
        {
            try
            {
                pkm.Ball = enc.FixedBall != Ball.None
                    ? (byte)enc.FixedBall
                    : (byte)Ball.Poke;
                result.AppliedFixes.Add("FixBall");
            }
            catch { result.FailedFixes.Add("FixBall"); }
        }

        // FixMetLocation — ILocation + IVersion 一定可用
        if (actions.Contains("FixMetLocation"))
        {
            try
            {
                pkm.MetLocation = enc.Location != 0 ? (ushort)enc.Location : pkm.MetLocation;
                pkm.Version = enc.Version;
                result.AppliedFixes.Add("FixMetLocation");
            }
            catch { result.FailedFixes.Add("FixMetLocation"); }
        }

        // FixMoves — IMoveset 可选
        if (actions.Contains("FixMoves"))
        {
            try
            {
                if (enc is IMoveset { Moves: { HasMoves: true } })
                {
                    var m = ((IMoveset)enc).Moves;
                    pkm.SetMove(0, m.Move1);
                    pkm.SetMove(1, m.Move2);
                    pkm.SetMove(2, m.Move3);
                    pkm.SetMove(3, m.Move4);
                }
                else if (enc is IEncounterConvertible convertible)
                {
                    var regen = convertible.ConvertToPKM(trainerInfo);
                    if (regen != null)
                    {
                        for (int i = 0; i < 4; i++)
                            pkm.SetMove(i, regen.GetMove(i));
                    }
                }
                result.AppliedFixes.Add("FixMoves");
            }
            catch { result.FailedFixes.Add("FixMoves"); }
        }

        // FixRelearnMoves — IRelearn 可选（回退到 ConvertToPKM）
        if (actions.Contains("FixRelearnMoves"))
        {
            try
            {
                if (enc is IRelearn { Relearn: { HasMoves: true } })
                {
                    var r = ((IRelearn)enc).Relearn;
                    var rl = pkm.RelearnMoves;
                    if (rl != null)
                    {
                        rl[0] = r.Move1;
                        rl[1] = r.Move2;
                        rl[2] = r.Move3;
                        rl[3] = r.Move4;
                    }
                }
                else if (enc is IEncounterConvertible convertible)
                {
                    var regen = convertible.ConvertToPKM(trainerInfo);
                    var rlSrc = regen?.RelearnMoves;
                    var rlDst = pkm.RelearnMoves;
                    if (rlSrc != null && rlDst != null)
                        rlSrc.CopyTo(rlDst);
                }
                result.AppliedFixes.Add("FixRelearnMoves");
            }
            catch { result.FailedFixes.Add("FixRelearnMoves"); }
        }

        // FixAbility
        if (actions.Contains("FixAbility"))
        {
            try
            {
                var ap = enc.Ability;
                if (ap.IsSingleValue(out int slotIndex))
                    pkm.AbilityNumber = slotIndex;
                result.AppliedFixes.Add("FixAbility");
            }
            catch { result.FailedFixes.Add("FixAbility"); }
        }

        // FixNature
        if (actions.Contains("FixNature"))
        {
            try
            {
                if (enc is IFixedNature fn)
                {
                    pkm.SetNature(fn.Nature);
                    result.AppliedFixes.Add("FixNature");
                }
            }
            catch { result.FailedFixes.Add("FixNature"); }
        }

        // FixShiny — 完整处理 Shiny 枚举
        if (actions.Contains("FixShiny"))
        {
            try
            {
                var shinySpec = enc.Shiny;
                switch (shinySpec)
                {
                    case Shiny.Never:
                        if (pkm.IsShiny)
                        {
                            pkm.PID ^= 0x8000_0000;
                            if (pkm.IsShiny) pkm.PID ^= 0x1000_0000;
                        }
                        break;
                    case Shiny.Always:
                        if (!pkm.IsShiny)
                            pkm.SetShiny();
                        break;
                    case Shiny.AlwaysStar:
                        pkm.SetShiny();
                        if (pkm.ShinyXor != 1) pkm.SetShinySID(Shiny.AlwaysStar);
                        break;
                    case Shiny.AlwaysSquare:
                        pkm.SetShiny();
                        if (pkm.ShinyXor != 0) pkm.PID ^= 0x8000_0000;
                        break;
                    case Shiny.FixedValue:
                        if (enc is IEncounterConvertible cvt)
                        {
                            var regen = cvt.ConvertToPKM(trainerInfo);
                            if (regen != null)
                            {
                                pkm.PID = regen.PID;
                                pkm.EncryptionConstant = regen.EncryptionConstant;
                            }
                        }
                        break;
                    // Shiny.Random: no constraint
                }
                result.AppliedFixes.Add("FixShiny");
            }
            catch { result.FailedFixes.Add("FixShiny"); }
        }

        // Gen3-5 Method-1 PID/IV 关联（严格分层触发）
        if (pkm.Generation is >= 3 and <= 5
            && MethodFinder.Analyze(pkm).Type == PIDType.None
            && enc.GetType().Name.Contains("Slot")
            && enc is IEncounterConvertible cv)
        {
            try
            {
                var regen = cv.ConvertToPKM(trainerInfo);
                if (regen != null)
                {
                    pkm.PID = regen.PID;
                    pkm.EncryptionConstant = regen.EncryptionConstant;
                    pkm.IV_HP = regen.IV_HP;
                    pkm.IV_ATK = regen.IV_ATK;
                    pkm.IV_DEF = regen.IV_DEF;
                    pkm.IV_SPA = regen.IV_SPA;
                    pkm.IV_SPD = regen.IV_SPD;
                    pkm.IV_SPE = regen.IV_SPE;
                }
            }
            catch { /* non-critical */ }
        }

        // 修复后验证
        var postLa = new LegalityAnalysis(pkm);
        result.Status = ComputeLegalityStatus(postLa);
        result.Fixed = result.AppliedFixes.Count > 0;
        result.UpdatedPokemon = ParseService.MapToPokemonDto(pkm);
        result.PkmDataBase64 = GetPkmBase64(pkm);
        result.Judgements = postLa.Results.Select(r => new JudgementDto
        {
            Identifier = r.Identifier.ToString(),
            Judgement = r.Judgement.ToString(),
            Comment = "",
            Issue = GetHumanReadableIssue(r),
            CanFix = CanAutoFix(r),
            FixAction = GetFixAction(r)
        }).ToList();

        if (result.Status != LegalityStatus.Legal)
            result.Report = postLa.Report();

        return result;
    }

    // ── Showdown 解析（仅预览，不生成）──────────────────────

    /// <summary>
    /// 解析 Showdown 文本为预览列表（不执行遭遇搜索）。
    /// </summary>
    public List<ShowdownSetPreviewDto> ParseShowdownText(string text)
    {
        var sets = ShowdownParsing.GetShowdownSets(text).ToList();
        var strings = GameInfo.GetStrings("zh");

        return sets.Select(set =>
        {
            var moves = set.Moves
                .Where(m => m != 0)
                .Select(m => m < strings.Move.Count ? strings.Move[m] : $"#{m}")
                .ToArray();

            return new ShowdownSetPreviewDto
            {
                Species = set.Species < strings.Species.Count
                    ? strings.Species[set.Species] : $"#{set.Species}",
                SpeciesId = set.Species,
                Nickname = set.Nickname,
                Level = set.Level,
                Shiny = set.Shiny,
                Gender = set.Gender?.ToString(),
                Ability = set.Ability >= 0 && set.Ability < strings.Ability.Count
                    ? strings.Ability[set.Ability] : null,
                Nature = set.Nature.IsFixed ? set.Nature.ToString() : null,
                Item = set.HeldItem > 0 && set.HeldItem < strings.Item.Count
                    ? strings.Item[set.HeldItem] : null,
                Moves = moves,
                Form = set.FormName,
                RawText = set.Text
            };
        }).ToList();
    }

    // ── 缓存（银行批扫结果）── 已迁移至 LegalityCacheService（单一数据源）─────────────────

    // ── 辅助方法 ────────────────────────────────────────────

    /// <summary>
    /// 将 ShowdownSet 中的用户指定字段投影到已生成的 PKM 上。
    /// Nature/Ability 在此方法中处理；Nickname/HeldItem/IVs/EVs/Friendship/Moves 也写回。
    /// </summary>
    private static void ApplyShowdownTraits(PKM pk, ShowdownSet set)
    {
        // Nature
        if (set.Nature.IsFixed)
            pk.SetNature(set.Nature);

        // Ability
        if (set.Ability >= 0 && pk.PersonalInfo != null)
        {
            var slot = MapAbilityIdToSlot(set.Ability, pk.PersonalInfo);
            if (slot.HasValue)
                pk.AbilityNumber = slot.Value;
        }

        // Nickname
        if (!string.IsNullOrEmpty(set.Nickname))
            pk.Nickname = set.Nickname;

        // HeldItem
        if (set.HeldItem > 0)
            pk.HeldItem = set.HeldItem;

        // IVs
        if (set.IVs is { Length: 6 })
        {
            pk.IV_HP  = set.IVs[0]; pk.IV_ATK = set.IVs[1]; pk.IV_DEF = set.IVs[2];
            pk.IV_SPA = set.IVs[3]; pk.IV_SPD = set.IVs[4]; pk.IV_SPE = set.IVs[5];
        }

        // EVs
        if (set.EVs is { Length: 6 })
        {
            pk.EV_HP  = set.EVs[0]; pk.EV_ATK = set.EVs[1]; pk.EV_DEF = set.EVs[2];
            pk.EV_SPA = set.EVs[3]; pk.EV_SPD = set.EVs[4]; pk.EV_SPE = set.EVs[5];
        }

        // Friendship — 仅当 Showdown 文本显式声明时才覆盖（否则保留 ConvertToPKM 生成的物种基础值）
        if (set.Text.Contains("Friendship:", StringComparison.OrdinalIgnoreCase))
            pk.OriginalTrainerFriendship = (byte)Math.Clamp((int)set.Friendship, 0, 255);

        // Moves — 显式写回招式（encounter search 只用于筛选，这里覆盖最终结果）
        var moves = set.Moves;
        if (moves.Length >= 4)
        {
            for (int i = 0; i < 4; i++)
                pk.SetMove(i, i < moves.Length ? moves[i] : (ushort)0);
        }
    }

    /// <summary>PKM → Base64（v26: DecryptedPartyData→WriteDecryptedDataParty）</summary>
    private static string GetPkmBase64(PKM pkm)
    {
        var buffer = new byte[pkm.SIZE_PARTY];
        pkm.WriteDecryptedDataParty(buffer);
        return Convert.ToBase64String(buffer);
    }

    /// <summary>
    /// 将能力 ID 映射为 PKHeX 的能力槽位索引 (0=第一特性, 1=第二特性, 2=梦特)。
    /// 不匹配时返回 null（不降级到 Any12）。
    /// </summary>
    public static int? MapAbilityIdToSlot(int abilityId, IPersonalInfo pi)
    {
        var idx = pi.GetIndexOfAbility(abilityId);
        return idx >= 0 ? idx : null;
    }

    /// <summary>
    /// 将能力槽位索引转为 EncounterCriteria 的 AbilityPermission。
    /// </summary>
    private static AbilityPermission SlotToAbilityPermission(int slotIndex) => slotIndex switch
    {
        0 => AbilityPermission.OnlyFirst,
        1 => AbilityPermission.OnlySecond,
        2 => AbilityPermission.OnlyHidden,
        _ => AbilityPermission.Any12
    };

    // ── 公开的合法性辅助方法（从 PokemonEditService 提升，供 BankService 等复用）─

    public static LegalityStatus ComputeLegalityStatus(LegalityAnalysis la)
    {
        if (la.Valid) return LegalityStatus.Legal;

        var hasInvalid = la.Results.Any(r => r.Judgement == Severity.Invalid)
                         || !MoveResult.AllValid(la.Info.Moves)
                         || !MoveResult.AllValid(la.Info.Relearn);

        if (hasInvalid) return LegalityStatus.Illegal;

        var hasFishy = la.Results.Any(r => r.Judgement == Severity.Fishy);
        return hasFishy ? LegalityStatus.Fishy : LegalityStatus.Legal;
    }

    public static string GetFirstIssue(LegalityAnalysis la)
    {
        foreach (var r in la.Results)
        {
            if (r.Judgement == Severity.Invalid)
                return GetHumanReadableIssue(r);
        }
        if (!MoveResult.AllValid(la.Info.Moves))
            return "存在不合法招式";
        if (!MoveResult.AllValid(la.Info.Relearn))
            return "存在不合法回忆招式";
        foreach (var r in la.Results)
        {
            if (r.Judgement == Severity.Fishy)
                return GetHumanReadableIssue(r);
        }
        return string.Empty;
    }

    public static string GetHumanReadableIssue(CheckResult r)
    {
        var id = GetChineseCheckName(r.Identifier);
        var comment = $"{id}校验失败";
        return r.Judgement switch
        {
            Severity.Valid => string.Empty,
            Severity.Fishy => $"⚠️ {id}: {comment}",
            Severity.Invalid => $"❌ {id}: {comment}",
            _ => comment
        };
    }

    public static string GetChineseCheckName(CheckIdentifier id) => id switch
    {
        CheckIdentifier.Encounter => "遭遇",
        CheckIdentifier.CurrentMove => "当前招式",
        CheckIdentifier.RelearnMove => "回忆招式",
        CheckIdentifier.Shiny => "闪光",
        CheckIdentifier.Gender => "性别",
        CheckIdentifier.Language => "语言",
        CheckIdentifier.Nickname => "昵称",
        CheckIdentifier.Trainer => "训练家",
        CheckIdentifier.Level => "等级",
        CheckIdentifier.Ball => "球种",
        CheckIdentifier.Memory => "记忆",
        CheckIdentifier.Geography => "地理",
        CheckIdentifier.Form => "形态",
        CheckIdentifier.Egg => "蛋",
        CheckIdentifier.Misc => "杂项",
        CheckIdentifier.Fateful => "命运邂逅",
        CheckIdentifier.Ribbon => "缎带",
        CheckIdentifier.Training => "训练",
        CheckIdentifier.Ability => "特性",
        CheckIdentifier.Evolution => "进化",
        CheckIdentifier.Nature => "性格",
        CheckIdentifier.GameOrigin => "来源版本",
        CheckIdentifier.HeldItem => "持有道具",
        CheckIdentifier.RibbonMark => "证章",
        CheckIdentifier.Marking => "标记",
        _ => id.ToString()
    };

    public static bool CanAutoFix(CheckResult r)
    {
        if (r.Judgement == Severity.Valid) return false;
        return r.Identifier switch
        {
            CheckIdentifier.Ball => true,
            CheckIdentifier.Encounter => true,
            CheckIdentifier.CurrentMove => true,
            CheckIdentifier.RelearnMove => true,
            CheckIdentifier.Ability => true,
            CheckIdentifier.Nature => true,
            CheckIdentifier.Shiny => true,
            _ => false
        };
    }

    public static string? GetFixAction(CheckResult r)
    {
        return r.Identifier switch
        {
            CheckIdentifier.Ball => "FixBall",
            CheckIdentifier.Encounter => "FixMetLocation",
            CheckIdentifier.CurrentMove => "FixMoves",
            CheckIdentifier.RelearnMove => "FixRelearnMoves",
            CheckIdentifier.Ability => "FixAbility",
            CheckIdentifier.Nature => "FixNature",
            CheckIdentifier.Shiny => "FixShiny",
            _ => null
        };
    }
}
