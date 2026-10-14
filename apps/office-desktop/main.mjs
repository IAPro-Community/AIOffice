import { app, BrowserWindow, dialog, ipcMain, Menu, shell, utilityProcess } from 'electron';
// electron-updater 6.x is CommonJS; its ESM namespace does not expose autoUpdater as a named export.
import electronUpdater from 'electron-updater';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { accessSync, appendFileSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { externalUrl, isAllowedAppNavigation, isTrustedServerReady, validateDesktopRequest } from './security.mjs';
import { configuredServerPort, PortConflictError, portOwnerLabels, recoverOrphanedAIOfficePort } from './startup.mjs';
import { desktopPaths, desktopServerCwd, preserveLegacyData, preserveLegacyEnv, serverEnvironment } from './storage.mjs';
import { compareStableVersions, downloadVerifiedInstaller, fetchLatestAIOfficeRelease, verifyDownloadedInstaller } from './github-release-updater.mjs';
import { updateStrategy } from './update-policy.mjs';

const PRODUCT = 'AIOffice';
const SERVER_PORT_DEFAULT = 4747;
// Fresh installs may bootstrap the required Maestro package before the local HTTP listener opens.
const START_TIMEOUT_MS = 6 * 60_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const { autoUpdater } = electronUpdater;

const appData = app.getPath('appData');
app.setName(PRODUCT);
app.setPath('userData', join(appData, app.isPackaged ? PRODUCT : `${PRODUCT}-dev`));

let mainWindow;
let backend;
let backendExit;
let backendReady = false;
let backendLog = [];
let isStopping = false;
let quitAllowed = false;
let quitPromise;
let serverUrl;
let updateCheckPromise;
let updatePromptPromise;
let downloadedUpdate;
let dismissedUpdateVersion;
let manualCheckPending = false;
let updateTimer;
let logFile = join(app.getPath('userData'), 'aioffice.log');
let settingsFile;
let updateState = { state: 'idle', currentVersion: app.getVersion(), progress: 0 };

function readDesktopReleaseMetadata() {
  try {
    const pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
    return pkg.aiofficeRelease && typeof pkg.aiofficeRelease === 'object' ? pkg.aiofficeRelease : {};
  } catch {
    return {};
  }
}

const desktopReleaseMetadata = readDesktopReleaseMetadata();

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) app.quit();
else app.on('second-instance', () => {
  if (!mainWindow) {
    if (serverUrl) createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function writeLog(level, message) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${String(message).replace(/[\r\n\u0000-\u001f]+/g, ' ').slice(0, 2000)}\n`;
  backendLog.push(line.trimEnd());
  if (backendLog.length > 80) backendLog.shift();
  if (!logFile) return;
  try {
    if (existsSync(logFile) && statSync(logFile).size > LOG_MAX_BYTES) {
      const previous = `${logFile}.1`;
      try { renameSync(previous, `${previous}.old`); } catch { /* older log is optional */ }
      try { renameSync(logFile, previous); } catch { /* preserve current log if rotation is blocked */ }
    }
    appendFileSync(logFile, line, { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(logFile, 0o600); } catch { /* Windows permissions inherit from userData. */ }
  } catch (error) {
    console.error('AIOffice could not write its local diagnostic log.', error);
  }
}

function broadcastUpdateState(next) {
  updateState = { ...updateState, ...next, currentVersion: app.getVersion() };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('desktop:update-state', { ...updateState });
  }
}

function expectedPort() {
  return configuredServerPort(process.env.HABBLAUD_PORT, SERVER_PORT_DEFAULT);
}

function appFile(relativePath) {
  const appPath = app.getAppPath();
  const unpackedPath = join(`${appPath}.unpacked`, relativePath);
  return existsSync(unpackedPath) ? unpackedPath : join(appPath, relativePath);
}

function serviceEntrypoint() {
  return appFile(join('apps', 'office-web', 'dist', 'server', 'index.js'));
}

async function waitForServer(child, port) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  while (Date.now() < deadline) {
    if (backendExit) {
      if (backendLog.some((line) => line.includes(`A porta ${port} já está em uso`))) {
        throw new PortConflictError(port, [], 'race');
      }
      if (backendExit.error) throw new Error(`Não foi possível iniciar o processo do servidor local: ${backendExit.error.message}`);
      throw new Error(`O servidor local encerrou durante a inicialização (código ${backendExit.code}).`);
    }
    if (!backendReady) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    let health;
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
      health = response.ok ? await response.json() : undefined;
    } catch { /* The service can need a few seconds to initialize file watchers and native PTY support. */ }
    if (health?.ok === true) {
      if (health.version !== app.getVersion()) {
        throw new Error(`O servidor local respondeu com a versão ${String(health.version ?? 'desconhecida')}, mas o aplicativo instalado está na versão ${app.getVersion()}.`);
      }
      writeLog('info', `Local AIOffice services are ready on 127.0.0.1:${port}.`);
      return `http://127.0.0.1:${port}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`O servidor local não respondeu em ${START_TIMEOUT_MS / 1000} segundos.`);
}

async function startLocalServices(paths) {
  const entrypoint = serviceEntrypoint();
  if (!existsSync(entrypoint)) throw new Error('O servidor empacotado não foi encontrado. Recompile com npm run build:office.');

  backendExit = undefined;
  backendReady = false;
  backendLog = [];
  const port = expectedPort();
  const recovery = await recoverOrphanedAIOfficePort({
    port,
    executablePath: process.execPath,
    userDataDir: paths.userData,
  });
  if (recovery.state === 'recovered') {
    writeLog('warn', `Recovered port ${port} from an AIOffice service process: ${portOwnerLabels(recovery.owners).join(', ')}; shutdown via ${recovery.shutdownMethod}.`);
  } else if (recovery.state === 'inspection-failed') {
    writeLog('warn', `Could not inspect port ${port} before startup: ${recovery.error instanceof Error ? recovery.error.message : String(recovery.error)}`);
  } else if (recovery.state !== 'free') {
    const reason = recovery.state === 'active-sessions' ? 'active-sessions' : recovery.state === 'stop-failed' ? 'stop-failed' : 'occupied';
    throw new PortConflictError(port, recovery.owners ?? [], reason);
  }
  const startupNonce = randomBytes(32).toString('hex');
  const updateShutdownNonce = randomBytes(32).toString('hex');
  const childEnvironment = serverEnvironment(paths, {
    ...process.env,
    AIOFFICE_STARTUP_NONCE: startupNonce,
    AIOFFICE_UPDATE_NONCE: updateShutdownNonce,
  });
  backend = utilityProcess.fork(appFile(join('apps', 'office-desktop', 'service.mjs')), [entrypoint], {
    cwd: desktopServerCwd(paths, { packaged: app.isPackaged, appPath: app.getAppPath() }),
    env: childEnvironment,
    serviceName: 'AIOffice Local Services',
    stdio: 'pipe',
  });
  backend.stdout?.on('data', (chunk) => writeLog('info', `[server] ${chunk.toString('utf8')}`));
  backend.stderr?.on('data', (chunk) => writeLog('error', `[server] ${chunk.toString('utf8')}`));
  backend.on('error', (type, location) => {
    const error = new Error(`${String(type || 'Falha do processo local')}${location ? `: ${location}` : ''}`);
    backendExit = { ...backendExit, error };
    writeLog('error', `Local service process error: ${error.message}`);
  });
  backend.on('message', (message) => {
    if (isTrustedServerReady(message, startupNonce, app.getVersion())) {
      backendReady = true;
      writeLog('info', 'Received the trusted local server startup handshake.');
    } else if (message?.type === 'aioffice-server-ready') {
      writeLog('warn', `Rejected local server startup handshake with version ${String(message.version ?? 'unknown').slice(0, 32)}.`);
    }
  });
  backend.on('exit', (code) => {
    backendExit = { ...backendExit, code };
    writeLog(code === 0 ? 'info' : 'error', `Local service process exited with code ${code}.`);
    if (!isStopping && serverUrl) {
      isStopping = true;
      dialog.showErrorBox(PRODUCT, `Os serviços locais foram encerrados inesperadamente. Consulte ${logFile} para ver o diagnóstico.`);
      app.quit();
    }
  });
  serverUrl = await waitForServer(backend, port);
  return serverUrl;
}

async function stopLocalServices() {
  if (!backend || backendExit) return;
  isStopping = true;
  const child = backend;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      writeLog('warn', 'Local server did not finish shutdown in time; terminating its utility process.');
      child.kill();
    }, SHUTDOWN_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.postMessage({ type: 'shutdown' });
  });
  backend = undefined;
}

function showStartupError(error) {
  writeLog('error', `Application startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  const serverDetail = backendLog.slice(-25).join('\n');
  let message = error instanceof Error ? error.message : 'Não foi possível iniciar os serviços locais.';
  let guidance = `O arquivo de diagnóstico fica em:\n${logFile}`;
  if (error instanceof PortConflictError) {
    const owners = portOwnerLabels(error.owners);
    if (error.reason === 'active-sessions') {
      message = `A porta ${error.port} está ocupada por uma instância do AIOffice com sessões interativas abertas.`;
      guidance = 'Feche as sessões interativas nessa instância e abra o AIOffice novamente. Por segurança, a inicialização não encerrou processos com sessões ativas.';
    } else if (error.reason === 'stop-failed') {
      message = `A instância anterior do AIOffice não conseguiu liberar a porta ${error.port}.`;
      guidance = 'Feche essa instância pelo próprio AIOffice e tente abrir novamente.';
    } else {
      message = owners.length
        ? `A porta ${error.port} está ocupada por ${owners.join(', ')}.`
        : `Outro processo ocupou a porta ${error.port} durante a inicialização.`;
      guidance = owners.length
        ? `Feche o programa indicado ou escolha uma porta livre definindo HABBLAUD_PORT no arquivo de configuração (${settingsFile || 'pasta de dados do AIOffice'}). O AIOffice só encerra automaticamente serviços próprios identificados com segurança.`
        : `Feche o processo que ocupou a porta ou defina HABBLAUD_PORT no arquivo de configuração (${settingsFile || 'pasta de dados do AIOffice'}). No Windows, o PID pode ser consultado com netstat -ano.`;
    }
  } else if (serverDetail.includes('AIOffice não iniciou: o Orquestrador-Maestro é obrigatório')) {
    message = 'Não foi possível instalar ou validar o Orquestrador-Maestro.';
    guidance = 'Confira sua conexão com a internet e o espaço disponível. Se o erro continuar, abra os logs e envie o trecho do primeiro erro ao suporte.';
  } else if (message.includes('servidor empacotado não foi encontrado') || message.includes('ENOENT') || serverDetail.includes('MODULE_NOT_FOUND')) {
    message = 'A instalação do AIOffice está incompleta ou faltam arquivos do servidor.';
    guidance = 'Baixe novamente o instalador oficial mais recente e instale por cima da versão atual. Seus dados ficam na pasta do usuário.';
  } else if (/EACCES|EPERM/.test(message) || /EACCES|EPERM/.test(serverDetail)) {
    message = 'O sistema impediu o início de um componente local do AIOffice.';
    guidance = 'Confira as permissões do sistema e se algum software de segurança bloqueou arquivos da instalação. Reinstale pelo setup oficial se o erro persistir.';
  } else if (message.includes('não respondeu em')) {
    message = 'O servidor local demorou demais para iniciar.';
    guidance = 'A primeira inicialização pode instalar componentes necessários. Aguarde e tente novamente; se persistir, confira o log para identificar o passo que parou.';
  } else if (message.includes('respondeu com a versão')) {
    message = 'Os arquivos do servidor e do aplicativo estão em versões diferentes.';
    guidance = 'Feche o AIOffice, baixe o instalador estável mais recente e instale por cima da versão atual. Seus dados ficam na pasta do usuário.';
  } else if (message.includes('HABBLAUD_PORT não é válida')) {
    guidance = 'Corrija HABBLAUD_PORT no arquivo de configuração ou remova essa definição para usar a porta padrão 4747.';
  }
  let portHint;
  try { portHint = String(expectedPort()); }
  catch { portHint = `valor inválido em HABBLAUD_PORT (${String(process.env.HABBLAUD_PORT ?? '').slice(0, 32)})`; }
  const detail = `${guidance}\n\nO arquivo de diagnóstico fica em:\n${logFile}${serverDetail ? `\n\nÚltimas mensagens do servidor:\n${serverDetail}` : ''}`;
  void dialog.showMessageBox({
    type: 'error',
    title: `${PRODUCT} não iniciou`,
    message,
    detail: `Porta configurada: ${portHint}.\n\n${detail}`,
    buttons: ['Abrir pasta de logs', 'Fechar'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => {
    if (response === 0) void shell.openPath(dirname(logFile));
    app.quit();
  });
}

function installWindowGuards(window) {
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedAppNavigation(url, serverUrl)) {
      const safeUrl = externalUrl(url);
      if (safeUrl) void shell.openExternal(safeUrl);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url, serverUrl)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAllowedAppNavigation(url, serverUrl)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 800,
    minHeight: 620,
    show: false,
    title: PRODUCT,
    backgroundColor: '#17182b',
    webPreferences: {
      preload: appFile(join('apps', 'office-desktop', 'preload.cjs')),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged && process.env.AIOFFICE_DEVTOOLS === '1',
    },
  });
  const window = mainWindow;
  installWindowGuards(window);
  window.once('ready-to-show', () => {
    writeLog('info', 'Desktop window is ready to show.');
    window.show();
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    writeLog('error', `Could not load the local interface (code ${errorCode}): ${errorDescription}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog('error', `Desktop renderer exited: ${details.reason} (code ${details.exitCode}).`);
    if (window.isDestroyed()) return;
    window.show();
    void dialog.showMessageBox(window, {
      type: 'error',
      title: `${PRODUCT} não carregou`,
      message: 'A janela do AIOffice perdeu o processo que exibe a interface.',
      detail: `O arquivo de diagnóstico fica em:\n${logFile}`,
      buttons: ['Abrir pasta de logs', 'Fechar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) void shell.openPath(dirname(logFile));
      app.quit();
    });
  });
  window.on('closed', () => { mainWindow = undefined; });
  void window.loadURL(serverUrl).catch((error) => {
    writeLog('error', `Could not load the local interface: ${error instanceof Error ? error.message : String(error)}`);
    if (window.isDestroyed()) return;
    window.show();
    void dialog.showMessageBox(window, {
      type: 'error',
      title: `${PRODUCT} não carregou`,
      message: 'O servidor local iniciou, mas a interface não pôde ser aberta.',
      detail: `Abra os logs para ver o diagnóstico:\n${logFile}`,
      buttons: ['Abrir pasta de logs', 'Fechar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) void shell.openPath(dirname(logFile));
      app.quit();
    });
  });
  return mainWindow;
}

function assertTrustedRequest(event) {
  if (!serverUrl || !mainWindow || !validateDesktopRequest(event, serverUrl, mainWindow.webContents.mainFrame)) {
    throw new Error('Ação desktop recusada: a solicitação não veio da janela local principal.');
  }
}

function setupIpc() {
  ipcMain.handle('desktop:get-status', async (event) => {
    assertTrustedRequest(event);
    let server = { available: false };
    try {
      const response = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) server = { available: true, ...(await response.json()) };
    } catch { /* Diagnostics report the unavailable local service without exposing environment values. */ }
    return { appVersion: app.getVersion(), server, logFile };
  });
  ipcMain.handle('desktop:check-updates', async (event) => {
    assertTrustedRequest(event);
    return checkForUpdates(true);
  });
  ipcMain.handle('desktop:get-update-state', (event) => {
    assertTrustedRequest(event);
    return { ...updateState };
  });
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  broadcastUpdateState({ state: 'downloading', progress: value });
  mainWindow?.setProgressBar(value / 100, { mode: 'normal' });
}

async function promptToDownload(info, { manual = false } = {}) {
  if (!manual && dismissedUpdateVersion === info.version) return;
  if (downloadedUpdate?.version === info.version && await verifyDownloadedInstaller(downloadedUpdate)) {
    return promptToInstall(downloadedUpdate);
  }
  if (updatePromptPromise) return updatePromptPromise;
  const prompt = (async () => {
    broadcastUpdateState({ state: 'available', latestVersion: info.version, releaseUrl: info.releaseUrl, progress: 0 });
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualização do AIOffice',
      message: `A versão ${info.version} está disponível.`,
      detail: 'O AIOffice vai baixar o instalador em segundo plano, conferir o tamanho e o SHA-256 publicado pela release oficial e pedir sua confirmação antes de abrir a instalação.',
      buttons: ['Baixar atualização', 'Mais tarde'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) {
      dismissedUpdateVersion = info.version;
      broadcastUpdateState({ state: 'available', latestVersion: info.version, releaseUrl: info.releaseUrl, progress: 0 });
      return;
    }
    broadcastUpdateState({ state: 'downloading', latestVersion: info.version, releaseUrl: info.releaseUrl, progress: 0 });
    try {
      const strategy = updateStrategy({ packaged: app.isPackaged, platform: process.platform, env: process.env, release: desktopReleaseMetadata });
      if (strategy.mode === 'github-installer') {
        downloadedUpdate = await downloadVerifiedInstaller(info, join(app.getPath('userData'), 'updates'), fetch, setProgress);
        broadcastUpdateState({ state: 'downloaded', latestVersion: info.version, releaseUrl: info.releaseUrl, progress: 100 });
        await promptToInstall(downloadedUpdate);
      } else {
        await autoUpdater.downloadUpdate();
      }
    } catch (error) {
      writeLog('error', `Update download failed: ${error instanceof Error ? error.message : String(error)}`);
      broadcastUpdateState({ state: 'error', latestVersion: info.version, message: 'Falha no download ou na validação da atualização.' });
      await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Atualização do AIOffice', message: 'Não foi possível baixar ou validar a atualização.', detail: 'Seus dados e a versão instalada não foram alterados.', buttons: ['Fechar'], noLink: true });
    }
  })();
  updatePromptPromise = prompt.finally(() => { updatePromptPromise = undefined; });
  return updatePromptPromise;
}

function launchInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(installerPath, [], { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function promptToInstall(info) {
  mainWindow?.setProgressBar(-1);
  broadcastUpdateState({ state: 'downloaded', latestVersion: info.version, progress: 100 });
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização pronta',
    message: `A versão ${info.version} foi baixada e validada.`,
    detail: info.path
      ? 'Instalar agora fecha o servidor local e abre o instalador oficial do AIOffice. Ele preserva seus dados e configurações; confirme as etapas no instalador para concluir.'
      : 'Instalar agora fecha as sessões abertas no AIOffice e reinicia o aplicativo. Outros terminais de agentes continuam sob o controle de suas ferramentas.',
    buttons: ['Instalar e reiniciar', 'Mais tarde'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) {
    dismissedUpdateVersion = info.version;
    return;
  }
  dismissedUpdateVersion = undefined;
  if (response === 0) {
    if (info.path) {
      if (!(await verifyDownloadedInstaller(info))) {
        downloadedUpdate = undefined;
        broadcastUpdateState({ state: 'error', latestVersion: info.version, message: 'A cópia baixada mudou depois da validação. Baixe a atualização novamente.' });
        return;
      }
      try {
        await launchInstaller(info.path);
        broadcastUpdateState({ state: 'installing', latestVersion: info.version, releaseUrl: info.releaseUrl, progress: 100 });
        await stopLocalServices();
        quitAllowed = true;
        app.quit();
      } catch (error) {
        writeLog('error', `Could not start the verified update installer: ${error instanceof Error ? error.message : String(error)}`);
        broadcastUpdateState({ state: 'error', latestVersion: info.version, message: 'Não foi possível abrir o instalador. O AIOffice continua disponível.' });
        await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Atualização do AIOffice', message: 'Não foi possível abrir o instalador.', detail: 'O AIOffice continua disponível e seus dados não foram alterados.', buttons: ['Fechar'], noLink: true });
      }
      return;
    }
    await stopLocalServices();
    quitAllowed = true;
    autoUpdater.quitAndInstall(false, true);
  }
}

async function checkForUpdates(manual = false) {
  const strategy = updateStrategy({ packaged: app.isPackaged, platform: process.platform, env: process.env, release: desktopReleaseMetadata });
  if (strategy.mode === 'disabled') {
    if (manual && strategy.reason === 'unsigned-build') {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualizações do AIOffice',
        message: 'Esta versão do macOS não recebe atualizações automáticas porque não tem assinatura Apple.',
        detail: 'Baixe manualmente a versão mais recente na página oficial de releases do AIOffice.',
        buttons: ['Abrir GitHub Releases', 'Fechar'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) void shell.openExternal('https://github.com/IAPro-Community/AIOffice/releases/latest');
    }
    return { ok: false, reason: strategy.reason };
  }
  if (strategy.mode === 'manual') {
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualizações do AIOffice',
        message: 'Instalações DEB são atualizadas pelo gerenciador de pacotes do sistema.',
        detail: 'Baixe a versão DEB mais recente em GitHub Releases e instale-a com a ferramenta de pacotes da sua distribuição. Os dados do AIOffice ficam preservados em sua pasta de usuário.',
        buttons: ['Abrir GitHub Releases', 'Fechar'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }).then(({ response }) => { if (response === 0) void shell.openExternal('https://github.com/IAPro-Community/AIOffice/releases/latest'); });
    }
    return { ok: false, reason: 'use-system-package-manager' };
  }
  if (updateCheckPromise) return updateCheckPromise;
  if (strategy.mode === 'github-installer') {
    updateCheckPromise = (async () => {
      broadcastUpdateState({ state: 'checking', message: undefined });
      try {
        const release = await fetchLatestAIOfficeRelease();
        const comparison = compareStableVersions(release.version, app.getVersion());
        const available = comparison > 0;
        if (available) {
          broadcastUpdateState({ state: 'available', latestVersion: release.version, releaseUrl: release.releaseUrl, progress: 0, message: undefined });
          void promptToDownload(release, { manual });
        } else {
          const state = comparison < 0 ? 'ahead' : 'current';
          broadcastUpdateState({ state, latestVersion: release.version, releaseUrl: release.releaseUrl, progress: 0, message: undefined });
          if (manual) await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Atualizações', message: state === 'ahead' ? `Esta compilação (${app.getVersion()}) está à frente da última release pública (${release.version}).` : 'Você está usando a versão estável mais recente do AIOffice.', buttons: ['Fechar'], noLink: true });
        }
        return { ok: true, available, version: release.version };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeLog('warn', `Stable GitHub release check failed: ${message}`);
        broadcastUpdateState({ state: 'error', message: 'Não foi possível consultar a release oficial do AIOffice.' });
        if (manual) await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Atualizações', message: 'Não foi possível consultar a release oficial do AIOffice.', detail: message, buttons: ['Fechar'], noLink: true });
        return { ok: false, reason: 'update-check-failed' };
      }
    })().finally(() => { updateCheckPromise = undefined; });
    return updateCheckPromise;
  }
  manualCheckPending = manual;
  updateCheckPromise = autoUpdater.checkForUpdates()
    .then((result) => ({ ok: true, available: !!result?.isUpdateAvailable, version: result?.updateInfo?.version }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      writeLog('warn', `Stable release check failed: ${message}`);
      broadcastUpdateState({ state: 'error', message: 'Não foi possível consultar o canal de atualizações.' });
      manualCheckPending = false;
      return { ok: false, reason: 'update-check-failed' };
    })
    .finally(() => { updateCheckPromise = undefined; });
  return updateCheckPromise;
}

function setupUpdater() {
  const strategy = updateStrategy({ packaged: app.isPackaged, platform: process.platform, env: process.env, release: desktopReleaseMetadata });
  if (strategy.mode === 'disabled') {
    broadcastUpdateState({ state: 'disabled', message: strategy.reason === 'updates-disabled-by-configuration' ? 'As atualizações automáticas foram desativadas nas configurações.' : 'Esta compilação não consulta releases automaticamente.' });
    return;
  }
  if (strategy.mode === 'manual') {
    broadcastUpdateState({ state: 'manual', message: 'Instalações DEB são atualizadas pelo gerenciador de pacotes do sistema.' });
    return;
  }
  if (strategy.mode === 'github-installer') {
    broadcastUpdateState({ state: 'idle', message: undefined });
    updateTimer = setInterval(() => { void checkForUpdates(); }, 6 * 60 * 60 * 1000);
    updateTimer.unref();
    setTimeout(() => { void checkForUpdates(); }, 7_000).unref();
    return;
  }
  if (strategy.mode !== 'automatic') return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.channel = 'latest';
  autoUpdater.logger = {
    info: (message) => writeLog('info', `[updater] ${message}`),
    warn: (message) => writeLog('warn', `[updater] ${message}`),
    error: (message) => writeLog('error', `[updater] ${message}`),
    debug: (message) => writeLog('info', `[updater] ${message}`),
  };
  autoUpdater.on('checking-for-update', () => broadcastUpdateState({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    const manual = manualCheckPending;
    manualCheckPending = false;
    void promptToDownload(info, { manual });
  });
  autoUpdater.on('update-not-available', (info) => {
    broadcastUpdateState({ state: 'current', latestVersion: info.version, progress: 0 });
    if (manualCheckPending) void dialog.showMessageBox(mainWindow, { type: 'info', title: 'Atualizações', message: 'Você está usando a versão estável mais recente do AIOffice.', buttons: ['Fechar'], noLink: true });
    manualCheckPending = false;
  });
  autoUpdater.on('download-progress', (progress) => setProgress(progress.percent));
  autoUpdater.on('update-downloaded', (info) => { void promptToInstall(info); });
  autoUpdater.on('error', (error) => {
    writeLog('error', `Automatic updater failed: ${error.message}`);
    mainWindow?.setProgressBar(-1);
    broadcastUpdateState({ state: 'error', message: 'A atualização não pôde ser instalada.' });
    if (manualCheckPending) void dialog.showMessageBox(mainWindow, { type: 'error', title: 'Atualizações', message: 'A atualização falhou. A versão instalada continua disponível.', detail: error.message, buttons: ['Fechar'], noLink: true });
    manualCheckPending = false;
  });
  updateTimer = setInterval(() => { void checkForUpdates(); }, 6 * 60 * 60 * 1000);
  updateTimer.unref();
  setTimeout(() => { void checkForUpdates(); }, 7_000).unref();
}

async function checkTool(executable) {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(directory, `${executable}${extension}`);
      try {
        if (!existsSync(candidate)) continue;
        if (process.platform !== 'win32') accessSync(candidate, constants.X_OK);
        return candidate;
      } catch { /* Keep looking through PATH without launching any command. */ }
    }
  }
  return undefined;
}

async function showDiagnostics() {
  const [claude, codex] = await Promise.all([checkTool('claude'), checkTool('codex')]);
  const ompSessions = existsSync(join(homedir(), '.omp', 'agent', 'sessions'));
  const cliLines = [
    `Claude Code: ${claude ?? 'não detectado'}`,
    `Codex CLI: ${codex ?? 'não detectado'}`,
    `Sessões do oh-my-pi (OMP): ${ompSessions ? 'pasta encontrada' : 'pasta não encontrada'}`,
  ];
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Diagnóstico do AIOffice',
    message: `AIOffice ${app.getVersion()} · servidor local ${serverUrl ? 'disponível' : 'indisponível'}`,
    detail: `${cliLines.join('\n')}\n\nO runtime Node está incluído. CLIs precisam ser instaladas e autenticadas separadamente. A disponibilidade no PATH não confirma login.\nLog local: ${logFile}`,
    buttons: ['Abrir pasta de logs', 'Fechar'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => { if (response === 0) void shell.openPath(dirname(logFile)); });
}

function installApplicationMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ label: PRODUCT, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Arquivo', submenu: [{ role: 'close' }, ...(process.platform === 'darwin' ? [] : [{ role: 'quit' }])] },
    { label: 'Ajuda', submenu: [
      { label: 'Verificar atualizações…', click: () => { void checkForUpdates(true); } },
      { label: 'Diagnóstico…', click: () => { void showDiagnostics(); } },
      { label: 'Abrir pasta de logs', click: () => { void shell.openPath(dirname(logFile)); } },
      { type: 'separator' },
      { label: 'Site do AIOffice', click: () => { void shell.openExternal('https://github.com/IAPro-Community/AIOffice'); } },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startDesktop() {
  if (!hasSingleInstance) return;
  app.whenReady().then(async () => {
    app.setAppUserModelId('community.iapro.aioffice');
    const paths = desktopPaths({
      userDataDir: app.getPath('userData'),
      homeDir: homedir(),
      legacyAppEnv: join(app.getAppPath(), 'apps', 'office-web', '.env'),
    });
    mkdirSync(paths.userData, { recursive: true, mode: 0o700 });
    logFile = paths.logFile;
    settingsFile = paths.envFile;
    const legacyState = preserveLegacyData(paths.dataDir, paths.legacyDataDirs);
    const legacyEnv = preserveLegacyEnv(paths.envFile, paths.legacyEnvFiles);
    if (legacyState) writeLog('info', `Copied legacy Habblaud data to application storage; original remains at ${legacyState}.`);
    if (legacyEnv) writeLog('info', `Copied legacy environment configuration to application storage; original remains at ${legacyEnv}.`);
    try { process.loadEnvFile(paths.envFile); }
    catch (error) { if (error?.code !== 'ENOENT') writeLog('warn', `Could not load local configuration: ${error.message}`); }
    const serverEnv = serverEnvironment(paths);
    const npmCli = app.isPackaged
      ? join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js')
      : process.env.AIOFFICE_NPM_CLI || process.env.npm_execpath;
    if (npmCli) serverEnv.AIOFFICE_NPM_CLI = npmCli;
    for (const [key, value] of Object.entries(serverEnv)) process.env[key] = value;
    writeLog('info', `Starting ${PRODUCT} ${app.getVersion()} (${app.isPackaged ? 'installed' : 'development'}).`);
    installApplicationMenu();
    setupIpc();
    try {
      await startLocalServices(paths);
      createMainWindow();
      setupUpdater();
      app.on('activate', () => { if (!mainWindow) createMainWindow(); });
    } catch (error) {
      showStartupError(error);
    }
  }).catch((error) => showStartupError(error));
}

app.on('before-quit', (event) => {
  if (quitAllowed) return;
  event.preventDefault();
  if (quitPromise) return;
  quitPromise = (async () => {
    clearInterval(updateTimer);
    await stopLocalServices();
    quitAllowed = true;
    app.quit();
  })().catch((error) => {
    writeLog('error', `Shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    quitAllowed = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

startDesktop();
