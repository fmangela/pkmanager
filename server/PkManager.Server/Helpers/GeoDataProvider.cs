using PKHeX.Core;
using PkManager.Server.Controllers;
using PkManager.Server.Localization;

namespace PkManager.Server.Helpers;

public class GeoDataProvider : IGeoDataProvider
{
    private const string InvalidMarker = "INVALID";
    private readonly ILanguageResolver _languageResolver;
    private readonly IBackendMessageLocalizer _messages;

    public GeoDataProvider(
        ILanguageResolver languageResolver,
        IBackendMessageLocalizer messages)
    {
        _languageResolver = languageResolver;
        _messages = messages;
    }

    public List<ResourceItem> GetCountries(string? lang = null)
    {
        var langCode = ResolveLang(lang);
        var items = new List<ResourceItem>();

        for (int countryId = 1; countryId <= byte.MaxValue; countryId++)
        {
            var name = GeoLocation.GetCountryName(langCode, (byte)countryId);
            if (IsInvalid(name))
                continue;

            items.Add(new ResourceItem { Id = countryId, Name = name });
        }

        return items;
    }

    public List<ResourceItem> GetRegions(int countryId, string? lang = null)
    {
        if (countryId is < 0 or > byte.MaxValue)
            return new List<ResourceItem>();

        var langCode = ResolveLang(lang);
        var regions = new List<ResourceItem>();

        for (int regionId = 1; regionId <= byte.MaxValue; regionId++)
        {
            if (!GeoLocation.GetIsCountryRegionExist((byte)countryId, (byte)regionId))
                continue;

            var name = GeoLocation.GetRegionName(langCode, (byte)countryId, (byte)regionId);
            if (IsInvalid(name))
                continue;

            regions.Add(new ResourceItem { Id = regionId, Name = name });
        }

        if (regions.Count == 0)
            return regions;

        regions.Insert(0, new ResourceItem { Id = 0, Name = "—" });
        return regions;
    }

    public string? GetCountryName(byte? countryCode, string? lang = null)
    {
        if (countryCode == null)
            return null;

        var langCode = ResolveLang(lang);
        var name = GeoLocation.GetCountryName(langCode, countryCode.Value);
        return IsInvalid(name) ? $"[{countryCode}]" : name;
    }

    public string? GetRegionName(byte? countryCode, byte? regionCode, string? lang = null)
    {
        if (regionCode == null)
            return null;
        if (regionCode == 0)
            return "—";
        if (countryCode == null)
            return $"[{regionCode}]";

        var langCode = ResolveLang(lang);
        var name = GeoLocation.GetRegionName(langCode, countryCode.Value, regionCode.Value);
        return IsInvalid(name) ? $"[{regionCode}]" : name;
    }

    public string? GetConsoleRegionName(byte? consoleRegion, string? lang = null)
    {
        if (consoleRegion == null)
            return null;

        var key = $"geo.consoleRegion.{consoleRegion.Value}";
        return consoleRegion.Value switch
        {
            <= 6 => _messages.GetOrFallback(ResolveLang(lang), key, $"[{consoleRegion.Value}]"),
            _ => $"[{consoleRegion.Value}]"
        };
    }

    private string ResolveLang(string? lang) => _languageResolver.ResolveOrDefault(lang);

    private static bool IsInvalid(string value) =>
        string.IsNullOrWhiteSpace(value) || value.Equals(InvalidMarker, StringComparison.OrdinalIgnoreCase);
}
