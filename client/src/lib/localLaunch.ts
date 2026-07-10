import type { MessageInstance } from 'antd/es/message/interface';
import { emulatorApi, type LaunchLocalResult } from '../api/saveFile';
import { buildWindowsScript } from './windowsLauncherScript';
import { getI18nText } from '../i18n/i18n';

const detectProtocolSupport = (protoUrl: string) => new Promise<boolean>((resolve) => {
  let done = false;

  const finish = (result: boolean) => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    resolve(result);
  };

  const onBlur = () => finish(true);
  const onPageHide = () => finish(true);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') finish(true);
  };

  const timer = window.setTimeout(() => finish(false), 2500);

  window.addEventListener('blur', onBlur, { once: true });
  window.addEventListener('pagehide', onPageHide, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  const link = document.createElement('a');
  link.href = protoUrl;
  link.style.display = 'none';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

const triggerDownload = (content: string, fileName: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const buildPosixScript = (pkg: LaunchLocalResult, backendBase: string, fallbackName?: string) => {
  const escapedSavePath = (pkg.emuSavePath || '').replace(/'/g, "'\\''");
  const escapedExe = pkg.exePath.replace(/'/g, "'\\''");
  const escapedRom = (pkg.romPath || '').replace(/'/g, "'\\''");
  const escapedSaveDir = pkg.saveDir.replace(/'/g, "'\\''");
  const titleIdLow = (pkg.titleIdLow || '').replace(/'/g, "'\\''");
  const escapedBackend = backendBase.replace(/'/g, "'\\''");
  const escapedSaveFileId = pkg.saveFileId.replace(/'/g, "'\\''");
  const escapedSyncToken = pkg.syncToken.replace(/'/g, "'\\''");
  const baseName = (pkg.fileName || fallbackName || 'save').replace(/\.[^.]+$/, '');

  const scriptContent = `#!/bin/bash
set -e

SAVE_DATA_BASE64='${pkg.saveDataBase64}'
EMU_SAVE_PATH='${escapedSavePath}'
EXE_PATH='${escapedExe}'
ROM_PATH='${escapedRom}'
SAVE_DIR='${escapedSaveDir}'
TYPE='${pkg.type}'
TITLE_ID_LOW='${titleIdLow}'
BACKEND_BASE='${escapedBackend}'
SAVE_FILE_ID='${escapedSaveFileId}'
SYNC_TOKEN='${escapedSyncToken}'

if [ "$TYPE" = "azahar" ]; then
  BACKUP_DIR="$SAVE_DIR/pkmanager_backup/$TITLE_ID_LOW"
  BACKUP_FILE="$BACKUP_DIR/main.bak"
else
  BACKUP_DIR="$SAVE_DIR/pkmanager_backup"
  BACKUP_FILE="$BACKUP_DIR/save.dsv.bak"
fi

mkdir -p "$BACKUP_DIR"
HAD_EXISTING_SAVE=0
BACKUP_READY=0
if [ -f "$EMU_SAVE_PATH" ]; then
  HAD_EXISTING_SAVE=1
  if cp "$EMU_SAVE_PATH" "$BACKUP_FILE" 2>/dev/null; then
    BACKUP_READY=1
    echo "[pkmanager] Existing save backed up"
  else
    echo "[WARN] Backup failed, continuing anyway"
  fi
fi

mkdir -p "$(dirname "$EMU_SAVE_PATH")"
echo "$SAVE_DATA_BASE64" | base64 -d > "$EMU_SAVE_PATH"
echo "[pkmanager] Save injected"
echo "[pkmanager] Launching: $EXE_PATH $ROM_PATH"
"$EXE_PATH" "$ROM_PATH"
EXIT_CODE=$?
echo "[pkmanager] Emulator exited with code $EXIT_CODE"

if [ -n "$SAVE_FILE_ID" ] && [ -n "$SYNC_TOKEN" ] && [ -f "$EMU_SAVE_PATH" ]; then
  SYNC_URL="$BACKEND_BASE/api/Emulator/sync-save/$SAVE_FILE_ID?token=$SYNC_TOKEN"
  echo "[pkmanager] Syncing save back to backend..."
  if curl -fsS -X POST -H "Content-Type: application/octet-stream" --data-binary "@$EMU_SAVE_PATH" "$SYNC_URL" >/tmp/pkmanager_sync.log 2>/tmp/pkmanager_sync.err; then
    echo "[pkmanager] Save synced successfully."
    if [ "$BACKUP_READY" = "1" ] && [ -f "$BACKUP_FILE" ]; then
      cp "$BACKUP_FILE" "$EMU_SAVE_PATH" 2>/dev/null && echo "[pkmanager] Restored previous local save." || echo "[WARN] Failed to restore previous local save."
    elif [ "$TYPE" = "desmume" ] && [ "$HAD_EXISTING_SAVE" = "0" ] && [ -f "$EMU_SAVE_PATH" ]; then
      rm -f "$EMU_SAVE_PATH" && echo "[pkmanager] Removed injected temporary save (first launch)." || echo "[WARN] Failed to clean injected temporary save."
    else
      echo "[pkmanager] No previous local save to restore."
    fi
  else
    echo "[WARN] Automatic sync failed"
    cat /tmp/pkmanager_sync.err 2>/dev/null || true
  fi
else
  echo "[WARN] Missing sync data, skipping automatic sync."
fi

echo "[pkmanager] Press Enter to close this window..."
read -r
`;

  return { fileName: `pkmanager_launch_${baseName}.sh`, scriptContent };
};

export const launchLocalSave = async (
  saveFileId: string,
  message: MessageInstance,
  fallbackName?: string,
) => {
  const isWin = navigator.platform?.toLowerCase().includes('win') ?? false;
  const isViteDev = window.location.port === '5173';
  const backendBase = isViteDev ? `http://${window.location.hostname}:5000` : window.location.origin;

  try {
    const tokenRes = await emulatorApi.createLaunchToken(saveFileId);
    const token = tokenRes.data.token;
    const protoUrl = `pkmanager://launch/${token}?backend=${encodeURIComponent(backendBase)}`;
    message.info(getI18nText('localLaunch.allowExternalApp', undefined, 'messages') || '如果浏览器提示打开外部应用，请点击允许');
    const supported = await detectProtocolSupport(protoUrl);
    if (supported) {
      message.success(getI18nText('localLaunch.launching', undefined, 'messages') || '正在启动模拟器...');
      return;
    }
  } catch {
    // fall through to script download
  }

  const res = await emulatorApi.launchLocal(saveFileId);
  const pkg = res.data as LaunchLocalResult;
  if (!pkg.romPath) {
    throw new Error(getI18nText('localLaunch.romPathMissing', undefined, 'messages') || 'Game content path was not found. Check the emulator data directory configuration.');
  }

  const { fileName, scriptContent } = isWin
    ? buildWindowsScript(pkg, backendBase, fallbackName)
    : buildPosixScript(pkg, backendBase, fallbackName);

  triggerDownload(scriptContent, fileName, isWin ? 'text/plain' : 'text/x-sh');
  message.info(
    getI18nText('localLaunch.scriptDownloaded', { fileName }, 'messages')
    || `No one-click launch protocol was detected. The launch script (${fileName}) was downloaded. Run it to inject the save, start the emulator, and sync automatically after exit.`,
    8,
  );
};
