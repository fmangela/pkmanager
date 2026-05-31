using System.ComponentModel.DataAnnotations;

namespace PkManager.Server.Models.Request;

public class LoginRequest
{
    [Required(ErrorMessage = "用户名不能为空")]
    [MinLength(3, ErrorMessage = "用户名至少3个字符")]
    [MaxLength(50, ErrorMessage = "用户名最多50个字符")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "密码不能为空")]
    [MinLength(8, ErrorMessage = "密码至少8个字符")]
    public string Password { get; set; } = string.Empty;
}
