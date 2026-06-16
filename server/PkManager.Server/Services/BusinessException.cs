namespace PkManager.Server.Services;

/// <summary>
/// 业务异常，用于返回可展示给用户的错误信息。
/// 迁移期同时兼容旧的直接 message 形式与新的 messageKey 形式。
/// </summary>
public class BusinessException : Exception
{
    public string? MessageKey { get; }
    public object?[]? MessageArgs { get; }
    public int ErrorCode { get; }
    public string? FallbackMessage { get; }

    public BusinessException(string message, int errorCode = 400) : base(message)
    {
        ErrorCode = errorCode;
        FallbackMessage = message;
    }

    private BusinessException(string messageKey, int errorCode, string? fallbackMessage, object?[]? args)
        : base(fallbackMessage ?? messageKey)
    {
        MessageKey = messageKey;
        MessageArgs = args;
        ErrorCode = errorCode;
        FallbackMessage = fallbackMessage;
    }

    public static BusinessException FromKey(string key, int errorCode = 400, params object?[] args) =>
        new(key, errorCode, null, args);

    public static BusinessException FromKeyWithFallback(
        string key,
        string fallbackMessage,
        int errorCode = 400,
        params object?[] args) =>
        new(key, errorCode, fallbackMessage, args);
}
