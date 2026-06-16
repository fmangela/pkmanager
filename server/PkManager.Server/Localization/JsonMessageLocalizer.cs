using System.Collections.Concurrent;
using System.Text.Json;
using PkManager.Server.Helpers;

namespace PkManager.Server.Localization;

public class JsonMessageLocalizer : IBackendMessageLocalizer
{
    private static readonly ConcurrentDictionary<string, IReadOnlyDictionary<string, string>> Cache =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlyDictionary<string, string> EmptyMessages =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    private readonly IWebHostEnvironment _env;
    private readonly ILanguageResolver _languageResolver;

    public JsonMessageLocalizer(IWebHostEnvironment env, ILanguageResolver languageResolver)
    {
        _env = env;
        _languageResolver = languageResolver;
    }

    public string Get(string key, params object?[] args) =>
        GetOrFallback(_languageResolver.CurrentLang, key, null, args);

    public string GetForLanguage(string? lang, string key, params object?[] args) =>
        GetOrFallback(lang, key, null, args);

    public string GetOrFallback(string? lang, string key, string? fallbackMessage, params object?[] args)
    {
        var resolvedLang = _languageResolver.ResolveOrDefault(lang);

        var template = TryGetMessage(resolvedLang, key)
            ?? TryGetMessage("zh-Hans", key)
            ?? fallbackMessage
            ?? key;

        return Format(template, args);
    }

    private string? TryGetMessage(string lang, string key)
    {
        var messages = Cache.GetOrAdd(lang, LoadMessages);
        return messages.TryGetValue(key, out var message) && !string.IsNullOrWhiteSpace(message)
            ? message
            : null;
    }

    private IReadOnlyDictionary<string, string> LoadMessages(string lang)
    {
        var path = Path.Combine(_env.ContentRootPath, "Resources", $"Messages.{lang}.json");
        if (!File.Exists(path))
            return EmptyMessages;

        try
        {
            var json = File.ReadAllText(path);
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
            if (data == null)
                return EmptyMessages;

            return new Dictionary<string, string>(data, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return EmptyMessages;
        }
    }

    private static string Format(string template, object?[] args)
    {
        if (args.Length == 0)
            return template;

        try
        {
            return string.Format(template, args);
        }
        catch
        {
            return template;
        }
    }
}
