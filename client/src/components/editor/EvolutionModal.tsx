import React, { useEffect, useState } from 'react';
import {
  Modal, Button, Space, Tag, Checkbox, Alert, Spin, App, Tooltip,
} from 'antd';
import {
  RocketOutlined, ArrowRightOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../api/axios';
import type { PokemonDto } from '../../api/saveFile';
import { evolutionApi, type EvolutionPathDto, type EvolveResultDto } from '../../api/evolution';
import PokemonSprite from '../PokemonSprite';

interface Props {
  open: boolean;
  pokemon: PokemonDto;
  saveFileId?: string;
  boxIndex?: number;
  slotIndex?: number;
  isParty?: boolean;
  editSnapshot: Record<string, unknown>;
  onClose: () => void;
  onEvolved: (result: EvolveResultDto) => void;
}

const EvolutionModal: React.FC<Props> = ({
  open, pokemon, saveFileId, boxIndex, slotIndex, isParty,
  editSnapshot, onClose, onEvolved,
}) => {
  const { t } = useTranslation(['editor', 'common']);
  const et = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) });
  const ct = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'common', defaultValue, ...(options ?? {}) });
  const [loading, setLoading] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [pathData, setPathData] = useState<EvolutionPathDto | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [createShedinja, setCreateShedinja] = useState(false);
  const { message } = App.useApp();

  // Fetch evolution paths when modal opens
  useEffect(() => {
    if (!open || !pokemon.pkmDataBase64 || !saveFileId) return;
    setLoading(true);
    setPathData(null);
    setSelectedIdx(0);
    setCreateShedinja(false);

    evolutionApi.getEvolutions({
      pkmDataBase64: pokemon.pkmDataBase64,
      saveFileId: saveFileId,
      editSnapshot,
    }).then(res => {
      setPathData(res.data);
      // Select the first available option by default
      const firstAvailable = res.data.options.findIndex(o => o.isAvailable);
      if (firstAvailable >= 0) setSelectedIdx(firstAvailable);
    }).catch((err: unknown) => {
      message.error((err as ApiError).response?.data?.message || et('evolution.loadPathsFailed', '获取进化路径失败'));
      onClose();
    }).finally(() => setLoading(false));
  }, [editSnapshot, et, message, onClose, open, pokemon.pkmDataBase64, saveFileId]);

  const handleEvolve = async () => {
    const option = pathData?.options[selectedIdx];
    if (!option || !saveFileId || !pokemon.pkmDataBase64) return;
    const fromSpeciesName = pokemon.speciesName;

    setEvolving(true);
    try {
      const res = await evolutionApi.evolve({
        pkmDataBase64: pokemon.pkmDataBase64,
        saveFileId,
        boxIndex: boxIndex ?? 0,
        slotIndex: slotIndex ?? 0,
        isParty: isParty ?? false,
        editSnapshot,
        targetSpecies: option.species,
        targetForm: option.form,
        alsoCreateShedinja: createShedinja,
      });
      const result: EvolveResultDto = res.data;
      if (result.success) {
        onEvolved(result);
        message.success(et('evolution.success', '{{from}} 已进化为 {{to}}！', {
          from: fromSpeciesName,
          to: option.speciesName,
        }));
      } else {
        message.error(result.error || et('evolution.failed', '进化失败'));
      }
    } catch (err: unknown) {
      message.error((err as ApiError).response?.data?.message || et('evolution.failed', '进化失败'));
    } finally {
      setEvolving(false);
    }
  };

  const selectedOption = pathData?.options[selectedIdx];
  const isNincadaToNinjask = pathData?.isNincada && selectedOption?.species === 291;

  // ── Content ──────────────────────────────────────────

  if (loading) {
    return (
      <Modal title={et('evolution.title', '一键进化')} open={open} onCancel={onClose} footer={null}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin tip={et('evolution.loading', '分析进化路径...')} />
        </div>
      </Modal>
    );
  }

  if (!pathData || pathData.options.length === 0) {
    return (
      <Modal title={et('evolution.title', '一键进化')} open={open} onCancel={onClose} footer={null}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <WarningOutlined style={{ fontSize: 32, color: '#faad14' }} />
          <p style={{ marginTop: 12, fontSize: 15, color: '#666' }}>
            {et('evolution.noFurtherEvolution', '此宝可梦无法继续进化')}
          </p>
          <Button onClick={onClose} style={{ marginTop: 16 }}>{ct('close', '关闭')}</Button>
        </div>
      </Modal>
    );
  }

  // ── Single path (direct evolve) ──
  if (!pathData.hasBranchingPaths && selectedOption) {
    return (
      <Modal
        title={et('evolution.title', '一键进化')}
        open={open}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>{ct('cancel', '取消')}</Button>,
          <Button
            key="evolve" type="primary" danger
            icon={<RocketOutlined />}
            loading={evolving}
            onClick={handleEvolve}
          >
            {et('evolution.confirmNoRollback', '确认进化 · 无法回退')}
          </Button>,
        ]}
      >
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Space size={24} align="center">
            <div>
              <PokemonSprite speciesId={pokemon.species} width={80} height={80} variant="game" />
              <div style={{ marginTop: 4, fontWeight: 500 }}>{pokemon.speciesName}</div>
              <div style={{ fontSize: 11, color: '#999' }}>Lv.{pokemon.level}</div>
            </div>
            <ArrowRightOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            <div>
              <PokemonSprite speciesId={selectedOption.species} width={80} height={80} variant="game" />
              <div style={{ marginTop: 4, fontWeight: 500, color: '#52c41a' }}>
                {selectedOption.speciesName}
              </div>
              <Tag style={{ marginTop: 4 }}>{selectedOption.methodLabel}</Tag>
            </div>
          </Space>

          <Alert
            type={selectedOption.isAvailable ? 'warning' : 'info'}
            showIcon
            icon={<WarningOutlined />}
            message={selectedOption.isAvailable
              ? et('evolution.noRollback', '进化后无法回退')
              : et('evolution.autoFixConditions', '当前条件不足，进化时会自动补足可写回条件')}
            style={{ marginTop: 16, textAlign: 'left' }}
          />

          {isNincadaToNinjask && (
            <Checkbox
              checked={createShedinja}
              onChange={e => setCreateShedinja(e.target.checked)}
              style={{ marginTop: 12 }}
            >
              {et('evolution.createShedinja', '同时生成脱壳忍者（需要空位）')}
            </Checkbox>
          )}
        </div>
      </Modal>
    );
  }

  // ── Branching paths ──
  const availableOptions = pathData.options;
  const hasUnavailableOptions = availableOptions.some(o => !o.isAvailable);

  return (
    <Modal
      title={et('evolution.branchingTitle', '一键进化 — 选择进化路径')}
      open={open}
      onCancel={onClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose}>{ct('cancel', '取消')}</Button>,
        <Button
          key="evolve" type="primary" danger
          icon={<RocketOutlined />}
          loading={evolving}
          onClick={handleEvolve}
        >
          {et('evolution.confirmNoRollback', '确认进化 · 无法回退')}
        </Button>,
      ]}
    >
      {hasUnavailableOptions && (
        <Alert
          type="info"
          showIcon
          message={et('evolution.partialUnavailable', '部分目标当前条件不足，但进化时会自动补足可写回条件')}
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message={et('evolution.chooseTargetWarning', '进化后无法回退，请选择目标')}
        style={{ marginBottom: 16 }}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
      }}>
        {availableOptions.map((o, i) => (
          <Tooltip
            key={i}
            title={o.isAvailable ? o.methodLabel : (o.blockReason || et('evolution.autoFulfill', '将自动补足条件'))}
          >
            <div
              onClick={() => { setSelectedIdx(i); setCreateShedinja(false); }}
              style={{
                padding: '10px 8px',
                borderRadius: 8,
                border: selectedIdx === i ? '2px solid #1890ff' : '1px solid #d9d9d9',
                background: selectedIdx === i ? '#e6f7ff' : (o.isAvailable ? '#fff' : '#fff7e6'),
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <PokemonSprite speciesId={o.species} width={56} height={56} variant="game" />
              <div style={{
                fontWeight: selectedIdx === i ? 600 : 400,
                fontSize: 13,
                marginTop: 4,
                color: o.isAvailable ? '#333' : '#ad6800',
              }}>
                {o.speciesName}
              </div>
              <Tag
                color={selectedIdx === i ? 'blue' : (o.isAvailable ? 'default' : 'gold')}
                style={{ fontSize: 10, marginTop: 4, marginRight: 0 }}
              >
                {o.methodLabel}
              </Tag>
              {!o.isAvailable && (
                <div style={{ marginTop: 4, fontSize: 10, color: '#ad6800' }}>
                  {et('evolution.autoFulfill', '将自动补足')}
                </div>
              )}
            </div>
          </Tooltip>
        ))}
      </div>

      {isNincadaToNinjask && (
        <Checkbox
          checked={createShedinja}
          onChange={e => setCreateShedinja(e.target.checked)}
          style={{ marginTop: 16 }}
        >
          {et('evolution.createShedinja', '同时生成脱壳忍者（需要空位）')}
        </Checkbox>
      )}
    </Modal>
  );
};

export default EvolutionModal;
