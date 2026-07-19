using System.ComponentModel.DataAnnotations;

namespace PkManager.Server.Models.Request;

public class LogoutRequest
{
    public string? RefreshToken { get; set; }
}

public class RenameDeviceRequest
{
    [Required]
    [MaxLength(50)]
    public string Label { get; set; } = string.Empty;
}
