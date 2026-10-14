import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { UpdateInstallationStatus } from '../../shared/types';
import type { ServerConfig } from '../config';
import { isLoopbackBind } from '../config';
import { compareVersions, parseGithubRepo, type UpdateChecker } from './checker';

export const OFFICIAL_UPDATE_REPO = 'IAPro-Community/AIOffice';
const exec = promisify(execFile);
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export interface UpdateInstallerOptions {
  config: ServerConfig;
  checker: UpdateChecker;
  hasActivePtys: () => boolean;
  onChange?: (status: UpdateInstallationStatus) => void;
  /** Must cooperatively close the server and exit; never force-kill sessions. */
  shutdown: () => void;
}

interface OperationStatus extends UpdateInstallationStatus {
  operation?: string;
  phase?: string;
  previous?: string;
  runningPid?: number;
  workerPid?: number;
}

/** Local managed AIOffice releases only. This never installs Habblaud upstream. */
export class UpdateInstaller {
  private current: UpdateInstallationStatus = { state: 'blocked', message: 'Verificando a instalação gerenciada do AIOffice.' };
  private busy = false;
  private localBlock = false;
  private timer?: ReturnType<typeof setInterval>;
  private readonly statusFile: string;
  private readonly lockFile: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly opts: UpdateInstallerOptions) {
    this.statusFile = join(opts.config.dataDir, 'aioffice-update-status.json');
    this.lockFile = join(opts.config.dataDir, 'aioffice-update.lock');
    this.env = { ...process.env };
    // Recover public progress after restart, but never infer success from a downloaded version.
    this.refreshStatus();
    void this.preflight(true).then(() => {
      if (!existsSync(this.lockFile) && !this.busy && this.current.state !== 'error') this.set({ state: 'ready' });
    }).catch((error: unknown) => {
      if (!this.busy) { this.localBlock = true; this.set({ state: 'blocked', message: message(error) }); }
    });
  }

  status(): UpdateInstallationStatus {
    if (!this.localBlock) this.refreshStatus();
    if (this.current.state === 'ready' && this.opts.hasActivePtys()) {
      return { state: 'blocked', message: 'Encerre os terminais interativos do escritório antes de atualizar.' };
    }
    return { ...this.current };
  }

  async install(version: string): Promise<UpdateInstallationStatus> {
    if (this.busy) return this.status();
    this.busy = true;
    this.localBlock = false;
    this.set({ state: 'downloading', target: version, message: 'Validando a instalação gerenciada antes de baixar a release.' });
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    let work: string | undefined;
    try {
      const root = await this.preflight();
      const checked = await this.opts.checker.check({ manual: true });
      if (!VERSION.test(version) || checked.state !== 'ok' || checked.repo !== OFFICIAL_UPDATE_REPO || !checked.available || checked.latest !== version) {
        throw new Error('Selecione a release estável oficial disponível do AIOffice e verifique novamente.');
      }
      if (compareVersions(version, this.opts.config.version) <= 0) throw new Error('A versão solicitada não é mais nova que a versão em execução.');
      await mkdir(this.opts.config.dataDir, { recursive: true });
      lock = await open(this.lockFile, 'wx', 0o600);
      const operation = randomUUID();
      await lock.writeFile(JSON.stringify({ operation, pid: process.pid, version }));
      work = await mkdtemp(join(dirname(root), '.aioffice-update-'));
      await copyFile(join(this.opts.config.rootDir, 'scripts', 'apply-update.mjs'), join(work, 'worker.mjs'));
      const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (!existsSync(npmCli)) throw new Error('Esta instalação do Node não oferece um npm estável para executar a atualização.');
      const previousCommit = await this.git(root, ['rev-parse', 'HEAD']);
      const job = {
        operation, root, work, dataDir: await realpath(this.opts.config.dataDir),
        version, previous: this.opts.config.version, previousCommit,
        parentPid: process.pid, node: process.execPath, npmCli,
        cwd: await realpath(process.cwd()),
        env: this.env, statusFile: this.statusFile, lockFile: this.lockFile,
        host: this.opts.config.host, port: this.opts.config.port,
      };
      const jobFile = join(work, 'job.json');
      await writeFile(jobFile, JSON.stringify(job), { mode: 0o600 });
      await writeFile(this.statusFile, JSON.stringify({ state: 'downloading', operation, target: version, previous: job.previous, message: 'Preparando a release oficial em uma pasta separada.' }), { mode: 0o600 });
      // Dynamic import avoids confusing this worker with the application server's child processes.
      const { spawn } = await import('node:child_process');
      const worker = spawn(process.execPath, [join(work, 'worker.mjs'), jobFile], { cwd: work, env: this.env, detached: true, stdio: 'ignore', windowsHide: true });
      await new Promise<void>((resolveStarted, reject) => { worker.once('spawn', resolveStarted); worker.once('error', reject); });
      worker.unref();
      await lock.close();
      lock = undefined;
      this.refreshStatus();
      this.timer = setInterval(() => void this.coordinate(root, operation), 750);
      this.timer.unref();
      return this.status();
    } catch (error) {
      if (lock) { await lock.close(); await rm(this.lockFile, { force: true }); }
      // No detached worker owns this workspace on an initial launch failure.
      if (work) await rm(work, { recursive: true, force: true });
      this.busy = false;
      this.localBlock = true;
      this.set({ state: 'blocked', message: message(error) });
      return this.status();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async coordinate(root: string, operation: string): Promise<void> {
    const record = this.refreshStatus();
    if (record?.operation !== operation) return;
    if (record.state === 'error' || record.state === 'blocked' || record.phase === 'complete') {
      this.busy = false;
      this.stop();
      return;
    }
    if (record.phase !== 'awaiting-shutdown') return;
    // Stop polling before awaiting: only one callback may authorize shutdown.
    this.stop();
    try {
      await this.preflight(true);
      const lock = JSON.parse(await readFile(this.lockFile, 'utf8')) as { operation?: string };
      if (lock.operation !== operation) throw new Error('A trava da atualização mudou.');
      // The worker receives authorization through the durable lock, then waits for this PID to exit.
      await writeFile(`${this.lockFile}.shutdown`, operation, { flag: 'wx', mode: 0o600 });
      this.opts.shutdown();
    } catch (error) {
      await writeFile(`${this.lockFile}.cancel`, message(error), { mode: 0o600 });
      this.localBlock = true;
      this.set({ state: 'blocked', target: record.target, message: message(error) });
      this.busy = false;
    }
  }

  private async preflight(locked = false): Promise<string> {
    const c = this.opts.config;
    if (c.inDocker || existsSync('/.dockerenv')) throw new Error('Atualização por botão indisponível no Docker; atualize a imagem do AIOffice.');
    if (c.dev || this.env.AIOFFICE_MANAGED_INSTALL !== '1') throw new Error('Use uma instalação gerenciada: AIOFFICE_MANAGED_INSTALL=1 com npm run start:office, fora do modo de desenvolvimento.');
    if (process.execArgv.length || this.env.NODE_OPTIONS?.trim() || this.env.pm_id || this.env.INVOCATION_ID) throw new Error('O reinício por botão exige Node sem opções extras nem um supervisor com reinício automático.');
    if (!isLoopbackBind(c.host)) throw new Error('A atualização exige um servidor acessível apenas neste computador.');
    if (c.repo !== OFFICIAL_UPDATE_REPO) throw new Error('Somente releases IAPro-Community/AIOffice podem ser instaladas.');
    if (this.opts.hasActivePtys()) throw new Error('Encerre os terminais interativos do escritório antes de atualizar.');
    const root = await realpath(resolve(c.rootDir, '../..'));
    if (await realpath(c.rootDir) !== join(root, 'apps', 'office-web')) throw new Error('Esta pasta não é uma instalação AIOffice reconhecida.');
    const cwd = await realpath(process.cwd());
    if (cwd !== root && cwd !== await realpath(c.rootDir)) throw new Error('Inicie o servidor a partir da raiz do AIOffice ou de apps/office-web.');
    if (!process.argv[1] || await realpath(process.argv[1]) !== await realpath(join(c.rootDir, 'dist', 'server', 'index.js')) || process.argv.length !== 2) throw new Error('Inicie o servidor compilado diretamente com npm run start:office para permitir reinício seguro.');
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { name?: string; version?: string; repository?: unknown };
    if (pkg.name !== 'aioffice' || pkg.version !== c.version || parseGithubRepo(pkg.repository) !== OFFICIAL_UPDATE_REPO) throw new Error('Os metadados locais não correspondem ao AIOffice em execução.');
    const data = canonicalExisting(c.dataDir);
    const usage = canonicalExisting(c.usageDir);
    if (overlaps(root, data) || overlaps(root, usage)) throw new Error('Mova as pastas de dados e uso para fora do checkout antes de atualizar.');
    await mkdir(c.dataDir, { recursive: true });
    if (!locked && existsSync(this.lockFile)) throw new Error('Existe uma atualização ou recuperação pendente. Confira aioffice-update-status.json; a trava nunca é removida automaticamente após uma interrupção.');
    if (await realpath(await this.git(root, ['rev-parse', '--show-toplevel'])) !== root) throw new Error('A pasta do AIOffice não é a raiz Git.');
    if (!existsSync(join(root, '.git', 'HEAD')) || (await lstat(join(root, '.git'))).isSymbolicLink()) throw new Error('Worktrees e instalações sem uma pasta .git própria não são atualizados por botão.');
    const remote = await this.git(root, ['remote', 'get-url', 'origin']);
    if (!/^(?:https:\/\/github\.com\/IAPro-Community\/AIOffice(?:\.git)?|git@github\.com:IAPro-Community\/AIOffice(?:\.git)?)$/i.test(remote)) throw new Error('O origin precisa apontar exatamente para IAPro-Community/AIOffice.');
    const versionTag = `v${c.version}`;
    const tagRefs = await this.git(root, ['ls-remote', '--tags', 'origin', `refs/tags/${versionTag}`, `refs/tags/${versionTag}^{}`]);
    const refs = tagRefs.split(/\r?\n/).map((line) => /^([0-9a-f]{40,64})\s+(refs\/tags\/[^\s]+)$/i.exec(line)).filter((m): m is RegExpExecArray => !!m);
    const officialCommit = refs.find((m) => m[2] === `refs/tags/${versionTag}^{}`)?.[1] ?? refs.find((m) => m[2] === `refs/tags/${versionTag}`)?.[1];
    const currentCommit = await this.git(root, ['rev-parse', 'HEAD']);
    if (!officialCommit || currentCommit !== officialCommit) throw new Error(`O checkout não corresponde ao commit oficial da release ${versionTag}; commits e branches locais não serão sobrescritos pelo botão.`);
    if (await this.git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Existem alterações locais. Salve-as e deixe o checkout limpo antes de atualizar.');
    if (await this.git(root, ['ls-files', '--stage']).then((out) => /^160000 /m.test(out))) throw new Error('Instalações com submódulos exigem atualização manual.');
    return root;
  }

  private async git(root: string, args: string[]): Promise<string> {
    const env = { ...Object.fromEntries(Object.entries(this.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' };
    const { stdout } = await exec('git', ['-C', root, ...args], { env, windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  }

  private refreshStatus(): OperationStatus | undefined {
    try {
      const record = JSON.parse(readFileSync(this.statusFile, 'utf8')) as OperationStatus;
      if (!['ready', 'blocked', 'downloading', 'applying', 'restarting', 'error'].includes(record.state)) return;
      let workerAlive = true;
      if (typeof record.workerPid === 'number') {
        try { process.kill(record.workerPid, 0); } catch (error) { workerAlive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
      }
      if (['downloading', 'applying', 'restarting'].includes(record.state) && record.workerPid && !workerAlive) {
        this.set({ state: 'blocked', target: record.target, message: 'O atualizador foi interrompido. Confira os arquivos de recuperação antes de remover a trava.' });
        return { ...record, state: 'blocked', message: this.current.message };
      } else if (record.phase === 'complete' && (record.target !== this.opts.config.version || record.runningPid !== process.pid)) {
        this.set({ state: 'blocked', target: record.target, message: 'A confirmação anterior não corresponde ao servidor em execução.' });
      } else this.set({ state: record.state, target: record.target, message: record.message });
      return record;
    } catch { return; }
  }

  private set(value: UpdateInstallationStatus): void {
    if (JSON.stringify(value) === JSON.stringify(this.current)) return;
    this.current = value;
    this.opts.onChange?.({ ...value });
  }
}

function canonicalExisting(path: string): string {
  let cursor = resolve(path);
  const parts: string[] = [];
  while (!existsSync(cursor)) { parts.unshift(relative(dirname(cursor), cursor)); cursor = dirname(cursor); }
  return resolve(realpathSync(cursor), ...parts);
}

function overlaps(a: string, b: string): boolean {
  const inside = (parent: string, child: string) => { const r = relative(parent, child); return !r || (!r.startsWith('..') && !isAbsolute(r)); };
  return inside(a, b) || inside(b, a);
}

function message(error: unknown): string {
  if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return 'Outra atualização já está em andamento. Aguarde ou confira a recuperação pendente.';
  return error instanceof Error ? error.message.slice(0, 800) : 'Não foi possível preparar a atualização com segurança.';
}
