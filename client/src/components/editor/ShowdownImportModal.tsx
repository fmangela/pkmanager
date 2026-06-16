import React, { useState } from 'react';
import { Modal, Input, Select, Button, App, Descriptions, Tag, Space } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { saveFileApi } from '../../api/saveFile';
import type { ShowdownSetPreviewDto } from '../../api/saveFile';
import { VERSION_TO_GAME_ID, getVersionDisplayName } from '../../constants/games';

const { TextArea } = Input;

interface Props {
  open: boolean;
  saveFileId?: string;
  onClose: () => void;
  onImported: (pokemon: any) => void;
}

const ShowdownImportModal: React.FC<Props> = ({ open, saveFileId, onClose, onImported }) => {
  const { t } = useTranslation(['editor', 'messages', 'common']);
  const [text, setText] = useState('');
  const [targetVersion, setTargetVersion] = useState<number>(24); // default: X (PKHeX version 24)
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<ShowdownSetPreviewDto | null>(null);
  const { message } = App.useApp();
  const versions = (() => {
    const seen = new Set<string>();
    const result: { value: number; label: string }[] = [];
    const sorted = Object.keys(VERSION_TO_GAME_ID).map(Number).sort((a, b) => a - b);
    for (const v of sorted) {
      if (v >= 34) continue;
      const gameId = VERSION_TO_GAME_ID[v];
      if (!gameId || seen.has(gameId)) continue;
      seen.add(gameId);
      result.push({
        value: v,
        label: `${getVersionDisplayName(v)} (v${v})`,
      });
    }
    return result;
  })();

  const handleParse = async () => {
    if (!text.trim()) { message.warning(t('showdownInputRequired', { ns: 'messages', defaultValue: '请输入 Showdown 文本' })); return; }
    setParsing(true);
    try {
      const res = await saveFileApi.parseShowdown({ showdownText: text });
      const data = res.data;
      if (data.success && data.sets.length > 0) {
        setPreview(data.sets[0]);
        message.success(t('showdownParseSuccess', {
          ns: 'messages',
          defaultValue: '解析成功: {{species}}',
          species: data.sets[0].species,
        }));
      } else {
        message.error(data.error || t('showdownParseFailed', { ns: 'messages', defaultValue: '解析失败' }));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('showdownParseFailed', { ns: 'messages', defaultValue: '解析失败' }));
    } finally {
      setParsing(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) { message.warning(t('showdownInputRequired', { ns: 'messages', defaultValue: '请输入 Showdown 文本' })); return; }
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
        message.success(t('showdownImportSuccess', { ns: 'messages', defaultValue: 'Showdown 导入成功！' }));
        resetAndClose();
      } else {
        message.error(data.error || t('showdownGenerateFailed', { ns: 'messages', defaultValue: '生成失败' }));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('showdownGenerateFailed', { ns: 'messages', defaultValue: '生成失败' }));
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
      title={t('showdown.title', { ns: 'editor', defaultValue: 'Showdown 导入' })}
      open={open}
      onCancel={resetAndClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>{t('cancel', { ns: 'common', defaultValue: '取消' })}</Button>,
        <Button key="parse" onClick={handleParse} loading={parsing}>{t('showdown.previewButton', { ns: 'editor', defaultValue: '解析预览' })}</Button>,
        <Button key="generate" type="primary" icon={<ImportOutlined />}
          onClick={handleGenerate} loading={generating}>
          {t('showdown.generateButton', { ns: 'editor', defaultValue: '生成并导入' })}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <TextArea
          placeholder={t('showdown.placeholder', {
            ns: 'editor',
            defaultValue: '粘贴 Showdown 格式配置或 PokePaste 链接（如 https://pokepast.es/...），例如：\nGarchomp @ Life Orb\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Stone Edge',
          })}
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null); }}
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />

        <div>
          <span style={{ marginRight: 8 }}>{t('showdown.targetVersion', { ns: 'editor', defaultValue: '目标版本:' })}</span>
          <Select
            value={targetVersion}
            onChange={setTargetVersion}
            options={versions}
            style={{ width: 280 }}
            showSearch
            optionFilterProp="label"
          />
        </div>

        {preview && (
          <Descriptions size="small" bordered column={2} title={t('showdown.previewTitle', { ns: 'editor', defaultValue: '解析预览' })}>
            <Descriptions.Item label={t('showdown.field.species', { ns: 'editor', defaultValue: '物种' })}>{preview.species}</Descriptions.Item>
            <Descriptions.Item label={t('showdown.field.level', { ns: 'editor', defaultValue: '等级' })}>{preview.level}</Descriptions.Item>
            {preview.nickname && <Descriptions.Item label={t('showdown.field.nickname', { ns: 'editor', defaultValue: '昵称' })}>{preview.nickname}</Descriptions.Item>}
            {preview.ability && <Descriptions.Item label={t('showdown.field.ability', { ns: 'editor', defaultValue: '特性' })}>{preview.ability}</Descriptions.Item>}
            {preview.nature && <Descriptions.Item label={t('showdown.field.nature', { ns: 'editor', defaultValue: '性格' })}>{preview.nature}</Descriptions.Item>}
            {preview.gender && <Descriptions.Item label={t('showdown.field.gender', { ns: 'editor', defaultValue: '性别' })}>{preview.gender}</Descriptions.Item>}
            {preview.item && <Descriptions.Item label={t('showdown.field.item', { ns: 'editor', defaultValue: '携带道具' })}>{preview.item}</Descriptions.Item>}
            <Descriptions.Item label={t('showdown.field.shiny', { ns: 'editor', defaultValue: '闪光' })}>{preview.shiny ? t('showdown.shinyYes', { ns: 'editor', defaultValue: '✨ 是' }) : t('showdown.shinyNo', { ns: 'editor', defaultValue: '否' })}</Descriptions.Item>
            <Descriptions.Item label={t('showdown.field.moves', { ns: 'editor', defaultValue: '招式' })} span={2}>
              {preview.moves.map((m, i) => <Tag key={i}>{m}</Tag>)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Space>
    </Modal>
  );
};

export default ShowdownImportModal;
