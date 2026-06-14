import React, { useEffect, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import type { MGBAEmulator } from '../lib/mgba';

export interface CheatsModalProps {
  open: boolean;
  onClose: () => void;
  emu: MGBAEmulator | null;
  romName: string;
  romFileName?: string;
}

interface CheatEntry {
  id: string;
  desc: string;
  code: string;
  enable: boolean;
  type: number;
}

interface CheatFormValues {
  desc: string;
  code: string;
  enable: boolean;
  type: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_CHEAT_TYPE = 1;
const DEFAULT_ROM_FILE_NAME = 'game.gba';
const CHEAT_TYPE_OPTIONS = [
  { label: 'GameShark', value: 1, color: 'blue' },
  { label: 'CodeBreaker', value: 2, color: 'gold' },
  { label: 'Action Replay', value: 3, color: 'purple' },
] as const;

function getCheatTypeLabel(type: number): string {
  return CHEAT_TYPE_OPTIONS.find((option) => option.value === type)?.label || `Type ${type}`;
}

function getCheatTypeColor(type: number): string {
  return CHEAT_TYPE_OPTIONS.find((option) => option.value === type)?.color || 'default';
}

function parseQuotedValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function normalizeCode(code: string): string {
  return code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function parseCheatsText(content: string): CheatEntry[] {
  const entries = new Map<number, CheatEntry>();
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const match = /^cheat(\d+)_(desc|code|enable|type)$/i.exec(key);
    if (!match) continue;

    const index = Number(match[1]);
    const field = match[2].toLowerCase();
    const current = entries.get(index) || {
      id: crypto.randomUUID(),
      desc: '',
      code: '',
      enable: false,
      type: DEFAULT_CHEAT_TYPE,
    };

    if (field === 'desc') current.desc = parseQuotedValue(value);
    if (field === 'code') current.code = normalizeCode(parseQuotedValue(value));
    if (field === 'enable') current.enable = value.toLowerCase() === 'true';
    if (field === 'type') current.type = Number(value) || DEFAULT_CHEAT_TYPE;

    entries.set(index, current);
  }

  return [...entries.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, entry], idx) => ({
      ...entry,
      desc: entry.desc.trim() || `Cheat ${idx + 1}`,
      code: normalizeCode(entry.code),
      type: entry.type || DEFAULT_CHEAT_TYPE,
    }));
}

function serializeCheats(entries: CheatEntry[]): string {
  const lines = [`cheats = ${entries.length}`];

  entries.forEach((entry, index) => {
    lines.push(`cheat${index}_desc = ${JSON.stringify(entry.desc.trim() || `Cheat ${index + 1}`)}`);
    lines.push(`cheat${index}_code = ${JSON.stringify(normalizeCode(entry.code))}`);
    lines.push(`cheat${index}_enable = ${entry.enable ? 'true' : 'false'}`);
    lines.push(`cheat${index}_type = ${entry.type || DEFAULT_CHEAT_TYPE}`);
  });

  return `${lines.join('\n')}\n`;
}

function getBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  const lastSegment = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dotIndex = lastSegment.lastIndexOf('.');
  return dotIndex > 0 ? lastSegment.slice(0, dotIndex) : lastSegment;
}

function joinPath(dir: string, fileName: string): string {
  return dir.endsWith('/') ? `${dir}${fileName}` : `${dir}/${fileName}`;
}

function buildCheatsFilePath(cheatsDir: string, romFileName: string): string {
  return joinPath(cheatsDir, `${getBaseName(romFileName)}.cheats`);
}

function sanitizeDownloadName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'game';
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : '未知错误';
}

function readCheatsFile(emu: MGBAEmulator, filePath: string): string | null {
  const analysis = emu.FS.analyzePath?.(filePath);
  if (!analysis?.exists) return null;

  const raw = emu.FS.readFile(filePath);
  if (typeof raw === 'string') return raw;
  if (raw instanceof Uint8Array) return decoder.decode(raw);
  return decoder.decode(new Uint8Array(raw));
}

const codeStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const CheatsModal: React.FC<CheatsModalProps> = ({
  open,
  onClose,
  emu,
  romName,
  romFileName = DEFAULT_ROM_FILE_NAME,
}) => {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<CheatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CheatEntry | null>(null);
  const [form] = Form.useForm<CheatFormValues>();

  const loadEntries = async () => {
    if (!emu) {
      setEntries([]);
      return;
    }

    setLoading(true);
    try {
      const filePath = buildCheatsFilePath(emu.getCheatsPath(), romFileName);
      const content = readCheatsFile(emu, filePath);
      setEntries(content ? parseCheatsText(content) : []);
    } catch (err) {
      message.error(`读取金手指失败: ${formatError(err)}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadEntries();
  }, [open, emu, romFileName]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingEntry(null);
    form.resetFields();
  };

  const openCreateEditor = () => {
    setEditingEntry(null);
    form.setFieldsValue({
      desc: '',
      code: '',
      enable: true,
      type: DEFAULT_CHEAT_TYPE,
    });
    setEditorOpen(true);
  };

  const openEditEditor = (entry: CheatEntry) => {
    setEditingEntry(entry);
    form.setFieldsValue({
      desc: entry.desc,
      code: entry.code,
      enable: entry.enable,
      type: entry.type,
    });
    setEditorOpen(true);
  };

  const handleSaveEntry = async () => {
    const values = await form.validateFields();
    const nextEntry: CheatEntry = {
      id: editingEntry?.id || crypto.randomUUID(),
      desc: values.desc.trim(),
      code: normalizeCode(values.code),
      enable: values.enable,
      type: values.type,
    };

    setEntries((current) => {
      if (!editingEntry) return [...current, nextEntry];
      return current.map((entry) => (entry.id === editingEntry.id ? nextEntry : entry));
    });

    closeEditor();
  };

  const handleToggleAll = (enabled: boolean) => {
    setEntries((current) => current.map((entry) => ({ ...entry, enable: enabled })));
  };

  const handleExport = () => {
    const content = serializeCheats(entries);
    const fileName = `${sanitizeDownloadName(romName || getBaseName(romFileName))}.cheats`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(`已导出 ${fileName}`);
  };

  const handleApply = async () => {
    if (!emu) {
      message.warning('模拟器尚未就绪');
      return;
    }

    setApplying(true);
    try {
      const filePath = buildCheatsFilePath(emu.getCheatsPath(), romFileName);
      const serialized = serializeCheats(entries);
      emu.FS.writeFile(filePath, encoder.encode(serialized));
      const loaded = emu.autoLoadCheats();
      if (loaded) {
        message.success(entries.length > 0 ? '金手指已应用' : '已清空金手指');
      } else {
        message.warning('金手指文件已写入，但模拟器未成功加载');
      }
      await loadEntries();
    } catch (err) {
      message.error(`应用金手指失败: ${formatError(err)}`);
    } finally {
      setApplying(false);
    }
  };

  const handleImport: UploadProps['beforeUpload'] = async (file) => {
    if (!emu) {
      message.warning('模拟器尚未就绪');
      return Upload.LIST_IGNORE;
    }
    if (!file.name.toLowerCase().endsWith('.cheats')) {
      message.error('仅支持导入 .cheats 文件');
      return Upload.LIST_IGNORE;
    }

    setImporting(true);
    try {
      await emu.uploadCheats(file as File);
      const text = await file.text();
      setEntries(parseCheatsText(text));
      message.success(`已导入 ${file.name}`);
    } catch (err) {
      message.error(`导入失败: ${formatError(err)}`);
    } finally {
      setImporting(false);
    }

    return Upload.LIST_IGNORE;
  };

  const columns: ColumnsType<CheatEntry> = [
    {
      title: '启用',
      dataIndex: 'enable',
      width: 72,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.enable}
          onChange={(checked) => {
            setEntries((current) => current.map((entry) => (
              entry.id === record.id ? { ...entry, enable: checked } : entry
            )));
          }}
        />
      ),
    },
    {
      title: '名称',
      dataIndex: 'desc',
      width: 180,
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: '代码',
      dataIndex: 'code',
      render: (value: string) => <span style={codeStyle}>{value}</span>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 128,
      render: (value: number) => <Tag color={getCheatTypeColor(value)}>{getCheatTypeLabel(value)}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditEditor(record)}>
            编辑
          </Button>
          <Popconfirm
            title="删除这条金手指？"
            description={record.desc}
            okText="删除"
            cancelText="取消"
            onConfirm={() => setEntries((current) => current.filter((entry) => entry.id !== record.id))}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="金手指 (CodeBreaker / GameShark / Action Replay)"
        open={open}
        onCancel={() => {
          closeEditor();
          onClose();
        }}
        footer={null}
        width={920}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateEditor}>
            添加
          </Button>
          <Upload accept=".cheats" showUploadList={false} beforeUpload={handleImport}>
            <Button icon={<UploadOutlined />} loading={importing} disabled={!emu}>
              导入文件
            </Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={entries.length === 0}>
            导出
          </Button>
          <Button onClick={() => handleToggleAll(true)} disabled={entries.length === 0}>
            全部启用
          </Button>
          <Button onClick={() => handleToggleAll(false)} disabled={entries.length === 0}>
            全部禁用
          </Button>
        </Space>

        <Table<CheatEntry>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={entries}
          columns={columns}
          pagination={false}
          scroll={{ y: 360 }}
          locale={{
            emptyText: (
              <Empty
                description="暂无金手指，点击「添加」或「导入」"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Typography.Text type="secondary">
            当前会写入 {buildCheatsFilePath(emu?.getCheatsPath?.() || '/data/cheats', romFileName)}，应用后立即生效。
          </Typography.Text>
          <Space>
            <Button onClick={() => {
              closeEditor();
              onClose();
            }}>关闭</Button>
            <Button type="primary" onClick={handleApply} loading={applying} disabled={!emu}>
              应用金手指
            </Button>
          </Space>
        </div>
      </Modal>

      <Modal
        title={editingEntry ? '编辑金手指' : '添加金手指'}
        open={editorOpen}
        onCancel={closeEditor}
        onOk={() => { void handleSaveEntry(); }}
        okText={editingEntry ? '保存' : '添加'}
        destroyOnHidden
      >
        <Form<CheatFormValues> form={form} layout="vertical" initialValues={{ enable: true, type: DEFAULT_CHEAT_TYPE }}>
          <Form.Item
            label="名称"
            name="desc"
            rules={[
              { required: true, message: '请输入名称' },
              { validator: async (_, value) => {
                if (typeof value === 'string' && value.trim()) return;
                throw new Error('请输入名称');
              } },
            ]}
          >
            <Input maxLength={80} placeholder="例如：大师球 / 无限金钱" />
          </Form.Item>

          <Form.Item label="类型" name="type" rules={[{ required: true, message: '请选择类型' }]}>
            <Select options={CHEAT_TYPE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))} />
          </Form.Item>

          <Form.Item
            label="代码"
            name="code"
            extra="一行一条代码，支持粘贴多行。"
            rules={[
              { required: true, message: '请输入代码' },
              { validator: async (_, value) => {
                if (typeof value === 'string' && normalizeCode(value)) return;
                throw new Error('请输入至少一条有效代码');
              } },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder={'82003884 0001\n82003886 0001'}
              style={{ fontFamily: codeStyle.fontFamily }}
            />
          </Form.Item>

          <Form.Item label="默认启用" name="enable" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CheatsModal;
