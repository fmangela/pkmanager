using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using PkManager.Server.Helpers;
using PkManager.Server.Localization;
using PkManager.Server.Models.Response;
using PkManager.Server.Services;

namespace PkManager.Server.Middleware;

public class BusinessExceptionFilter : IExceptionFilter
{
    private readonly IBackendMessageLocalizer _messages;
    private readonly ILanguageResolver _languageResolver;

    public BusinessExceptionFilter(
        IBackendMessageLocalizer messages,
        ILanguageResolver languageResolver)
    {
        _messages = messages;
        _languageResolver = languageResolver;
    }

    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not BusinessException ex)
            return;

        var message = !string.IsNullOrWhiteSpace(ex.MessageKey)
            ? _messages.GetOrFallback(_languageResolver.CurrentLang, ex.MessageKey!, ex.FallbackMessage, ex.MessageArgs ?? [])
            : ex.Message;

        context.Result = new ObjectResult(ApiResponse<object>.Error(ex.ErrorCode, message, ex.MessageKey))
        {
            StatusCode = MapStatusCode(ex.ErrorCode)
        };
        context.ExceptionHandled = true;
    }

    private static int MapStatusCode(int errorCode) =>
        errorCode is >= 100 and < 600 ? errorCode : 400;
}
