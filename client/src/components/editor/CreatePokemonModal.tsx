import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Select, InputNumber, Space, Typography, App, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { PlusOutlined } from '@ant-design/icons';
import type { ApiError } from '../../api/axios';
import { saveFileApi } from '../../api/saveFile';
import { useResourceStore } from '../../stores/resourceStore';
import PokemonSprite from '../PokemonSprite';

const { Text } = Typography;

interface Props {
  open: boolean;
  saveFileId: string;
  targetGameVersion: number;
  boxIndex: number;
  slotIndex: number;
  isParty: boolean;
  onCancel: () => void;
  onCreated: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8c8c8c', marginBottom: 2 };

const CreatePokemonModal: React.FC<Props> = ({
  open, saveFileId, targetGameVersion, boxIndex, slotIndex, isParty, onCancel, onCreated,
}) => {
  const { t } = useTranslation(['pages', 'messages', 'common']);
  const { species, loadAll } = useResourceStore();
  const { message } = App.useApp();
  const [selectedSpecies, setSelectedSpecies] = useState<number | undefined>();
  const [form, setForm] = useState(0);
  const [level, setLevel] = useState(50);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  const pt = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'pages', defaultValue, ...(options ?? {}) });

  const speciesOptions = useMemo(() =>
    species
      .filter(s => s.id >= 1 && s.id <= 1025)
      .map(s => ({ value: s.id, label: `${s.name} (#${s.id})` })),
    [species]);

  const locationLabel = isParty
    ? pt('saveEditor.createModal.locationParty', '随行位置 {{index}}', { index: slotIndex + 1 })
    : pt('saveEditor.createModal.locationBox', 'Box {{box}} · 槽位 {{slot}}', { box: boxIndex + 1, slot: slotIndex + 1 });

  const reset = () => {
    setSelectedSpecies(undefined);
    setForm(0);
    setLevel(50);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleCreate = async () => {
    if (!selectedSpecies) {
      message.warning(pt('saveEditor.createModal.speciesRequired', '请选择物种'));
      return;
    }
    setCreating(true);
    try {
      const legalRes = await saveFileApi.legalize({
        species: selectedSpecies,
        form,
        level,
        targetGameVersion,
        trainerSaveFileId: saveFileId,
      });
      const data = legalRes.data;
      if (!data.success || !data.pkmDataBase64) {
        message.error(data.error || pt('saveEditor.createModal.createFailed', '创建失败'));
        return;
      }
      await saveFileApi.updateSaveSlot(
        data.pkmDataBase64, saveFileId, boxIndex, slotIndex, isParty, {},
      );
      message.success(pt('saveEditor.createModal.createSuccess', '创建成功'));
      reset();
      onCreated();
    } catch (err: unknown) {
      const apiErr = err as ApiError | undefined;
      message.error(apiErr?.response?.data?.message || pt('saveEditor.createModal.createFailed', '创建失败'));
    } finally {
      setCreating(false);
    }
  };

  const speciesName = selectedSpecies
    ? species.find(s => s.id === selectedSpecies)?.name ?? `#${selectedSpecies}`
    : '';

  return (
    <Modal
      title={
        <Space size={8} align="center">
          <PlusOutlined />
          <span>{pt('saveEditor.createModal.title', '新建宝可梦')}</span>
          <Tag color="blue" style={{ marginLeft: 8 }}>{locationLabel}</Tag>
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      width={480}
      okText={pt('saveEditor.createModal.createBtn', '创建')}
      cancelText={t('cancel', { ns: 'common', defaultValue: '取消' })}
      okButtonProps={{ loading: creating, icon: <PlusOutlined /> }}
      onOk={handleCreate}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 12, background: '#f5f5f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #e8e8e8', flexShrink: 0,
          }}>
            {selectedSpecies
              ? <PokemonSprite speciesId={selectedSpecies} width={56} height={56} />
              : <Text type="secondary" style={{ fontSize: 11 }}>?</Text>}
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 16 }}>
              {speciesName || pt('saveEditor.createModal.emptyHint', '请选择物种')}
            </Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {pt('saveEditor.createModal.legalizeNote', '将生成合法 PKM 并写入槽位')}
              </Text>
            </div>
          </div>
        </div>

        <div>
          <div style={labelStyle}>{pt('saveEditor.createModal.speciesLabel', '物种')}</div>
          <Select
            showSearch
            size="middle"
            value={selectedSpecies}
            onChange={(v) => { setSelectedSpecies(v); setForm(0); }}
            options={speciesOptions}
            style={{ width: '100%' }}
            placeholder={pt('saveEditor.createModal.speciesPlaceholder', '选择物种 (1-1025)')}
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent={species.length === 0 ? pt('saveEditor.createModal.loading', '加载中...') : undefined}
          />
        </div>

        <Space size="large" style={{ width: '100%' }}>
          <div>
            <div style={labelStyle}>{pt('saveEditor.createModal.formLabel', '形态')}</div>
            <Space.Compact>
              <InputNumber
                size="middle"
                min={0}
                max={63}
                value={form}
                onChange={(v) => setForm(v ?? 0)}
                style={{ width: 90 }}
                disabled={!selectedSpecies}
              />
              <Tag>
                {form > 0 ? `F${form}` : t('current', { ns: 'common', defaultValue: '默认' })}
              </Tag>
            </Space.Compact>
          </div>
          <div>
            <div style={labelStyle}>{pt('saveEditor.createModal.levelLabel', '等级')}</div>
            <InputNumber
              size="middle"
              min={1}
              max={100}
              value={level}
              onChange={(v) => setLevel(v ?? 1)}
              style={{ width: 100 }}
            />
          </div>
        </Space>
      </Space>
    </Modal>
  );
};

export default CreatePokemonModal;
