import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { MaestroUpdateStatus } from '../../shared/types';

const exec = promisify(execFile);
const CHECK_EVERY_MS = 6 * 60 * 60 * 1_000;
const MANUAL_GAP_MS = 30_000;
const HELPER = 'scripts/maestro.mjs';

export interface MaestroUpdateManagerOptions {
  rootDir: string;
  home: string;
  onChange?: (status: MaestroUpdateStatus) => void;
}

interface HelperStatus {
  state: 'ok' | 'missing';
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;
  checkedAt?: number;
  available?: boolean;
  verified?: boolean;
}

/** Checks and updates the separate, user-wide Orquestrador-Maestro NPM installation. */
export class MaestroUpdateManager {
  private current: MaestroUpdateStatus = { state: 'checking', installed: false, available: false, canUpdate: true };
  private inflight: Promise<MaestroUpdateStatus> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private lastAttempt = -Infinity;

  constructor(private readonly options: MaestroUpdateManagerOptions) {}

  status(): MaestroUpdateStatus {
    return { ...this.current, canUpdate: true };
  }

  start(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  check(manual = false): Promise<MaestroUpdateStatus> {
    if (this.current.state === 'updating') return Promise.resolve(this.status());
    if (this.inflight) return this.inflight;
    if (manual && Date.now() - this.lastAttempt < MANUAL_GAP_MS) return Promise.resolve(this.status());
    this.lastAttempt = Date.now();
    this.set({ ...this.current, state: 'checking', error: undefined, message: undefined, canUpdate: true });
    this.inflight = this.runHelper('status', 30_000)
      .then((value) => this.applyStatus(value))
      .catch((error: unknown) => {
        this.set({
          state: 'error',
          installed: this.current.installed,
          installedVersion: this.current.installedVersion,
          latestVersion: this.current.latestVersion,
          checkedAt: this.current.checkedAt,
          available: this.current.available,
          canUpdate: true,
          error: this.errorMessage(error),
        });
        return this.status();
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  install(): MaestroUpdateStatus {
    if (this.current.state === 'updating') return this.status();
    if (this.current.installed) return this.blocked('O Orquestrador-Maestro já está instalado.');
    this.runOperation('ensure', undefined, 'Instalando e verificando o Orquestrador-Maestro…');
    return this.status();
  }

  update(target: string): MaestroUpdateStatus {
    if (this.current.state === 'updating') return this.status();
    if (!this.current.installed || !this.current.available || this.current.latestVersion !== target) {
      return this.blocked('Verifique novamente a versão publicada no NPM antes de atualizar.');
    }
    this.runOperation('update', target, 'Baixando a versão nova e verificando a instalação…');
    return this.status();
  }

  private async runOperation(command: string, target: string | undefined, message: string): Promise<void> {
    this.set({ ...this.current, state: 'updating', error: undefined, message, canUpdate: true });
    try {
      const result = target
        ? await this.runHelper(command, target, 10 * 60_000)
        : await this.runHelper(command, 10 * 60_000);
      this.applyStatus(result);
    } catch (error) {
      this.set({
        ...this.current,
        state: 'error',
        canUpdate: true,
        error: this.errorMessage(error),
      });
    }
  }

  private async runHelper(command: string, timeout: number): Promise<HelperStatus>;
  private async runHelper(command: string, target: string, timeout: number): Promise<HelperStatus>;
  private async runHelper(command: string, targetOrTimeout: string | number, maybeTimeout?: number): Promise<HelperStatus> {
    const args = [join(this.options.rootDir, HELPER), command];
    const timeout = typeof targetOrTimeout === 'number' ? targetOrTimeout : maybeTimeout ?? 30_000;
    if (typeof targetOrTimeout === 'string') args.push(targetOrTimeout);
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, HOME: this.options.home };
      if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
      const { stdout } = await exec(process.execPath, args, {
        cwd: this.options.rootDir,
        env,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      const value = JSON.parse(stdout.trim()) as HelperStatus;
      if (!['ok', 'missing'].includes(value.state) || typeof value.installed !== 'boolean') {
        throw new Error('O NPM retornou um status inválido do Orquestrador-Maestro.');
      }
      return value;
    } catch (error) {
      throw new Error(this.errorMessage(error));
    }
  }

  private applyStatus(value: HelperStatus): MaestroUpdateStatus {
    const status: MaestroUpdateStatus = {
      state: value.state,
      installed: value.installed,
      installedVersion: value.installedVersion,
      latestVersion: value.latestVersion,
      checkedAt: value.checkedAt,
      available: value.available ?? false,
      canUpdate: true,
    };
    this.set(status);
    return this.status();
  }

  private blocked(message: string): MaestroUpdateStatus {
    this.set({ ...this.current, state: 'blocked', message, canUpdate: true });
    return this.status();
  }

  private set(status: MaestroUpdateStatus): void {
    if (JSON.stringify(status) === JSON.stringify(this.current)) return;
    this.current = status;
    this.options.onChange?.(this.status());
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Não foi possível consultar ou atualizar o Orquestrador-Maestro.';
    return message.replaceAll(this.options.home, '~').slice(0, 800);
  }
}
