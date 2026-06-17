namespace PkManager.Server.Helpers;

public class LanguageResolver : ILanguageResolver
{
    private static readonly HashSet<string> SupportedLangs = new(StringComparer.OrdinalIgnoreCase)
    {
        "zh-Hans", "zh-Hant", "en", "ja", "fr", "it", "de", "es", "es-419", "ko"
    };

    private readonly IHttpContextAccessor _httpContextAccessor;

    public LanguageResolver(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string CurrentLang
    {
        get
        {
            var ctx = _httpContextAccessor.HttpContext;
            if (ctx == null)
                return "zh-Hans";

            if (ctx.Items.TryGetValue("resolved_lang", out var value) && value is string lang)
                return lang;

            return "zh-Hans";
        }
    }

    public string ResolveOrDefault(string? lang)
    {
        if (string.Equals(lang, "zh-Hans", StringComparison.OrdinalIgnoreCase))
            return "zh-Hans";
        if (string.Equals(lang, "zh-Hant", StringComparison.OrdinalIgnoreCase))
            return "zh-Hant";
        if (string.Equals(lang, "es-419", StringComparison.OrdinalIgnoreCase))
            return "es-419";

        var normalized = lang switch
        {
            "zh" or "zh-CN" or "zh-cn" => "zh-Hans",
            "zh-TW" or "zh-tw" or "zh-HK" or "zh-hk" => "zh-Hant",
            "en-US" or "en-us" or "en-GB" or "en-gb" => "en",
            "es-MX" or "es-mx" or "es-AR" or "es-ar" => "es-419",
            _ when string.IsNullOrWhiteSpace(lang) => "zh-Hans",
            _ when lang.StartsWith("zh-", StringComparison.OrdinalIgnoreCase) =>
                lang.Equals("zh-HK", StringComparison.OrdinalIgnoreCase) ||
                lang.Equals("zh-MO", StringComparison.OrdinalIgnoreCase)
                    ? "zh-Hant"
                    : "zh-Hans",
            _ when lang.StartsWith("es-", StringComparison.OrdinalIgnoreCase) =>
                lang.Equals("es-419", StringComparison.OrdinalIgnoreCase) ? "es-419" : "es",
            _ when lang.Contains('-', StringComparison.Ordinal) => lang.Split('-')[0],
            _ => lang
        };

        return SupportedLangs.Contains(normalized) ? normalized : "zh-Hans";
    }
}
