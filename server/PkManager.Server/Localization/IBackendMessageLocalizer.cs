namespace PkManager.Server.Localization;

public interface IBackendMessageLocalizer
{
    string Get(string key, params object?[] args);
    string GetForLanguage(string? lang, string key, params object?[] args);
    string GetOrFallback(string? lang, string key, string? fallbackMessage, params object?[] args);
}
