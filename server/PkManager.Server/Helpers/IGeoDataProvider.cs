using PkManager.Server.Controllers;

namespace PkManager.Server.Helpers;

public interface IGeoDataProvider
{
    List<ResourceItem> GetCountries(string? lang = null);
    List<ResourceItem> GetRegions(int countryId, string? lang = null);
    string? GetCountryName(byte? countryCode, string? lang = null);
    string? GetRegionName(byte? countryCode, byte? regionCode, string? lang = null);
    string? GetConsoleRegionName(byte? consoleRegion, string? lang = null);
}
