namespace PkManager.Server.Models.Response;

/// <summary>
/// 统一 API 响应格式
/// </summary>
public class ApiResponse<T>
{
    public int Code { get; set; }
    public string Message { get; set; } = "success";
    public string? MessageKey { get; set; }
    public T? Data { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public static ApiResponse<T> Ok(T data, string message = "success", string? messageKey = null)
    {
        return new ApiResponse<T> { Code = 0, Message = message, MessageKey = messageKey, Data = data };
    }

    public static ApiResponse<T> Error(int code, string message, string? messageKey = null)
    {
        return new ApiResponse<T> { Code = code, Message = message, MessageKey = messageKey, Data = default };
    }
}
