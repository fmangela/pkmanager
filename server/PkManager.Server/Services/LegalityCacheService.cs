using System.Collections.Concurrent;
using PkManager.Server.Models.Response;

namespace PkManager.Server.Services;

/// <summary>
/// 批量合法性扫描结果的内存缓存。
/// Singleton 作用域，使用 ConcurrentDictionary + TTL 过期 + SHA-256 内容 hash 校验。
/// </summary>
public class LegalityCacheService
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(5);

    // ── 存档批量扫描缓存 (key=saveFileId) ──
    private static readonly ConcurrentDictionary<Guid, SaveCacheEntry> _saveCache = new();

    // ── 银行批量扫描缓存 (key=userId) ──
    private static readonly ConcurrentDictionary<Guid, BankCacheEntry> _bankCache = new();

    // ── 存档缓存 ────────────────────────────────────────────

    /// <summary>
    /// 获取存档批量扫描的缓存结果。contentHash 不匹配 → 自动 miss。
    /// </summary>
    public BatchLegalityReportDto? GetSaveReport(Guid saveFileId, string contentHash)
    {
        if (_saveCache.TryGetValue(saveFileId, out var entry))
        {
            if (DateTime.UtcNow < entry.ExpiresAt && entry.ContentHash == contentHash)
                return entry.Report;
            _saveCache.TryRemove(saveFileId, out _);
        }
        return null;
    }

    public void SetSaveReport(Guid saveFileId, BatchLegalityReportDto report, string contentHash)
    {
        _saveCache[saveFileId] = new SaveCacheEntry
        {
            Report = report,
            ExpiresAt = DateTime.UtcNow.Add(DefaultTtl),
            ContentHash = contentHash
        };
    }

    /// <summary>
    /// 主动失效存档缓存（任何写路径调用）。
    /// </summary>
    public void InvalidateSave(Guid saveFileId)
    {
        _saveCache.TryRemove(saveFileId, out _);
    }

    // ── 银行缓存 ────────────────────────────────────────────

    /// <summary>
    /// 获取银行批量扫描的缓存结果（全量扫描，无内容 hash）。
    /// </summary>
    public BankBatchLegalityReportDto? GetBankReport(Guid userId)
    {
        if (_bankCache.TryGetValue(userId, out var entry))
        {
            if (DateTime.UtcNow < entry.ExpiresAt)
                return entry.Report;
            _bankCache.TryRemove(userId, out _);
        }
        return null;
    }

    public void SetBankReport(Guid userId, BankBatchLegalityReportDto report)
    {
        _bankCache[userId] = new BankCacheEntry
        {
            Report = report,
            ExpiresAt = DateTime.UtcNow.Add(DefaultTtl)
        };
    }

    /// <summary>
    /// 主动失效银行缓存（任何 bank 增删改路径调用）。
    /// </summary>
    public void InvalidateBank(Guid userId)
    {
        _bankCache.TryRemove(userId, out _);
    }

    // ── 内部缓存条目 ────────────────────────────────────────

    private class SaveCacheEntry
    {
        public BatchLegalityReportDto Report { get; set; } = null!;
        public DateTime ExpiresAt { get; set; }
        public string ContentHash { get; set; } = string.Empty;
    }

    private class BankCacheEntry
    {
        public BankBatchLegalityReportDto Report { get; set; } = null!;
        public DateTime ExpiresAt { get; set; }
    }
}
