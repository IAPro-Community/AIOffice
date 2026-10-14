// Servidor do Habblaud: observa as sessões abertas do Claude Code (todas as contas),
// mantém o modelo do escritório e transmite via SSE. Sem dependências de runtime.
//   npm run dev    -> tsx server/index.ts --dev (Vite em middleware mode, HMR no mesmo servidor)
//   npm start      -> node dist/server/index.js (serve dist/client)
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { codexDirsRefused, isDefaultDir } from './accounts/detect';
import { AccountsService } from './accounts/service';
import { isTruthy, loadConfig, messagesOffReason, terminalOffReason } from './config';
import { createApiHandler, sendJson } from './http/app';
import { createRequestGuard } from './http/guard';
import { Hub } from './http/sse';
import { createStaticHandler } from './http/static';
import { TerminalStreams } from './http/terminal';
import { createTimelineHandler } from './http/timeline';
import { TIMELINE_DIR, TimelineRecorder } from './history/timeline';
import { DayStatsService } from './history/daystats';
import { describeStateMigration, legacyEnvWarning, migrateLegacyStateDir } from './legacy';
import { errMsg, log } from './log';
import { NameStore } from './model/names';
import { Office } from './model/office';
import { RoomAliases } from './model/room-aliases';
import { createPtyRoutes } from './http/pty';
import { claudeBinFrom, isExecutableFile, loadPty, PtyManager, type ScreenFactory, type SpawnPty } from './pty/manager';
import { loadHeadlessScreen } from './pty/screen';
import { openMainAgent, SessionHistory } from './sources/history';
import { HistorySet, SourceSet } from './sources/source';
import { createPermissionRoutes } from './permissions/http';
import { PermissionRegistry } from './permissions/registry';
import { codexAccountOf } from './codex/http';
import { createCodexQueueRunner, findCodexBin } from './messages/codex';
import { createMessageRoutes } from './messages/http';
import { MessageRegistry } from './messages/registry';
import type { CodexLive } from './sources/codex/live';
import { ClaudeWatcher } from './sources/watcher';
import { discoverCodexDirs } from './sources/codex/accounts';
import { CodexHistory } from './sources/codex/history';
import { CodexSource } from './sources/codex/source';
import { OmpSource } from './sources/omp/source';
import { OmpHistory } from './sources/omp/history';
import { createBuildReader } from './build';
import { UpdateChecker } from './updates/checker';
import { UpdateInstaller } from './updates/installer';
import { MaestroUpdateManager } from './updates/maestro';
import { RemoteAccessRuntime } from './remote/runtime';
import { ensureMessagesPluginInstalled, makeAsyncClaudeRunner, readPackageVersion } from '../scripts/mod-install';
import { tr } from '../shared/i18n';

const config = loadConfig();
const execFileAsync = promisify(execFile);
try {
  const maestroEnv: NodeJS.ProcessEnv = { ...process.env, HOME: config.home };
  if (process.versions.electron) maestroEnv.ELECTRON_RUN_AS_NODE = '1';
  const { stdout } = await execFileAsync(process.execPath, [join(config.rootDir, 'scripts/maestro.mjs'), 'ensure'], {
    cwd: config.rootDir,
    env: maestroEnv,
    timeout: 5 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  const maestro = JSON.parse(stdout.trim()) as { installed?: unknown; installedVersion?: unknown; verified?: unknown };
  if (maestro.installed !== true || maestro.verified !== true) throw new Error('A verificação da camada do Orquestrador-Maestro não foi confirmada.');
  log.info(tr('Orquestrador-Maestro {0} instalado e verificado.', [typeof maestro.installedVersion === 'string' ? maestro.installedVersion : '']));
} catch (error) {
  const detail = errMsg(error).replaceAll(config.home, '~').slice(0, 1_000);
  log.error(tr('AIOffice não iniciou: o Orquestrador-Maestro é obrigatório e não pôde ser instalado/verificado. {0}', [detail]));
  throw error;
}
const startedAt = Date.now();
// Host temporário aceito somente pela porta HTTPS dedicada, nunca pelo servidor local principal.
const remoteAllowedHosts = new Set<string>();
let activeTunnelHost: string | undefined;

// Nome antigo (CodeTown, até a 0.3.2): leva ~/.codetown para ~/.habblaud antes de ler qualquer estado e avisa
// das variáveis CODETOWN_* que não valem mais. No Docker, quem migra é o docker:up.
if (!config.inDocker) {
  const r = migrateLegacyStateDir(config.home);
  const msg = describeStateMigration(r);
  if (msg) (r.error ? log.warn : log.info)(msg);
}
const legacyEnv = legacyEnvWarning(Object.keys(process.env));
if (legacyEnv) log.warn(legacyEnv);

const names = new NameStore(join(config.dataDir, 'names.json'));
names.load();
// Nomes de sala escolhidos pelo usuário (botão direito > Renomear).
const roomAliases = new RoomAliases(join(config.dataDir, 'rooms.json'));
roomAliases.load();

// Office, contas e fontes de agentes se referenciam (avisos de mudança / fontes): ligação tardia.
const late: { office?: Office; agents?: SourceSet; permissions?: PermissionRegistry; messages?: MessageRegistry; ptys?: PtyManager; ptyOff?: string } = {};
let updateInstaller: UpdateInstaller | undefined;
let updateShutdownRequested = false;
const remoteAccess = new RemoteAccessRuntime({
  config,
  onRequest: (req, res) => handleRequest(req, res, true),
  onChange: () => late.office?.markDirty(),
  onTunnelHost: (host) => {
    if (activeTunnelHost) remoteAllowedHosts.delete(activeTunnelHost);
    activeTunnelHost = host;
    if (host) remoteAllowedHosts.add(host);
  },
  log,
});
// Versão do AIOffice: consulta somente o repositório oficial do produto a cada 6 h.
const updates = new UpdateChecker({
  current: config.version,
  repo: config.repo,
  enabled: config.updateCheck,
  file: join(config.dataDir, 'updates.json'),
  onChange: () => late.office?.markDirty(),
});
updates.load();
const maestroUpdates = new MaestroUpdateManager({
  rootDir: config.rootDir,
  home: config.home,
  onChange: () => late.office?.markDirty(),
});
const accounts = new AccountsService({
  dirs: config.claudeDirs,
  home: config.home,
  env: process.env,
  usageDir: config.usageDir,
  onChange: () => late.office?.markDirty(),
});
const office = new Office({
  names,
  roomAlias: (path) => roomAliases.get(path),
  version: config.version,
  // No modo dev o Vite serve o cliente direto do código-fonte: não há build para comparar.
  build: config.dev ? undefined : createBuildReader(config.rootDir),
  startedAt,
  accounts: (sessions) => accounts.list(sessions),
  sources: () => late.agents?.sources() ?? [],
  accountName: (id) => accounts.find(id)?.detected.name,
  terminal: config.terminal,
  permissions: () => late.permissions?.snapshot() ?? new Map(),
  messages: config.messages ? () => late.messages?.reachable() ?? new Set() : undefined,
  ptys: () => (late.ptys ? { status: late.ptys.status(), list: late.ptys.list() } : { status: { enabled: false, reason: late.ptyOff ?? tr('desligado') }, list: [] }),
  updates: () => ({ ...updates.status(), installation: updateInstaller?.status() }),
  maestro: () => maestroUpdates.status(),
  remoteAccess: () => remoteAccess.status(),
});
// Fontes de agentes, uma por ferramenta (sources/source.ts): a do Claude Code e, depois dela, a do Codex (quando há
// pastas do Codex; HABBLAUD_CODEX=0 desliga), com o histórico dela no HistorySet abaixo e as contas registradas por
// ela mesma (accounts.setProviderAccounts). `codex` também recebe os eventos dos hooks do Codex (CodexLive).
const claude = new ClaudeWatcher({ accounts, office, inDocker: config.inDocker });
const agents = new SourceSet([claude]);
const codexDirs = config.codex ? discoverCodexDirs(process.env, config.home) : [];
const codex = codexDirs.length ? new CodexSource({ accounts, office, dirs: codexDirs, env: process.env, home: config.home }) : undefined;
if (codex) agents.add(codex);
const omp = new OmpSource(office, accounts);
agents.add(omp);
omp.start();
// (CodexLive); sem ela (nenhuma pasta do Codex ou HABBLAUD_CODEX=0) a rota responde {ok: false}.
const codexLive: CodexLive | undefined = codex;
late.office = office;
late.agents = agents;
const hub = new Hub(office);
// "Meu dia": amostra o escritório a cada segundo e persiste em <dataDir>/stats/ (ver history/daystats.ts).
const stats = new DayStatsService({ dir: join(config.dataDir, 'stats'), snapshot: () => hub.current() });
stats.load();
// Terminal: só existe com bind local (ver terminalOffReason em config.ts).
// Cada agente com o parser da ferramenta dele (o do Claude Code por padrão).
const terminals = config.terminal
  ? new TerminalStreams({ office, transcriptPathOf: (id) => agents.transcriptPathOf(id), parserFor: (id) => agents.parserFor(id) })
  : undefined;
// Histórico do terminal (sessões recentes, abertas ou encerradas, de todas as ferramentas): mesma trava.
const history = config.terminal
  ? new HistorySet([new SessionHistory({ accounts: () => accounts.entries(), openAgentOf: (acc, sid) => openMainAgent(office.list(), acc, sid) })])
  : undefined;
if (history && codex) history.add(new CodexHistory({ accounts: () => accounts.entriesOf('codex'), openAgentOf: (acc, sid) => openMainAgent(office.list(), acc, sid) }));
if (history) history.add(new OmpHistory({ account: omp.accountId, sessionsDir: omp.sessionsDir, openAgentOf: (acc, sid) => openMainAgent(office.list(), acc, sid) }));
// Linha do tempo do timelapse: grava cada snapshot novo (com throttle) em <dataDir>/timeline.
const timelineDir = join(config.dataDir, TIMELINE_DIR);
const timeline = config.timeline ? new TimelineRecorder({ dir: timelineDir }) : undefined;
if (timeline) hub.onSnapshot((snap) => timeline.ingest(snap));
// Responder pelo escritório (hook PermissionRequest): age sobre as sessões, então segue a mesma trava.
const permissions = config.terminal
  ? new PermissionRegistry({
      office,
      viewers: () => hub.permissionViewerSize,
      // Só o Claude Code: a busca da resposta dada no terminal lê o formato do transcript dele.
      transcriptPathOf: (id) => claude.transcriptPathOf(id),
      // Pedidos do hook do Codex: a conta pela pasta CODEX_HOME que ele manda.
      codexAccount: (account, codexHome) => codexAccountOf(accounts.entriesOf('codex'), account, codexHome),
      demoDecide: (id, d) => office.decideDemoPermission(id, d),
      demoDetail: (id) => office.demoPermission(id),
    })
  : undefined;
late.permissions = permissions;
// Mensagens pelo escritório (plugin habblaud-mensagens): entram na sessão como se você as tivesse digitado, então
// seguem a mesma trava (e HABBLAUD_MENSAGENS=0 desliga só elas). Ao Codex vão por `codex queue` (messages/codex.ts):
// fora do Docker o próprio servidor roda o comando (HABBLAUD_CODEX_BIN ou `codex` do PATH); no Docker, o auxiliar do
// host (npm run codex:bridge).
const codexBin = config.messages && !config.inDocker ? findCodexBin(process.env) : undefined;
const messages = config.messages
  ? new MessageRegistry({
      office,
      demoAgent: (id) => office.demoAgent(id),
      demoDeliver: (id, text) => office.deliverDemoMessage(id, text),
      codex: {
        run: codexBin ? createCodexQueueRunner(codexBin) : undefined,
        homeOf: (account) => accounts.entriesOf('codex').find((e) => e.id === account)?.detected.configDir,
      },
    })
  : undefined;
late.messages = messages;

// Terminal interativo (abrir/assumir sessões e encerrar agentes): opt-in com HABBLAUD_PTY=1 (aceita os mesmos
// valores do HABBLAUD_TERMINAL), só com bind local, fora do Docker, com node-pty e o executável do claude no PATH.
const claudeBinSetting = process.env.HABBLAUD_CLAUDE_BIN?.trim();
const claudeBin = claudeBinFrom();
let spawnPty: SpawnPty | null = null;
let ptyScreen: ScreenFactory | undefined;
let ptyOff: string | undefined;
const ptyFlag = process.env.HABBLAUD_PTY?.trim();
if (!isTruthy(ptyFlag)) ptyOff = ptyFlag ? tr('desligado por HABBLAUD_PTY={0}', [ptyFlag]) : tr('desligado (ligue com HABBLAUD_PTY=1)');
else if (config.inDocker) ptyOff = tr('indisponível no Docker (rode com npm start)');
else if (!config.terminal) ptyOff = tr('mesma trava do terminal ({0})', [terminalOffReason(process.env, config.host, config.inDocker)]);
else if (!claudeBin) ptyOff = claudeBinSetting ? tr('HABBLAUD_CLAUDE_BIN não encontrado no PATH ({0})', [claudeBinSetting]) : tr('executável "claude" não encontrado no PATH (defina HABBLAUD_CLAUDE_BIN)');
else if (!isExecutableFile(claudeBin)) ptyOff = tr('o executável do Claude Code não roda: {0} (confira o HABBLAUD_CLAUDE_BIN)', [claudeBin]);
else {
  const loaded = await loadPty();
  spawnPty = loaded.spawn;
  ptyOff = loaded.reason;
  if (spawnPty) {
    const screen = await loadHeadlessScreen();
    ptyScreen = screen.create ?? undefined;
    if (screen.reason) log.warn(tr('Terminal interativo sem a tela completa ({0}): ao reconectar, modos como a colagem entre colchetes podem se perder.', [screen.reason]));
  }
}
const ptys = spawnPty
  ? new PtyManager({
      spawn: spawnPty,
      claudeBin: claudeBin ?? 'claude',
      accounts: () => accounts.entries().map((a) => ({ id: a.id, dir: a.dir, isDefault: isDefaultDir(a.dir, config.home) })),
      agent: (id) => {
        const a = office.get(id);
        return a && { id: a.id, kind: a.kind, account: a.account, sessionId: a.sessionId, cwd: office.roomPath(a.roomId) };
      },
      onChange: () => office.markDirty(),
      createScreen: ptyScreen,
    })
  : undefined;
late.ptys = ptys;
late.ptyOff = ptyOff;

updateInstaller = new UpdateInstaller({
  config,
  checker: updates,
  hasActivePtys: () => !!ptys?.list().some((pty) => pty.exitedAt === undefined),
  onChange: (status) => {
    updateShutdownRequested = ['downloading', 'applying', 'restarting'].includes(status.state);
    office.markDirty();
  },
  shutdown: () => shutdown('AIOffice update'),
});

if (config.demo) office.setDemo(true);
// As fontes síncronas (a do Claude Code) terminam o boot aqui, antes de o hub começar a transmitir.
void agents.start();
accounts.start();
hub.start();
if (timeline) {
  timeline.start();
  timeline.ingest(hub.current());
}
permissions?.start();
messages?.start();
stats.start();
updates.start();
maestroUpdates.start();
const ticker = setInterval(() => {
  try {
    office.tick();
  } catch (err) {
    log.warnOnce(`tick:${errMsg(err)}`, tr('Falha no relógio do escritório: {0}', [errMsg(err)]));
  }
}, 250);

const api = createApiHandler({
  renameRoom: (id, name) => {
    const path = office.roomPath(id);
    if (!path) return undefined;
    roomAliases.set(path, name);
    office.refreshRoomNames();
    return office.roomName(id);
  },
  office,
  hub,
  accounts,
  sources: () => agents.sources(),
  version: config.version,
  inDocker: config.inDocker,
  terminal: config.terminal,
  terminals,
  sessions: history,
  timeline: createTimelineHandler({ dir: timelineDir, recording: !!timeline }),
  permissions: permissions ? createPermissionRoutes(permissions) : undefined,
  messages: messages ? createMessageRoutes(messages) : undefined,
  pty: ptys ? createPtyRoutes(ptys) : undefined,
  codexLive,
  stats,
  updates: {
    status: () => ({ ...updates.status(), installation: updateInstaller?.status() }),
    check: (opts) => updates.check(opts),
    install: (version) => updateInstaller!.install(version),
  },
  maestro: {
    status: () => maestroUpdates.status(),
    check: (opts) => maestroUpdates.check(opts.manual),
    install: () => maestroUpdates.install(),
    update: (version) => maestroUpdates.update(version),
  },
  updateNonce: () => process.env.AIOFFICE_UPDATE_NONCE,
  updateShutdownStarted: () => updateShutdownRequested,
  hasActivePtys: () => !!ptys?.list().some((pty) => pty.exitedAt === undefined),
  beginUpdateShutdown: () => { updateShutdownRequested = true; },
  cancelUpdateShutdown: () => { updateShutdownRequested = false; },
  shutdownForUpdate: () => process.emit('SIGTERM'),
  remoteAccess: {
    status: () => remoteAccess.status(),
    configure: () => remoteAccess.configure(),
    start: () => remoteAccess.start(),
    stop: () => remoteAccess.stop(),
    generateCode: () => remoteAccess.generateCode(),
    listSessions: () => remoteAccess.listSessions(),
    revokeSession: (id) => remoteAccess.revokeSession(id),
  },
});

const server = http.createServer();
let closeVite: (() => Promise<void>) | undefined;

function parseUrl(req: http.IncomingMessage): URL {
  try {
    return new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return new URL('/', 'http://localhost');
  }
}

/** Quem atende o que não é /api: o Vite (dev) ou os arquivos de dist/client (produção). */
let fallback: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => void;
if (config.dev) {
  // Import dinâmico: o bundle de produção nunca carrega o Vite.
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: join(config.rootDir, 'vite.config.ts'),
    server: { middlewareMode: true, ws: { server } },
    appType: 'spa',
  });
  closeVite = () => vite.close();
  fallback = (req, res) => vite.middlewares(req, res);
} else {
  const serveStatic = createStaticHandler(join(config.rootDir, 'dist', 'client'));
  fallback = (req, res, url) => serveStatic(req, res, url.pathname);
}

// Host/Origin/Content-Type: barra DNS rebinding e CSRF antes de qualquer rota (inclusive o Vite).
const guard = createRequestGuard({ allowedHosts: config.allowedHosts });
const remoteGuard = createRequestGuard({ allowedHosts: remoteAllowedHosts });
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, isRemote = false): void {
  const url = parseUrl(req);
  try {
    if ((isRemote ? remoteGuard : guard)(req, res)) return;
    if (isRemote && remoteAccess.handleRequest(req, res, url)) return;
    if (!api(req, res, url)) fallback(req, res, url);
  } catch (err) {
    log.warn(tr('Erro ao responder {0} {1}: {2}', [req.method, url.pathname, errMsg(err)]));
    if (!res.headersSent) sendJson(res, 500, { error: tr('erro interno') });
    else res.destroy();
  }
}
server.on('request', (req, res) => handleRequest(req, res));

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') log.error(tr('A porta {0} já está em uso (defina HABBLAUD_PORT para usar outra).', [config.port]));
  else log.error(tr('Erro no servidor HTTP: {0}', [errMsg(err)]));
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const startupNonce = process.env.AIOFFICE_STARTUP_NONCE;
  const utilityProcess = process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } };
  if (startupNonce && process.versions.electron) {
    utilityProcess.parentPort?.postMessage({ type: 'aioffice-server-ready', nonce: startupNonce, version: config.version });
  }
  const host = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;
  log.info(tr('🏢 Habblaud {0}{1}{2} em http://{3}:{4}', [config.version, config.dev ? ' (dev)' : '', config.inDocker ? ' (docker)' : '', host, config.port]));
  const list = accounts.entries();
  if (!list.length) log.warn(tr('Nenhuma pasta do Claude Code encontrada (defina HABBLAUD_CLAUDE_DIRS).'));
  for (const dir of codexDirsRefused(process.env, config.home)) {
    log.warn(tr('{0} é uma pasta do Codex, não do Claude Code: fica fora das contas do Claude Code.', [dir]));
  }
  for (const a of list) {
    const src = agents.sources().find((s) => s.label === a.id);
    const usage = accounts.usageView(a.id).status;
    log.info(tr('   Conta {0} ({1}): {2} sessão(ões) aberta(s) · uso: {3} · {4}', [a.detected.short, a.id, src?.sessions ?? 0, usage, a.dir]));
  }
  if (codex) {
    const codexAccounts = codex.accountEntries();
    const open = codex.sources().reduce((n, s) => n + s.sessions, 0);
    log.info(tr('   Codex: {0} conta(s), {1} sessão(ões) aberta(s).', [codexAccounts.length, open]));
    for (const a of codexAccounts) {
      log.info(tr('   Conta {0} do Codex ({1}): uso: {2} · {3}', [a.detected.short, a.id, accounts.usageView(a.id).status, a.detected.configDir]));
    }
  } else {
    log.info(tr('   Codex: {0}.', [config.codex ? tr('nenhuma pasta do Codex encontrada (defina HABBLAUD_CODEX_DIRS)') : tr('desligado (HABBLAUD_CODEX=0)')]));
  }
  if (office.isDemo()) log.info(tr('   Modo demonstração ligado (agentes simulados misturados aos reais).'));
  if (config.terminal) log.info(tr('   Terminal: ligado (acesso só local).'));
  else log.info(tr('   Terminal: desligado ({0}).', [terminalOffReason(process.env, config.host, config.inDocker)]));
  log.info(ptys ? tr('   Terminal interativo: ligado ({0}).', [claudeBin]) : tr('   Terminal interativo: {0}.', [ptyOff ?? tr('desligado')]));
  log.info(timeline ? tr('   Linha do tempo (timelapse): gravando em {0}.', [timelineDir]) : tr('   Linha do tempo (timelapse): gravação desligada (HABBLAUD_TIMELINE).'));
  log.info(tr('   Responder pelo escritório: {0}.', [config.terminal ? tr('ligado (precisa do mod: npm run mod:install; ou do hook antigo: npm run hooks:install)') : tr('desligado (mesma trava do terminal)')]));
  log.info(
    config.messages
      ? tr('   Mensagens pelo escritório: ligadas (instalação automática do plugin nas contas Claude Code detectadas).')
      : tr('   Mensagens pelo escritório: desligadas ({0}).', [messagesOffReason(process.env, config.host, config.inDocker)]),
  );
  if (config.messages && !config.inDocker) {
    const messagesClaudeBin = claudeBinFrom();
    if (!messagesClaudeBin) {
      log.warn(tr('Instalação automática de habblaud-mensagens ignorada: Claude Code não encontrado no PATH ou em ~/.local/bin.'));
    } else {
      void ensureMessagesPluginInstalled(
        accounts.entries().map((account) => ({ dir: account.dir, label: account.detected.short })),
        {
          env: process.env,
          home: config.home,
          root: config.rootDir,
          version: readPackageVersion(config.rootDir),
          claude: makeAsyncClaudeRunner(messagesClaudeBin),
        },
      )
        .then((result) => {
          if (result.lines.length) {
            for (const line of result.lines) (line.level === 'warn' ? log.warn : log.info)(line.text);
          }
        })
        .catch((error: unknown) => log.warn(tr('Instalação automática de habblaud-mensagens falhou: {0}', [errMsg(error)])));
    }
  }
  if (config.messages) {
    log.info(
      codexBin
        ? tr('   Mensagens ao Codex: pelo codex queue ({0}).', [codexBin])
        : config.inDocker
          ? tr('   Mensagens ao Codex: pelo auxiliar do host (deixe npm run codex:bridge rodando no Mac).')
          : tr('   Mensagens ao Codex: sem o binário do Codex (codex no PATH ou HABBLAUD_CODEX_BIN); o auxiliar npm run codex:bridge também serve.'),
    );
  }
  log.info(
    updates.enabled
      ? tr('   Versão nova: verificando as releases de github.com/{0} a cada 6 h.', [config.repo])
      : tr('   Versão nova: verificação desligada ({0}).', [config.repo ? 'HABBLAUD_UPDATE_CHECK' : tr('package.json sem repositório no GitHub')]),
  );
  if (config.remoteWarning) log.warn(config.remoteWarning);
  void remoteAccess.initialize().then((status) => {
    if (status.configured) log.info(tr('   Acesso pelo celular parado; inicie ou configure o túnel no painel local.'));
  }).catch((error: unknown) => log.error(`Acesso remoto desligado: ${errMsg(error)}`));
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(tr('Encerrando ({0})…', [signal]));
  clearInterval(ticker);
  stats.stop();
  agents.stop();
  accounts.stop();
  hub.stop();
  terminals?.stop();
  timeline?.stop();
  permissions?.stop();
  messages?.stop();
  ptys?.stopAll();
  updates.stop();
  maestroUpdates.stop();
  updateInstaller?.stop();
  const remoteShutdown = remoteAccess.shutdown();
  names.flush();
  const viteShutdown = Promise.resolve().then(() => closeVite?.()).catch(() => undefined);
  const serverShutdown = new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  const shutdownTimeout = setTimeout(() => process.exit(1), 5_000);
  shutdownTimeout.unref();
  await Promise.allSettled([remoteShutdown, viteShutdown, serverShutdown]);
  clearTimeout(shutdownTimeout);
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
