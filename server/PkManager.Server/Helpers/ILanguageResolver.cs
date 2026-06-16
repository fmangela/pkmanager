namespace PkManager.Server.Helpers;

public interface ILanguageResolver
{
    string CurrentLang { get; }
    string ResolveOrDefault(string? lang);
}
