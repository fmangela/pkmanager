import React, { useState } from 'react';
import { Modal, Input, Select, Button, App, Descriptions, Tag, Space } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import { saveFileApi } from '../../api/saveFile';
import type { ShowdownSetPreviewDto } from '../../api/saveFile';
import { VERSION_TO_GAME_ID, GAME_VERSION_DISPLAY } from '../../constants/games';

const { TextArea } = Input;

// Gen3-7 非复合版本列表（PKHeX GameVersion → 显示名称）
const GEN3_7_VERSIONS: { value: number; label: string }[] = (() => {
  const seen = new Set<string>();
  const result: { value: number; label: string }[] = [];
  // 按 gameVersion 数字顺序排列，排除复合版本(>=56)和 Switch 版本(>=44)
  const sorted = Object.keys(VERSION_TO_GAME_ID).map(Number).sort((a, b) => a - b);
  for (const v of sorted) {
    if (v >= 34) continue; // Skip GO/LGPE/Let's Go/Switch (Gen7b+)
    const gameId = VERSION_TO_GAME_ID[v];
    if (!gameId || seen.has(gameId)) continue;
    seen.add(gameId);
    const display = GAME_VERSION_DISPLAY[v];
    result.push({
      value: v,
      label: display ? `${display.name} (v${v})` : `${gameId} (v${v})`,
    });
  }
  return result;
})();

interface Props {
  open: boolean;
  saveFileId?: string;
  onClose: () => void;
  onImported: (pokemon: any) => void;
}

const ShowdownImportModal: React.FC<Props> = ({ open, saveFileId, onClose, onImported }) => {
  const [text, setText] = useState('');
  const [targetVersion, setTargetVersion] = useState<number>(24); // default: X (PKHeX version 24)
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<ShowdownSetPreviewDto | null>(null);
  const { message } = App.useApp();

  const handleParse = async () => {
    if (!text.trim()) { message.warning('请输入Showdown文本'); return; }
    setParsing(true);
    try {
      const res = await saveFileApi.parseShowdown({ showdownText: text });
      const data = res.data;
      if (data.success && data.sets.length > 0) {
        setPreview(data.sets[0]);
        message.success(`解析成功: ${data.sets[0].species}`);
      } else {
        message.error(data.error || '解析失败');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '解析失败');
    } finally {
      setParsing(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) { message.warning('请输入Showdown文本'); return; }
    setGenerating(true);
    try {
      const res = await saveFileApi.legalizeShowdown({
        showdownText: text,
        targetGameVersion: targetVersion,
        trainerSaveFileId: saveFileId ?? undefined,
      });
      const data = res.data;
      if (data.success && data.pokemon) {
        onImported(data.pokemon);
        message.success('Showdown导入成功！');
        resetAndClose();
      } else {
        message.error(data.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const resetAndClose = () => {
    setText('');
    setPreview(null);
    onClose();
  };

  return (
    <Modal
      title="Showdown 导入"
      open={open}
      onCancel={resetAndClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>取消</Button>,
        <Button key="parse" onClick={handleParse} loading={parsing}>解析预览</Button>,
        <Button key="generate" type="primary" icon={<ImportOutlined />}
          onClick={handleGenerate} loading={generating}>
          生成并导入
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <TextArea
          placeholder={`粘贴 Showdown 格式配置或 PokePaste 链接（如 https://pokepast.es/...），例如：\nGarchomp @ Life Orb\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Stone Edge`}
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null); }}
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />

        <div>
          <span style={{ marginRight: 8 }}>目标版本:</span>
          <Select
            value={targetVersion}
            onChange={setTargetVersion}
            options={GEN3_7_VERSIONS}
            style={{ width: 280 }}
            showSearch
            optionFilterProp="label"
          />
        </div>

        {preview && (
          <Descriptions size="small" bordered column={2} title="解析预览">
            <Descriptions.Item label="物种">{preview.species}</Descriptions.Item>
            <Descriptions.Item label="等级">{preview.level}</Descriptions.Item>
            {preview.nickname && <Descriptions.Item label="昵称">{preview.nickname}</Descriptions.Item>}
            {preview.ability && <Descriptions.Item label="特性">{preview.ability}</Descriptions.Item>}
            {preview.nature && <Descriptions.Item label="性格">{preview.nature}</Descriptions.Item>}
            {preview.gender && <Descriptions.Item label="性别">{preview.gender}</Descriptions.Item>}
            {preview.item && <Descriptions.Item label="携带道具">{preview.item}</Descriptions.Item>}
            <Descriptions.Item label="闪光">{preview.shiny ? '✨ 是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="招式" span={2}>
              {preview.moves.map((m, i) => <Tag key={i}>{m}</Tag>)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Space>
    </Modal>
  );
};

export default ShowdownImportModal;
