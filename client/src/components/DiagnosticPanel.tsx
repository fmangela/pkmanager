import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FloatButton,
  Drawer,
  Button,
  Space,
  Tag,
  Typography,
  Timeline,
  Badge,
  Tooltip,
  message,
  Segmented,
  Popconfirm,
} from 'antd';
import {
  BugOutlined,
  CopyOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useDiagnosticStore, type DiagCategory, type DiagLevel } from '../stores/diagnosticStore';

const { Text } = Typography;

// ── Category color/config ──────────────────────────────────────────

const CATEGORY_META: Record<DiagCategory, { color: string; label: string }> = {
  api: { color: 'red', label: 'API' },
  render: { color: 'purple', label: 'Render' },
  wasm: { color: 'green', label: 'WASM' },
  network: { color: 'orange', label: 'Network' },
  auth: { color: 'gold', label: 'Auth' },
  health: { color: 'blue', label: 'Health' },
  unknown: { color: 'default', label: 'Unknown' },
};

const LEVEL_ICON: Record<DiagLevel, React.ReactNode> = {
  error: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  warn: <WarningOutlined style={{ color: '#faad14' }} />,
  info: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
};

const HEALTH_STATUS: Record<
  string,
  { icon: React.ReactNode; label: string }
> = {
  idle: {
    icon: <Badge status="default" />,
    label: '检测中...',
  },
  ok: {
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    label: '全部正常',
  },
  degraded: {
    icon: <WarningOutlined style={{ color: '#faad14' }} />,
    label: '部分异常',
  },
  down: {
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    label: '服务不可用',
  },
};

// ── Filter state ────────────────────────────────────────────────────

type FilterLevel = DiagLevel | 'all';
type FilterCategory = DiagCategory | 'all';

// ── DiagnosticPanel Component ───────────────────────────────────────

const DiagnosticPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('all');
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all');

  const entries = useDiagnosticStore((s) => s.entries);
  const healthStatus = useDiagnosticStore((s) => s.healthStatus);
  const clear = useDiagnosticStore((s) => s.clear);
  const exportText = useDiagnosticStore((s) => s.exportText);

  // ── Keyboard shortcut: Ctrl+Shift+D ────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Custom event: pkmanager:open-diag (from ErrorBoundary) ──────

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('pkmanager:open-diag', handler);
    return () => window.removeEventListener('pkmanager:open-diag', handler);
  }, []);

  // ── Filters ─────────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let list = entries;
    if (levelFilter !== 'all') {
      list = list.filter((e) => e.level === levelFilter);
    }
    if (categoryFilter !== 'all') {
      list = list.filter((e) => e.category === categoryFilter);
    }
    // newest first
    return [...list].reverse();
  }, [entries, levelFilter, categoryFilter]);

  // ── Stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const e = entries.filter((x) => x.level === 'error').length;
    const w = entries.filter((x) => x.level === 'warn').length;
    const i = entries.filter((x) => x.level === 'info').length;
    return { error: e, warn: w, info: i };
  }, [entries]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      message.success('已复制到剪贴板');
    }
  }, [exportText]);

  const handleClear = useCallback(() => {
    clear();
    message.success('日志已清空');
  }, [clear]);

  // ── Health indicator ─────────────────────────────────────────────

  const h = HEALTH_STATUS[healthStatus] || HEALTH_STATUS.idle;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button — always visible in dev, hidden in prod (keyboard shortcut only) */}
      <FloatButton
        icon={<BugOutlined />}
        type="default"
        style={{
          right: 24,
          bottom: 72,
          display: import.meta.env.DEV ? undefined : 'none',
        }}
        badge={{ count: stats.error, color: '#ff4d4f' }}
        onClick={() => setOpen(true)}
        tooltip="诊断面板 (Ctrl+Shift+D)"
      />

      <Drawer
        title={
          <Space>
            <BugOutlined />
            <span>诊断面板</span>
            <Tag>{h.icon} {h.label}</Tag>
          </Space>
        }
        placement="right"
        size="large"
        open={open}
        onClose={() => setOpen(false)}
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => {
                  useDiagnosticStore.getState().setHealth('idle');
                  // Re-trigger health check via page reload
                  window.location.reload();
                }}
              />
            </Tooltip>
            <Popconfirm
              title="确定清空所有日志？"
              onConfirm={handleClear}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" icon={<DeleteOutlined />} danger>
                清空
              </Button>
            </Popconfirm>
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
              复制全部
            </Button>
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setOpen(false)}
            />
          </Space>
        }
        styles={{
          body: { padding: 0 },
        }}
      >
        {/* Stats bar */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            padding: '12px 24px',
            borderBottom: '1px solid #f0f0f0',
            background: '#fafafa',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Segmented
            size="small"
            value={levelFilter}
            onChange={(val) => setLevelFilter(val as FilterLevel)}
            options={[
              { label: `全部 (${entries.length})`, value: 'all' },
              { label: `🔴 错误 (${stats.error})`, value: 'error' },
              { label: `🟡 警告 (${stats.warn})`, value: 'warn' },
              { label: `🔵 信息 (${stats.info})`, value: 'info' },
            ]}
          />
          <Segmented
            size="small"
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val as FilterCategory)}
            options={[
              { label: '全部分类', value: 'all' },
              { label: 'API', value: 'api' },
              { label: 'Render', value: 'render' },
              { label: 'WASM', value: 'wasm' },
              { label: 'Network', value: 'network' },
              { label: 'Auth', value: 'auth' },
            ]}
          />
        </div>

        {/* Log timeline */}
        <div style={{ padding: 16, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
          {filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>
              <CheckCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <br />
              {entries.length === 0
                ? '暂无日志 — 一切正常'
                : '当前筛选条件下无匹配日志'}
            </div>
          ) : (
            <Timeline
              items={filteredEntries.map((entry) => ({
                dot: LEVEL_ICON[entry.level],
                children: (
                  <div key={entry.id} style={{ marginBottom: 4 }}>
                    <Space size={4} wrap>
                      <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
                          hour12: false,
                        })}
                      </Text>
                      <Tag
                        color={CATEGORY_META[entry.category]?.color}
                        style={{ fontSize: 10, lineHeight: '16px' }}
                      >
                        {CATEGORY_META[entry.category]?.label}
                      </Tag>
                      {entry.count && entry.count > 1 && (
                        <Tag style={{ fontSize: 10, lineHeight: '16px' }}>
                          ×{entry.count}
                        </Tag>
                      )}
                    </Space>
                    <div style={{ marginTop: 2 }}>
                      <Text
                        style={{
                          color:
                            entry.level === 'error'
                              ? '#ff4d4f'
                              : entry.level === 'warn'
                                ? '#faad14'
                                : undefined,
                        }}
                      >
                        {entry.message}
                      </Text>
                    </div>
                    {entry.stack && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 11, color: '#999' }}>
                          堆栈详情
                        </summary>
                        <pre
                          style={{
                            fontSize: 10,
                            color: '#999',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            margin: '4px 0 0 0',
                            padding: '4px 8px',
                            background: '#f9f9f9',
                            borderRadius: 4,
                            maxHeight: 200,
                            overflow: 'auto',
                          }}
                        >
                          {entry.stack}
                        </pre>
                      </details>
                    )}
                    {entry.context && (
                      <Text
                        type="secondary"
                        style={{ fontSize: 10, display: 'block', marginTop: 2 }}
                      >
                        {entry.context}
                      </Text>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '8px 24px',
            borderTop: '1px solid #f0f0f0',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            Ctrl+Shift+D 切换面板 · 错误自动上报服务端
          </Text>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {entries.length} 条记录
            </Text>
          </Space>
        </div>
      </Drawer>
    </>
  );
};

export default DiagnosticPanel;
