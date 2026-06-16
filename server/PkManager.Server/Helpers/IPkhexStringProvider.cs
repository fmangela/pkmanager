using PKHeX.Core;

namespace PkManager.Server.Helpers;

public interface IPkhexStringProvider
{
    GameStrings GetStrings();
    GameStrings GetStrings(string? lang);
}
