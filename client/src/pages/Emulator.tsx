import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Space, Tag, Slider, Modal } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, ArrowLeftOutlined, ReloadOutlined, SettingOutlined, SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { createMGBA, type MGBAEmulator, GBA_VERSION_MAP, ROM_DISPLAY_NAMES } from '../lib/mgba';

type ScreenScale = 1 | 2 | 4;
const SZ: Record<ScreenScale, { w: number; h: number }> = { 1: { w: 240, h: 160 }, 2: { w: 480, h: 320 }, 4: { w: 960, h: 640 } };

const GBA_BTNS = ['Up','Down','Left','Right','A','B','L','R','Start','Select'];
const BTN_LABEL: Record<string,string> = { Up:'↑上', Down:'↓下', Left:'←左', Right:'→右', A:'A', B:'B', L:'L', R:'R', Start:'Start', Select:'Select' };
const DEFAULT_KEYS: Record<string,string> = { Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight', A:'KeyZ',B:'KeyX',L:'KeyA',R:'KeyS', Start:'Enter',Select:'Backspace' };

function loadKM(): Record<string,string> { try { const s=localStorage.getItem('gba_km'); if(s) return JSON.parse(s); } catch{} return {...DEFAULT_KEYS}; }
function saveKM(m: Record<string,string>) { localStorage.setItem('gba_km', JSON.stringify(m)); }
function codeLabel(c: string): string {
  const m: Record<string,string> = { ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Enter:'Enter',Backspace:'Bksp',Space:'␣',ShiftLeft:'L⇧',ShiftRight:'R⇧' };
  return m[c] || c.replace('Key','').replace('Digit','');
}

const EmulatorPage: React.FC = () => {
  const { saveFileId, gameId } = useParams<{ saveFileId?: string; gameId?: string }>();
  const isNewGame = !!gameId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effectiveSaveId = useRef<string | null>(saveFileId || null);
  const [scale, setScale] = useState<ScreenScale>(2);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [fps, setFps] = useState(0);
  const [romName, setRomName] = useState('');
  const [saveName, setSaveName] = useState(isNewGame ? '新游戏' : '');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('初始化中...');
  const [keyMap, setKeyMap] = useState<Record<string,string>>(loadKM);
  const [keyDlg, setKeyDlg] = useState(false);
  const [binding, setBinding] = useState<string|null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const emuRef = useRef<MGBAEmulator|null>(null);
  const initDone = useRef(false);

  // Init
  useEffect(() => {
    if (initDone.current || !canvasRef.current) return;
    initDone.current = true;
    const auth = `Bearer ${localStorage.getItem('access_token')}`;
    (async () => {
      try {
        let gid: string;
        if (saveFileId) {
          // 已有存档
          setStatus('获取存档...');
          const infoRes = await fetch(`/api/SaveFile/${saveFileId}`, { headers: { Authorization: auth } });
          if (!infoRes.ok) { setStatus('存档不存在'); return; }
          const sd = (await infoRes.json()).data;
          setSaveName(sd.filename);
          gid = GBA_VERSION_MAP[sd.gameVersion] || 'pkm_emerald';
        } else if (gameId) {
          // 新游戏
          gid = gameId;
          setSaveName(ROM_DISPLAY_NAMES[gid] || gid);
        } else {
          setStatus('缺少参数'); return;
        }
        setRomName(ROM_DISPLAY_NAMES[gid] || gid);

        setStatus('下载ROM...');
        const romRes = await fetch(`/api/Emulator/roms/${gid}`, { headers: { Authorization: auth } });
        if (!romRes.ok) { setStatus(`ROM缺失: ${gid}`); return; }
        const rom = new Uint8Array(await romRes.arrayBuffer());

        // 加载已有存档（如果有）
        let savData: Uint8Array | null = null;
        if (saveFileId) {
          const rawRes = await fetch(`/api/SaveFile/${saveFileId}/raw`, { headers: { Authorization: auth } });
          if (rawRes.ok) { const d = new Uint8Array(await rawRes.arrayBuffer()); if (d.length > 0) savData = d; }
        }

        setStatus('启动模拟器...');
        const emu = await createMGBA(canvasRef.current!);
        emuRef.current = emu;
        const gp = emu.gamePath.endsWith('/') ? emu.gamePath : emu.gamePath + '/';
        const sp = emu.savePath.endsWith('/') ? emu.savePath : emu.savePath + '/';
        emu.FS.writeFile(gp + 'game.gba', rom);
        let sfp: string | undefined;
        if (savData) { emu.FS.writeFile(sp + 'game.sav', savData); sfp = sp + 'game.sav'; }
        emu.loadGame(gp + 'game.gba', sfp);
        setReady(true); setStatus('就绪');
      } catch (err: any) { setStatus(`失败: ${err.message||err}`); }
    })();
  }, [saveFileId, gameId]);

  // FPS — independent rAF counter
  useEffect(() => {
    let c = 0, last = performance.now(), run = true;
    const loop = () => { if (!run) return; c++; const n = performance.now(); if (n - last >= 1000) { setFps(c); c = 0; last = n; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return () => { run = false; };
  }, []);

  // Sync save to server (manual trigger or close)
  const syncSaveNow = async (): Promise<boolean> => {
    const emu = emuRef.current;
    if (!emu) return false;
    const sd = emu.getSave();
    if (!sd?.length) return false;
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    setSyncing(true); setSynced(false);
    try {
      const encoded = u8b64(sd);
      const body: any = {
        saveFileId: effectiveSaveId.current || '00000000-0000-0000-0000-000000000000',
        saveDataBase64: encoded,
      };
      if (isNewGame && gameId) body.gameId = gameId;
      console.log(`[syncSave] Sending ${sd.length} bytes, new=${isNewGame}, id=${effectiveSaveId.current || '(new)'}`);
      const r = await fetch('/api/Emulator/sync-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const resp = await r.json();
        // 新游戏首次同步: 服务器返回新创建的 saveFileId，存储供后续使用
        if (resp.data?.saveFileId && !effectiveSaveId.current) {
          effectiveSaveId.current = resp.data.saveFileId;
          setSaveName(`存档 - ${resp.data.trainerName || '训练家'}`);
          console.log(`[syncSave] New save created: ${effectiveSaveId.current}`);
        }
        setSynced(true);
        return true;
      }
      console.error('[syncSave] Server error:', r.status);
    } catch (err) {
      console.error('[syncSave] Network error:', err);
    } finally {
      setSyncing(false);
    }
    return false;
  };

  // Keyboard — use keyMap
  useEffect(() => {
    if (!ready) return;
    const km = keyMap;
    const rev: Record<string,string> = {}; for (const [btn, code] of Object.entries(km)) rev[code] = btn;
    const down = (e: KeyboardEvent) => { if (binding) return; const btn = rev[e.code]; if (btn) { e.preventDefault(); emuRef.current?.buttonPress(btn); } };
    const up = (e: KeyboardEvent) => { const btn = rev[e.code]; if (btn) emuRef.current?.buttonUnpress(btn); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    // beforeunload: 用 sendBeacon 发送二进制存档，保证页面关闭时存档不丢失
    const unload = () => {
      const emu = emuRef.current;
      if (!emu) return;
      const sd = emu.getSave();
      if (!sd?.length) return;
      const token = localStorage.getItem('access_token');
      if (!token) return;
      const id = effectiveSaveId.current;
      if (id) {
        const blob = new Blob([sd] as any, { type: 'application/octet-stream' });
        navigator.sendBeacon(`/api/Emulator/sync-save/${id}?token=${encodeURIComponent(token)}`, blob);
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('beforeunload', unload); };
  }, [ready, saveFileId, keyMap, binding]);

  // Key binding listener
  useEffect(() => {
    if (!binding) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const nm = { ...keyMap };
      for (const [btn, code] of Object.entries(nm)) {
        if (code === e.code) delete nm[btn];
      }
      nm[binding] = e.code;
      setKeyMap(nm); saveKM(nm); setBinding(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [binding, keyMap]);

  const { w, h } = SZ[scale];

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#eee' }}>
      {/* Toolbar */}
      <div style={{ background: '#16213e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #0f3460' }}>
        <Button icon={<ArrowLeftOutlined />} ghost size="small" onClick={async () => { await syncSaveNow(); setTimeout(() => window.close(), 300); }}>关闭</Button>
        <Button ghost size="small" icon={synced ? <CheckCircleOutlined /> : <SaveOutlined />}
          onClick={syncSaveNow} loading={syncing} disabled={!ready}
          style={{ color: synced ? '#52c41a' : undefined }}>同步存档</Button>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{saveName || 'GBA'}</span>
        <Tag color="blue" style={{ fontSize: 11 }}>{romName}</Tag>
        <div style={{ flex: 1 }} />
        <Space size={4}>
          <span style={{ fontSize: 11, color: '#888' }}>画面</span>
          {([1,2,4] as const).map(s => (
            <Button key={`scale-${s}`} ghost size="small" type={scale===s?'primary':'default'}
              onClick={() => setScale(s)} disabled={!ready} style={{ padding: '0 8px', fontSize: 12 }}>{s}×</Button>
          ))}
          <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>速度</span>
          {([1,2,4] as const).map(s => (
            <Button key={`speed-${s}`} ghost size="small" type={speed===s?'primary':'default'}
              onClick={() => { emuRef.current?.setFastForwardMultiplier(s); setSpeed(s); }} disabled={!ready} style={{ padding: '0 8px', fontSize: 12 }}>{s}×</Button>
          ))}
          <Button ghost size="small" icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={() => { const e=emuRef.current; if(!e)return; if(paused){e.resumeGame();setPaused(false);}else{e.pauseGame();setPaused(true);} }} disabled={!ready}>
            {paused ? '继续' : '暂停'}
          </Button>
          <Button ghost size="small" icon={<ReloadOutlined />} onClick={() => emuRef.current?.quickReload()} disabled={!ready}>重置</Button>
          <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#888' }}>🔊</span>
            <Slider min={0} max={100} value={volume} onChange={v => { emuRef.current?.setVolume(v/100); setVolume(v); }} disabled={!ready} style={{ width: 60, margin: 0 }} tooltip={{formatter:v=>`${v}%`}} />
          </div>
          <Button ghost size="small" icon={<SettingOutlined />} disabled={!ready} onClick={() => setKeyDlg(true)}>按键</Button>
          <Tag color="green" style={{ fontSize: 11 }}>{fps} FPS</Tag>
        </Space>
      </div>

      {/* Game Screen */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <div style={{ position: 'relative', width: w, height: h }}>
          <canvas ref={canvasRef} style={{ width: w, height: h, imageRendering: 'pixelated', border: '4px solid #0f3460', borderRadius: 4, background: '#000', display: ready ? 'block' : 'none' }} />
          {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#888', border: '4px solid #0f3460', borderRadius: 4 }}><div style={{ fontSize: 16 }}>加载中...</div><div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{status}</div></div>}
        </div>
      </div>

      {/* Key Mapping Modal */}
      <Modal title="按键映射设置" open={keyDlg} onCancel={() => setKeyDlg(false)} footer={null} width={400}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {GBA_BTNS.map(btn => (
            <div key={btn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4 }}>
              <span style={{ fontWeight: 600 }}>{BTN_LABEL[btn]}</span>
              <Button size="small" type={binding === btn ? 'primary' : 'default'}
                onClick={() => setBinding(binding === btn ? null : btn)}>
                {binding === btn ? '按下新按键...' : codeLabel(keyMap[btn] || '?')}
              </Button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={() => { setKeyMap({...DEFAULT_KEYS}); saveKM({...DEFAULT_KEYS}); }}>恢复默认</Button>
        </div>
      </Modal>

      <div style={{ textAlign: 'center', color: '#555', fontSize: 11, marginTop: 4 }}>
        {GBA_BTNS.slice(0,4).map(b=>codeLabel(keyMap[b]||'?')).join('')} 方向 | {codeLabel(keyMap['A']||'?')}=A {codeLabel(keyMap['B']||'?')}=B | 空格=暂停
      </div>

      {/* Mobile touch gamepad */}
      {ready && 'ontouchstart' in window && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', maxWidth: 480, margin: '0 auto', userSelect: 'none', touchAction: 'none' }}>
          {/* D-Pad */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 48px 48px', gridTemplateRows: '48px 48px 48px', gap: 2 }}>
            <div />
            <TouchBtn label="↑" btn="Up" emu={emuRef.current} />
            <div />
            <TouchBtn label="←" btn="Left" emu={emuRef.current} />
            <div style={{ background: '#222', borderRadius: 4 }} />
            <TouchBtn label="→" btn="Right" emu={emuRef.current} />
            <div />
            <TouchBtn label="↓" btn="Down" emu={emuRef.current} />
            <div />
          </div>
          {/* Center: Start/Select */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <TouchBtn label="Select" btn="Select" emu={emuRef.current} small />
            <TouchBtn label="Start" btn="Start" emu={emuRef.current} small />
          </div>
          {/* A/B + L/R */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <TouchBtn label="L" btn="L" emu={emuRef.current} />
              <TouchBtn label="R" btn="R" emu={emuRef.current} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TouchBtn label="B" btn="B" emu={emuRef.current} style={{ background: '#c41a1a' }} />
              <TouchBtn label="A" btn="A" emu={emuRef.current} style={{ background: '#1a7a1a' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Touch button for mobile gamepad */
const TouchBtn: React.FC<{ label: string; btn: string; emu: MGBAEmulator|null; small?: boolean; style?: React.CSSProperties }> = ({ label, btn, emu, small, style }) => {
  const pressing = useRef(false);
  const press = (e: React.TouchEvent) => { e.preventDefault(); if (!pressing.current) { emu?.buttonPress(btn); pressing.current = true; } };
  const release = (e: React.TouchEvent) => { e.preventDefault(); if (pressing.current) { emu?.buttonUnpress(btn); pressing.current = false; } };
  const size = small ? 40 : 48;
  return (
    <div
      onTouchStart={press} onTouchEnd={release} onTouchCancel={release}
      style={{
        width: size, height: size, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#333', color: '#eee', fontWeight: 700, fontSize: small ? 11 : 14,
        border: '2px solid #555', cursor: 'pointer', ...style,
      }}
    >{label}</div>
  );
};

function u8b64(data: Uint8Array): string {
  const CHUNK = 0x2000; const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK) parts.push(String.fromCharCode(...data.subarray(i, i + CHUNK)));
  return btoa(parts.join(''));
}

export default EmulatorPage;
