import React, { useEffect, useRef, useState } from 'react';
import {
  Drawer, Tabs, Button, App, Space, Tag, Modal, Select, Radio, Row, Col, Typography, Alert, Tooltip, Descriptions,
} from 'antd';
import { SaveOutlined, SendOutlined, ExperimentOutlined, ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../api/axios';
import type { PokemonDto, LegalityStatus, JudgementDto, EditResultDto, LegalityReportDto, SaveFileInfo, SaveFileDetail } from '../../api/saveFile';
import { saveFileApi } from '../../api/saveFile';
import { bankApi } from '../../api/bank';
import { useResourceStore } from '../../stores/resourceStore';
import { getPokemonSpriteUrl, getPokeApiSpriteUrl, getPokeApiArtworkUrl } from '../../lib/spriteUrl';
import { buildEditRequest, validateFields } from '../editor/editHelpers';
import MainTab from '../editor/MainTab';
import MetTab from '../editor/MetTab';
import StatsTab from '../editor/StatsTab';
import MovesTab from '../editor/MovesTab';
import LegalityTab from '../editor/LegalityTab';
import OTMiscTab from '../editor/OTMiscTab';
import CosmeticTab from '../editor/CosmeticTab';
import GenSpecificTab from '../editor/GenSpecificTab';
import ShowdownExportModal from '../editor/ShowdownExportModal';

const { Text } = Typography;

const GENERATION_LABELS: Record<number, string> = {
  3: 'Gen3 (GBA)', 4: 'Gen4 (NDS)', 5: 'Gen5 (NDS)', 6: 'Gen6 (3DS)', 7: 'Gen7 (3DS)',
};

function applyPokemonUpdate(target: PokemonDto, updated: PokemonDto): void {
  Object.assign(target, updated);
}

interface Props {
  open: boolean;
  pokemon: PokemonDto | null;
  bankId: string;
  onClose: () => void;
  onSaved: () => void;
}

const BankEditDrawer: React.FC<Props> = ({ open, pokemon, bankId, onClose, onSaved }) => {
  const { t } = useTranslation(['common', 'messages', 'pages', 'editor']);
  const [loading, setLoading] = useState(false);
  const [legality, setLegality] = useState<{
    status: LegalityStatus;
    report?: string;
    judgements: JudgementDto[];
  } | null>(null);

  const [, forceUpdate] = useState(0);
  const notifyChange = () => forceUpdate(n => n + 1);

  // Fallback stage tracker for artwork → local standard → remote standard → SVG
  const artFallbackStage = useRef(0);
  useEffect(() => {
    artFallbackStage.current = 0;
  }, [pokemon?.species]);

  // Showdown export
  const [showExport, setShowExport] = useState(false);
  const [exportText, setExportText] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  // Move-to-save modal
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveSaves, setMoveSaves] = useState<SaveFileInfo[]>([]);
  const [moveTargetSaveId, setMoveTargetSaveId] = useState<string | undefined>();
  const [moveTargetBox, setMoveTargetBox] = useState<number>(0);
  const [moveSaveDetail, setMoveSaveDetail] = useState<SaveFileDetail | null>(null);
  const [moveTargetSlot, setMoveTargetSlot] = useState<number | undefined>();

  const { loadAll } = useResourceStore();
  const { message } = App.useApp();

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  useEffect(() => {
    if (open && pokemon) {
      setLegality(null); // Reset to "unverified"
    }
  }, [open, pokemon]);

  if (!pokemon) return null;

  const generation = pokemon.format || 0;
  const hasPkmData = !!pokemon.pkmDataBase64;
  const editSnapshot = buildEditRequest(pokemon);

  // ── Save ──────────────────────────────────────────────

  const handleExportShowdown = async () => {
    if (!pokemon?.pkmDataBase64) { message.warning(t('bankEdit.missingPokemonDataExport', { ns: 'editor', defaultValue: '缺少宝可梦数据，无法导出' })); return; }
    setExportLoading(true);
    try {
      const res = await saveFileApi.exportShowdown({
        pkmDataBase64: pokemon.pkmDataBase64,
        editSnapshot,
      });
      setExportText(res.data);
      setShowExport(true);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, t('exportFailed', { ns: 'messages', defaultValue: '导出失败' })));
    } finally { setExportLoading(false); }
  };

  const handleSave = async () => {
    if (!hasPkmData) { message.error(t('bankEdit.missingPokemonDataEdit', { ns: 'editor', defaultValue: '该记录缺少原始数据，无法编辑' })); return; }

    const errors = validateFields(
      pokemon,
      (key, defaultValue, options) => t(key, { ns: 'editor', defaultValue, ...(options ?? {}) }),
    );
    if (errors.length > 0) { message.error(t('bankEdit.validationFailed', { ns: 'editor', defaultValue: '字段校验失败: {{errors}}', errors: errors.join('; ') })); return; }

    const editSnapshot = buildEditRequest(pokemon);
    setLoading(true);
    try {
      const res = await bankApi.saveEdit(bankId, editSnapshot);
      const result: EditResultDto = res.data;
      const updated = result.updatedPokemon;

      setLegality({
        status: result.status,
        report: result.report,
        judgements: result.judgements || [],
      });

      if (updated) applyPokemonUpdate(pokemon, updated);
      notifyChange();
      if (result.status === 'Legal') {
        message.success(t('bankEdit.saved', { ns: 'editor', defaultValue: '修改已保存！' }));
      } else {
        message.warning(t('bankEdit.savedIllegal', { ns: 'editor', defaultValue: '已保存（⚠️ 宝可梦不合法）' }));
      }
      setTimeout(() => onSaved(), 200);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, t('saveFailed', { ns: 'messages', defaultValue: '保存失败' })));
    } finally {
      setLoading(false);
    }
  };

  // ── Validate ──────────────────────────────────────────

  const handleValidate = async () => {
    if (!hasPkmData) { message.warning(t('bankEdit.missingPokemonDataValidate', { ns: 'editor', defaultValue: '该记录缺少原始数据，无法验证' })); return; }
    const editSnapshot = buildEditRequest(pokemon);
    try {
      const res = await saveFileApi.validateById(bankId, editSnapshot);
      const report: LegalityReportDto = res.data;
      setLegality({
        status: report.status,
        report: report.report,
        judgements: report.judgements || [],
      });
      message.info(t('bankEdit.validateDone', { ns: 'editor', defaultValue: '合法性验证完成' }));
    } catch {
      message.error(t('bankEdit.validateFailed', { ns: 'editor', defaultValue: '验证失败' }));
    }
  };

  // ── Move-to-save modal ────────────────────────────────

  const openMoveModal = async () => {
    try {
      const res = await saveFileApi.list();
      setMoveSaves(res.data || []);
      setMoveTargetSaveId(undefined);
      setMoveTargetBox(0);
      setMoveSaveDetail(null);
      setMoveTargetSlot(undefined);
      setMoveModalOpen(true);
    } catch {
      message.error(t('loadSaveListFailed', { ns: 'messages', defaultValue: '加载存档列表失败' }));
    }
  };

  const handleMoveSaveSelected = async (saveFileId: string) => {
    setMoveTargetSaveId(saveFileId);
    setMoveTargetBox(0);
    setMoveSaveDetail(null);
    try {
      const res = await saveFileApi.getDetail(saveFileId);
      setMoveSaveDetail(res.data);
    } catch {
      message.error(t('loadSaveDetailFailed', { ns: 'messages', defaultValue: '加载存档详情失败' }));
    }
  };

  const handleMoveToSave = async () => {
    if (!moveTargetSaveId) return;
    setMoveLoading(true);
    try {
      await bankApi.sendToSave(bankId, {
        saveFileId: moveTargetSaveId,
        targetBoxIndex: moveTargetBox,
        targetSlotIndex: moveTargetSlot,
      });
      message.success(t('moveToSaveSuccess', { ns: 'messages', defaultValue: '已发送到存档！' }));
      setMoveModalOpen(false);
      onSaved();
      onClose();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, t('moveFailed', { ns: 'messages', defaultValue: '移动失败' })));
    } finally {
      setMoveLoading(false);
    }
  };

  // ── Tab definitions ───────────────────────────────────

  const tabItems = [
    { key: 'main', label: t('bankEdit.tabMain', { ns: 'editor', defaultValue: '基本信息' }), children: <MainTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'stats', label: t('bankEdit.tabStats', { ns: 'editor', defaultValue: '能力值' }), children: <StatsTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'moves', label: t('bankEdit.tabMoves', { ns: 'editor', defaultValue: '招式' }), children: <MovesTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'met', label: t('bankEdit.tabMet', { ns: 'editor', defaultValue: '相遇信息' }), children: <MetTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'otmisc', label: t('bankEdit.tabOtMisc', { ns: 'editor', defaultValue: '训练家/杂项' }), children: <OTMiscTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'cosmetic', label: t('bankEdit.tabCosmetic', { ns: 'editor', defaultValue: '外观/装饰' }), children: <CosmeticTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    { key: 'genspecific', label: t('bankEdit.tabGenSpecific', { ns: 'editor', defaultValue: '世代专属' }), children: <GenSpecificTab pokemon={pokemon} generation={generation} onChange={notifyChange} /> },
    {
      key: 'legality',
      label: t('bankEdit.tabLegality', { ns: 'editor', defaultValue: '合法性' }),
      children: legality === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Text type="secondary" style={{ fontSize: 16 }}>{t('bankEdit.unverified', { ns: 'editor', defaultValue: '尚未验证合法性' })}</Text>
          <br />
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={handleValidate}
            style={{ marginTop: 16 }}
            disabled={!hasPkmData}
          >
            {t('bankEdit.validate', { ns: 'editor', defaultValue: '验证合法性' })}
          </Button>
        </div>
      ) : (
        <LegalityTab
          status={legality.status}
          report={legality.report}
          judgements={legality.judgements}
          onValidate={handleValidate}
          pkmDataBase64={pokemon.pkmDataBase64}
          editSnapshot={editSnapshot}
        />
      ),
    },
  ];

  const legalityChip =
    legality === null ? <Tag>{t('bankEdit.unverifiedTag', { ns: 'editor', defaultValue: '未验证' })}</Tag>
    : legality.status === 'Legal' ? <Tag color="success">✓ {t('bankEdit.legal', { ns: 'editor', defaultValue: '合法' })}</Tag>
    : legality.status === 'Fishy' ? <Tag color="warning">⚠ {t('bankEdit.fishy', { ns: 'editor', defaultValue: '可疑' })}</Tag>
    : <Tag color="error">✗ {t('bankEdit.illegal', { ns: 'editor', defaultValue: '不合法' })}</Tag>;

  // ── Render ────────────────────────────────────────────

  return (
    <>
      <Drawer
        title={
          <Space wrap>
            <img
              src={getPokeApiArtworkUrl(pokemon.species)}
              alt={pokemon.speciesName}
              style={{ width: 40, height: 40, objectFit: 'contain' }}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                artFallbackStage.current += 1;
                if (artFallbackStage.current === 1) {
                  img.src = getPokemonSpriteUrl(pokemon.species);
                } else if (artFallbackStage.current === 2) {
                  img.src = getPokeApiSpriteUrl(pokemon.species);
                } else {
                  img.onerror = null; // Stage 3+ — 终止回退，杜绝死循环
                  img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23f0f0f0" width="40" height="40"/><text x="20" y="20" text-anchor="middle" dy=".3em" fill="%23999" font-size="7">PK</text></svg>');
                }
              }}
            />
            <span style={{ fontWeight: 600 }}>
              {pokemon.nickname || pokemon.speciesName} Lv.{pokemon.level}
            </span>
            {pokemon.isShiny && <Tag color="gold">✨ {t('bank.shinyTag', { ns: 'pages', defaultValue: '闪光' })}</Tag>}
            {pokemon.isEgg && <Tag>🥚 {t('bankEdit.egg', { ns: 'editor', defaultValue: '蛋' })}</Tag>}
            {generation > 0 && <Tag color="blue">{GENERATION_LABELS[generation] || `PK${generation}`}</Tag>}
            {legalityChip}
          </Space>
        }
        open={open}
        onClose={onClose}
        size="large"
        extra={
          <Space>
            <Tooltip title={!hasPkmData ? t('bankEdit.incompleteDataNoAction', { ns: 'editor', defaultValue: '数据不完整，无法操作' }) : undefined}>
              <Button icon={<SendOutlined />} onClick={openMoveModal} disabled={!hasPkmData}>{t('bankEdit.sendToSave', { ns: 'editor', defaultValue: '发送到存档' })}</Button>
            </Tooltip>
              <Tooltip title={!hasPkmData ? t('bankEdit.incompleteDataNoAction', { ns: 'editor', defaultValue: '数据不完整，无法操作' }) : undefined}>
              <Button icon={<ExportOutlined />} loading={exportLoading}
                onClick={handleExportShowdown} disabled={!hasPkmData}>{t('bankEdit.showdownExport', { ns: 'editor', defaultValue: 'Showdown 导出' })}</Button>
              </Tooltip>
            <Button onClick={onClose}>{t('cancel', { ns: 'common', defaultValue: '取消' })}</Button>
            <Tooltip title={!hasPkmData ? t('bankEdit.incompleteDataNoEdit', { ns: 'editor', defaultValue: '数据不完整，无法编辑' }) : undefined}>
              <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSave} disabled={!hasPkmData}>
                {t('bankEdit.saveChanges', { ns: 'editor', defaultValue: '保存修改' })}
              </Button>
            </Tooltip>
          </Space>
        }
      >
        {!hasPkmData && (
          <Alert
            type="warning"
            message={t('bankEdit.readOnlyMissingData', { ns: 'editor', defaultValue: '该记录缺少原始数据，仅可查看' })}
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}
        {!hasPkmData ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t('showdown.field.species', { ns: 'editor', defaultValue: '物种' })}>{pokemon.speciesName}</Descriptions.Item>
            <Descriptions.Item label={t('showdown.field.level', { ns: 'editor', defaultValue: '等级' })}>Lv.{pokemon.level}</Descriptions.Item>
            {pokemon.nickname && <Descriptions.Item label={t('showdown.field.nickname', { ns: 'editor', defaultValue: '昵称' })}>{pokemon.nickname}</Descriptions.Item>}
            <Descriptions.Item label={t('showdown.field.nature', { ns: 'editor', defaultValue: '性格' })}>{pokemon.natureName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('showdown.field.ability', { ns: 'editor', defaultValue: '特性' })}>{pokemon.abilityName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('showdown.field.shiny', { ns: 'editor', defaultValue: '闪光' })}>{pokemon.isShiny ? <Tag color="gold">✨ {t('yes', { ns: 'common', defaultValue: '是' })}</Tag> : t('no', { ns: 'common', defaultValue: '否' })}</Descriptions.Item>
            <Descriptions.Item label={t('bankEdit.egg', { ns: 'editor', defaultValue: '蛋' })}>{pokemon.isEgg ? `${t('yes', { ns: 'common', defaultValue: '是' })} 🥚` : t('no', { ns: 'common', defaultValue: '否' })}</Descriptions.Item>
            {pokemon.heldItemName && <Descriptions.Item label={t('bankEdit.heldItem', { ns: 'editor', defaultValue: '持有物' })}>{pokemon.heldItemName}</Descriptions.Item>}
            {pokemon.ballName && <Descriptions.Item label={t('bankEdit.ball', { ns: 'editor', defaultValue: '球种' })}>{pokemon.ballName}</Descriptions.Item>}
            <Descriptions.Item label={t('bankEdit.originGame', { ns: 'editor', defaultValue: '来源游戏' })}>{pokemon.originGameName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('bankEdit.originalTrainer', { ns: 'editor', defaultValue: '初训家' })}>{pokemon.originalTrainerName || '-'}</Descriptions.Item>
            <Descriptions.Item label="TID">{pokemon.tid}</Descriptions.Item>
            <Descriptions.Item label="SID">{pokemon.sid}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Tabs items={tabItems} defaultActiveKey="main" size="small" />
        )}
      </Drawer>

      <ShowdownExportModal
        open={showExport}
        showdownText={exportText}
        onClose={() => setShowExport(false)}
      />

      {/* Move-to-save Modal */}
      <Modal
        title={t('bankEdit.sendToSave', { ns: 'editor', defaultValue: '发送到存档' })}
        open={moveModalOpen}
        onOk={handleMoveToSave}
        onCancel={() => setMoveModalOpen(false)}
        okText={t('bankEdit.sendToSave', { ns: 'editor', defaultValue: '发送到存档' })}
        cancelText={t('cancel', { ns: 'common', defaultValue: '取消' })}
        confirmLoading={moveLoading}
        okButtonProps={{ disabled: !moveTargetSaveId }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>{t('bank.targetSaveStep', { ns: 'pages', defaultValue: '1. 选择目标存档' })}</Text>
          <Select
            placeholder={t('bank.selectSavePlaceholder', { ns: 'pages', defaultValue: '选择存档...' })}
            style={{ width: '100%', marginTop: 8 }}
            value={moveTargetSaveId}
            onChange={handleMoveSaveSelected}
            showSearch
            optionFilterProp="label"
            options={moveSaves.map(s => ({
              value: s.saveFileId,
              label: `${s.filename} (${s.trainerName || '?'} · ${s.gameVersionName || `Gen${s.generation}`} · ${s.pokemonCount}只)`,
            }))}
          />
        </div>

        {moveSaveDetail && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t('bank.targetBoxStep', { ns: 'pages', defaultValue: '2. 选择目标箱子' })}</Text>
            <Radio.Group
              style={{ width: '100%', marginTop: 8 }}
              value={moveTargetBox}
              onChange={(e) => setMoveTargetBox(e.target.value)}
            >
              <Row gutter={[8, 8]}>
                {moveSaveDetail.boxes.map((box, i) => {
                  const used = box.slots.filter(s => !s.isEmpty).length;
                  const capacity = box.slots.length;
                  return (
                    <Col span={12} key={i}>
                      <Radio value={i}>
                        {box.boxName || t('bank.boxLabel', { ns: 'pages', defaultValue: '箱子 {{index}}', index: i + 1 })}
                        <Text type="secondary" style={{ marginLeft: 8 }}>({used}/{capacity})</Text>
                      </Radio>
                    </Col>
                  );
                })}
              </Row>
            </Radio.Group>
          </div>
        )}

        {moveSaveDetail && generation > 0 && moveSaveDetail.generation !== generation && (
          <Alert
            type="info"
            message={t('bankEdit.crossGenConvert', {
              ns: 'editor',
              defaultValue: '目标存档世代（Gen{{saveGen}}）与宝可梦世代（Gen{{pokemonGen}}）不同，将自动进行兼容转换',
              saveGen: moveSaveDetail.generation,
              pokemonGen: generation,
            })}
            style={{ marginBottom: 12 }}
            showIcon
          />
        )}

        <Text type="secondary">{t('bankEdit.sendToSaveHint', {
          ns: 'editor',
          defaultValue: '将 "{{name}}" 发送到目标箱子（自动填充空位）',
          name: pokemon.nickname || pokemon.speciesName,
        })}</Text>
      </Modal>
    </>
  );
};

export default BankEditDrawer;

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiError | undefined)?.response?.data?.message || fallback;
}
