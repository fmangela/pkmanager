using PKHeX.Core;

namespace PkManager.Server.Helpers;

public class PkhexStringProvider : IPkhexStringProvider
{
    private readonly ILanguageResolver _languageResolver;

    public PkhexStringProvider(ILanguageResolver languageResolver)
    {
        _languageResolver = languageResolver;
    }

    public GameStrings GetStrings() => GameInfo.GetStrings(_languageResolver.CurrentLang);

    public GameStrings GetStrings(string? lang)
    {
        var resolved = _languageResolver.ResolveOrDefault(lang);
        return GameInfo.GetStrings(resolved);
    }
}
