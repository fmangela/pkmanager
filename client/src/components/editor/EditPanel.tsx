import React, { useEffect, useState } from 'react';
import {
  Drawer, Tabs, Button, App, Space, Typography,
} from 'antd';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../api/axios';
import {
  SaveOutlined, BankOutlined, CopyOutlined, ExportOutlined,
  AppstoreOutlined, EnvironmentOutlined, BarChartOutlined,
  ThunderboltOutlined, IdcardOutlined, SkinOutlined,
  ClusterOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { PokemonDto, LegalityStatus, JudgementDto, EditResultDto, LegalityReportDto, AutoFixResultDto } from '../../api/saveFile';
import { saveFileApi } from '../../api/saveFile';
import type { EvolveResultDto } from '../../api/evolution';
import { useResourceStore } from '../../stores/resourceStore';
import { buildEditRequest, validateFields } from './editHelpers';
import ShowdownExportModal from './ShowdownExportModal';
import MainTab from './MainTab';
import MetTab from './MetTab';
import StatsTab from './StatsTab';
import MovesTab from './MovesTab';
import LegalityTab from './LegalityTab';
import OTMiscTab from './OTMiscTab';
import CosmeticTab from './CosmeticTab';
import GenSpecificTab from './GenSpecificTab';
import PokemonSprite from '../PokemonSprite';

const { Text } = Typography;

interface Props {
  open: boolean;
  pokemon: PokemonDto | null;
  generation: number;
  saveFileId?: string;
  boxIndex?: number;
  slotIndex?: number;
  isParty?: boolean;
  boxCount?: number;
  onClose: () => void;
  onSaved: () => void;
}

const panelTabLabel = (icon: React.ReactNode, label: string) => (
  <Space size={6} align="center" className="pokemon-editor-drawer__tab-label">
    <span className="pokemon-editor-drawer__tab-icon">{icon}</span>
    <span>{label}</span>
  </Space>
);

function applyPokemonUpdate(target: PokemonDto, updated: PokemonDto): void {
  Object.assign(target, updated);
}

const EditPanel: React.FC<Props> = ({ open, pokemon, generation, saveFileId, boxIndex, slotIndex, isParty, boxCount, onClose, onSaved }) => {
  const { t } = useTranslation(['editor', 'messages', 'common']);
  const [loading, setLoading] = useState(false);
  const [legality, setLegality] = useState<{
    status: LegalityStatus;
    report?: string;
    judgements: JudgementDto[];
  } | null>(null);

  // Counter for regular field edits (triggers re-render only)
  const [, forceUpdate] = useState(0);
  const notifyChange = () => forceUpdate(n => n + 1);
  const [saveKey, setSaveKey] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [exportText, setExportText] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const { loadAll } = useResourceStore();
  const { message } = App.useApp();
  const et = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'editor', defaultValue, ...(options ?? {}) });
  const mt = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'messages', defaultValue, ...(options ?? {}) });
  const ct = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(key, { ns: 'common', defaultValue, ...(options ?? {}) });

  // editSnapshot 在每次渲染时重新计算（pokemon 是 mutate-in-place 的同一引用）
  const editSnapshot = pokemon ? buildEditRequest(pokemon) : {};

  const handleExportShowdown = async () => {
    if (!pokemon?.pkmDataBase64) { message.warning(et('bankEdit.missingPokemonDataExport', '缺少宝可梦数据，无法导出')); return; }
    setExportLoading(true);
    try {
      const res = await saveFileApi.exportShowdown({
        pkmDataBase64: pokemon.pkmDataBase64,
        editSnapshot,
      });
      setExportText(res.data);
      setShowExport(true);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, mt('exportFailed', '导出失败')));
    } finally { setExportLoading(false); }
  };

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  useEffect(() => {
    if (open && pokemon) {
      setLegality(null);
    }
  }, [open, pokemon]);

  if (!pokemon) return null;

  const handleSave = async () => {
    const b64 = pokemon.pkmDataBase64;
    if (!b64) { message.error(et('editPanel.missingPokemonData', '无法识别宝可梦数据')); return; }
    if (!saveFileId) { message.error(et('editPanel.missingSaveId', '缺少存档ID')); return; }

    const errors = validateFields(pokemon, (key, defaultValue, options) => et(key, defaultValue, options));
    if (errors.length > 0) { message.error(et('bankEdit.validationFailed', '字段校验失败: {{errors}}', { errors: errors.join('; ') })); return; }

    const editSnapshot = buildEditRequest(pokemon);
    setLoading(true);
    try {
      const res = await saveFileApi.updateSaveSlot(
        b64, saveFileId, boxIndex ?? 0, slotIndex ?? 0, isParty ?? false, editSnapshot);
      const result: EditResultDto = res.data;

      // Always update pokemon with backend response (includes recalculated stats)
      const updated = result.updatedPokemon;

      setLegality({
        status: result.status,
        report: result.report,
        judgements: result.judgements,
      });

      // Update pokemon with backend-verified data immediately
      if (updated) applyPokemonUpdate(pokemon, updated);
      notifyChange();
      if (result.isValid) {
        message.success(et('editPanel.saved', '修改已保存！'));
      } else {
        message.warning(et('editPanel.savedIllegal', '已保存（⚠️ 宝可梦不合法）'));
      }
      // Let parent reload in background (won't affect current display)
      setTimeout(() => onSaved(), 200);
      setSaveKey(k => k + 1);  // force remount Tabs to clean stale internal state
    } catch (err: unknown) {
      message.error(getErrorMessage(err, mt('saveFailed', '保存失败')));
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (fixAction: string) => {
    const b64 = pokemon.pkmDataBase64;
    if (!b64) { message.error(et('bankEdit.missingPokemonDataEdit', '该记录缺少原始数据，无法编辑')); return; }
    const editSnapshot = buildEditRequest(pokemon);
    setLoading(true);
    try {
      const res = await saveFileApi.autoFix({
        pkmDataBase64: b64,
        editSnapshot,
        fixActions: [fixAction],
        trainerSaveFileId: saveFileId ?? undefined,
      });
      const result: AutoFixResultDto = res.data;
      if (result.fixed && result.updatedPokemon) {
        Object.assign(pokemon, result.updatedPokemon);
        setLegality({
          status: result.status,
          report: result.report,
          judgements: result.judgements,
        });
        notifyChange();
        message.success(et('editPanel.fixDone', '修复完成: {{fixes}}', { fixes: result.appliedFixes.join(', ') }));
        if (result.failedFixes.length > 0) {
          message.warning(et('editPanel.fixPartialFailed', '部分修复失败: {{fixes}}', { fixes: result.failedFixes.join(', ') }));
        }
      } else {
        message.warning(result.failedFixes.length > 0
          ? et('editPanel.fixFailed', '修复失败: {{fixes}}', { fixes: result.failedFixes.join(', ') })
          : et('editPanel.fixNotApplicable', '修复不适用'));
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, et('editPanel.fixNotApplicable', '修复不适用')));
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    const b64 = pokemon.pkmDataBase64;
    if (!b64) return;
    const editSnapshot = buildEditRequest(pokemon);
    try {
      const res = await saveFileApi.validatePokemon(b64, editSnapshot);
      const report: LegalityReportDto = res.data;
      setLegality({
        status: report.status,
        report: report.report,
        judgements: report.judgements,
      });
      message.info(et('editPanel.validateDone', '合法性验证完成'));
    } catch {
      message.error(et('editPanel.validateFailed', '验证失败'));
    }
  };

  const tabItems = [
    {
      key: 'main',
      label: panelTabLabel(<AppstoreOutlined />, et('editPanel.tabMain', '基本信息')),
      children: <MainTab pokemon={pokemon} generation={generation} onChange={notifyChange}
        saveFileId={saveFileId} boxIndex={boxIndex} slotIndex={slotIndex} isParty={isParty}
        editSnapshot={editSnapshot}
        onEvolved={(result: EvolveResultDto) => {
          if (result.evolvedPokemon) {
            Object.assign(pokemon, result.evolvedPokemon);
            setLegality(null);
          }
          notifyChange();
          // 触发父层刷新箱子/队伍列表 + 脱壳忍者出现
          onSaved();
          if (result.shedinja) {
            message.success(et('editPanel.shedinjaGenerated', '脱壳忍者已生成至 {{location}}', { location: result.shedinjaLocation }));
          }
        }}
      />,
    },
    {
      key: 'met',
      label: panelTabLabel(<EnvironmentOutlined />, et('editPanel.tabMet', '相遇信息')),
      children: <MetTab pokemon={pokemon} generation={generation} onChange={notifyChange} saveFileId={saveFileId} boxCount={boxCount} onGenerated={onSaved} />,
    },
    {
      key: 'stats',
      label: panelTabLabel(<BarChartOutlined />, et('editPanel.tabStats', '能力值')),
      children: <StatsTab pokemon={pokemon} generation={generation} onChange={notifyChange} />,
    },
    {
      key: 'moves',
      label: panelTabLabel(<ThunderboltOutlined />, et('editPanel.tabMoves', '招式')),
      children: <MovesTab pokemon={pokemon} generation={generation} onChange={notifyChange} />,
    },
    {
      key: 'otmisc',
      label: panelTabLabel(<IdcardOutlined />, et('editPanel.tabOtMisc', '训练家/杂项')),
      children: <OTMiscTab pokemon={pokemon} generation={generation} onChange={notifyChange} />,
    },
    {
      key: 'cosmetic',
      label: panelTabLabel(<SkinOutlined />, et('editPanel.tabCosmetic', '外观/装饰')),
      children: <CosmeticTab pokemon={pokemon} generation={generation} onChange={notifyChange} />,
    },
    {
      key: 'genspecific',
      label: panelTabLabel(<ClusterOutlined />, et('editPanel.tabGenSpecific', '世代专属')),
      children: <GenSpecificTab pokemon={pokemon} generation={generation} onChange={notifyChange} />,
    },
    {
      key: 'legality',
      label: panelTabLabel(<SafetyCertificateOutlined />, et('editPanel.tabLegality', '合法性')),
      children: (
        <LegalityTab
          status={legality?.status || 'Legal'}
          report={legality?.report}
          judgements={legality?.judgements || []}
          onFix={legality ? handleFix : undefined}
          onValidate={handleValidate}
          pkmDataBase64={pokemon.pkmDataBase64}
          editSnapshot={editSnapshot}
        />
      ),
    },
  ];

  const positionLabel = isParty
    ? et('editPanel.positionParty', '随行位置 {{index}}', { index: slotIndex != null ? slotIndex + 1 : '—' })
    : boxIndex != null && boxIndex >= 0 && slotIndex != null
      ? et('editPanel.positionBox', 'Box {{box}} · 槽位 {{slot}}', { box: boxIndex + 1, slot: slotIndex + 1 })
      : et('editPanel.positionSave', '存档宝可梦');
  const subtitleParts = [
    positionLabel,
    pokemon.languageName,
    pokemon.natureName,
    pokemon.heldItemName || et('editPanel.noHeldItem', '无持有物'),
  ].filter(Boolean);
  const legalityTone = legality?.status === 'Illegal'
    ? 'danger'
    : legality?.status === 'Fishy'
      ? 'warning'
      : legality?.status === 'Legal'
        ? 'success'
        : 'neutral';
  const legalityLabel = legality?.status === 'Illegal'
    ? et('bankEdit.illegal', '不合法')
    : legality?.status === 'Fishy'
      ? et('bankEdit.fishy', '可疑')
      : legality?.status === 'Legal'
        ? et('bankEdit.legal', '合法')
        : et('editPanel.legalityPending', '待验证');
  const legalityHint = legality?.report
    ? et('editPanel.legalityHintSynced', '已同步最近一次验证结果')
    : et('editPanel.legalityHintSuggest', '建议保存前执行验证');

  return (
    <Drawer
      rootClassName="pokemon-editor-drawer"
      title={
        <div className="pokemon-editor-drawer__header">
          <div className="pokemon-editor-drawer__identity">
            <div className="pokemon-editor-drawer__sprite-shell">
              <PokemonSprite speciesId={pokemon.species} width={56} height={56} />
            </div>
            <div className="pokemon-editor-drawer__titles">
              <Text className="pokemon-editor-drawer__eyebrow">{et('editPanel.consoleTitle', '宝可梦控制台')}</Text>
              <div className="pokemon-editor-drawer__title-row">
                <span className="pokemon-editor-drawer__title">{pokemon.nickname || pokemon.speciesName} Lv.{pokemon.level}</span>
                {pokemon.isShiny && <span className="app-status-chip is-warning">{et('editPanel.shiny', '闪光')}</span>}
                {pokemon.isEgg && <span className="app-status-chip">{et('bankEdit.egg', '蛋')}</span>}
              </div>
              <Text className="pokemon-editor-drawer__subtitle">{subtitleParts.join(' · ')}</Text>
            </div>
          </div>
          <div className={`pokemon-editor-drawer__status-card is-${legalityTone}`}>
            <span className="pokemon-editor-drawer__status-label">{et('editPanel.legalityTitle', '合法性')}</span>
            <strong className="pokemon-editor-drawer__status-value">{legalityLabel}</strong>
            <span className="pokemon-editor-drawer__status-hint">{legalityHint}</span>
          </div>
        </div>
      }
      open={open}
      onClose={onClose}
      size="large"
      footer={
        <div className="pokemon-editor-drawer__footer">
          <div className="pokemon-editor-drawer__footer-secondary">
            <Button icon={<CopyOutlined />} size="small" disabled>{et('editPanel.copy', '复制')}</Button>
            <Button icon={<BankOutlined />} size="small" disabled>{et('editPanel.storeBank', '存入银行')}</Button>
          </div>
          <div className="pokemon-editor-drawer__footer-primary">
            <Button
              icon={<ExportOutlined />}
              size="small"
              loading={exportLoading}
              disabled={!pokemon?.pkmDataBase64}
              onClick={handleExportShowdown}
            >
              {et('bankEdit.showdownExport', 'Showdown 导出')}
            </Button>
            <Button onClick={onClose}>{ct('cancel', '取消')}</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSave}>
              {et('bankEdit.saveChanges', '保存修改')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="pokemon-editor-drawer__body">
        <Tabs
          key={`tabs-${saveKey}`}
          className="pokemon-editor-drawer__tabs"
          items={tabItems}
          defaultActiveKey="main"
          size="small"
        />
      </div>
      <ShowdownExportModal
        open={showExport}
        showdownText={exportText}
        onClose={() => setShowExport(false)}
      />
    </Drawer>
  );
};

export default EditPanel;

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiError | undefined)?.response?.data?.message || fallback;
}
