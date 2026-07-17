import type { MessageInstance } from 'antd/es/message/interface';
import { emulatorApi, type LaunchLocalResult } from '../api/saveFile';
import { buildLinuxScript } from './linuxLauncherScript';
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
    : buildLinuxScript(pkg, backendBase, fallbackName);

  triggerDownload(scriptContent, fileName, isWin ? 'text/plain' : 'text/x-sh');
  message.info(
    getI18nText('localLaunch.scriptDownloaded', { fileName }, 'messages')
    || `No one-click launch protocol was detected. The launch script (${fileName}) was downloaded. Run it to inject the save, start the emulator, and sync automatically after exit.`,
    8,
  );
};
