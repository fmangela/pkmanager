using System.ComponentModel.DataAnnotations;

namespace PkManager.Server.Models.Request;

public class LoginRequest
{
    [Required]
    [MinLength(3)]
    [MaxLength(50)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [MinLength(8)]
    public string Password { get; set; } = string.Empty;
}
