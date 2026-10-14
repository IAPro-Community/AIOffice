// Gerencia o Quick Tunnel temporário do Cloudflare. O túnel chega a uma segunda porta HTTPS autenticada,
// ligada somente ao loopback; a porta principal local nunca é publicada.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, delimiter, dirname, join } from 'node:path';
import type { Duplex } from 'node:stream';
import type { RemoteAccessStatus } from '../../shared/types';
import type { ServerConfig } from '../config';
import { createRemoteGate, loadSecret, parseRemoteConfig, RemoteLoginCodes, RemoteSessions, startRemoteListener, type RemoteListener, type RemoteSessionInfo, type RemoteTls } from '../http/remote';
import { readEnvValue, updateEnv } from './envfile';
import { certTargets, ensureServerCert, remoteTlsBase, tlsPaths } from './tls';

const ORIGIN_HOSTS = { dns: ['localhost'], ips: ['127.0.0.1'] };
export const QUICK_TUNNEL_START_TIMEOUT_MS = 2 * 60 * 1000;

export class RemoteAccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Procura apenas executáveis nativos; não usa shell nem baixa binários em segundo plano. */
export function findCloudflared(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | undefined {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  const dirs = (pathKey ? env[pathKey] : undefined)?.split(delimiter).filter(Boolean) ?? [];
  const name = platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  for (const dir of dirs) {
    const candidate = join(dir.replace(/^"|"$/g, ''), name);
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* próxima entrada do PATH */ }
  }
  if (platform === 'win32') {
    for (const root of [env['ProgramFiles(x86)'], env.ProgramFiles].filter((value): value is string => !!value?.trim())) {
      const candidate = join(root, 'cloudflared', name);
      try { if (statSync(candidate).isFile()) return candidate; } catch { /* próxima pasta de instalação */ }
    }
  }
  return undefined;
}

/** Aceita somente a URL HTTPS do subdomínio aleatório emitido por um Quick Tunnel. */
export function parseQuickTunnelUrl(output: string): { url: string; hostname: string } | undefined {
  const matches = output.match(/https:\/\/[^\s"'<>]+/gi) ?? [];
  for (const raw of matches) {
    const candidate = raw.replace(/[),.;!?]+$/g, '');
    try {
      const parsed = new URL(candidate);
      const labels = parsed.hostname.toLowerCase().split('.');
      if (parsed.protocol === 'https:' && parsed.port === '' && parsed.username === '' && parsed.password === '' &&
          parsed.pathname === '/' && parsed.search === '' && parsed.hash === '' && labels.length === 3 &&
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(labels[0]) && labels.slice(1).join('.') === 'trycloudflare.com') {
        return { url: `https://${parsed.hostname.toLowerCase()}`, hostname: parsed.hostname.toLowerCase() };
      }
    } catch { /* ignora qualquer texto que não seja uma URL válida */ }
  }
  return undefined;
}

function appendCloudflaredDiagnostic(current: string, chunk: Buffer | string): string {
  const safe = chunk.toString()
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${current} ${safe}`.trim().slice(-1_200);
}

function errorCode(error: unknown, fallback = 'tunnel_start_failed'): string {
  if (error instanceof RemoteAccessError) return error.message;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'ENOENT') return 'cloudflared_missing';
  return fallback;
}

interface RuntimeOptions {
  config: ServerConfig;
  onRequest: (req: IncomingMessage, res: ServerResponse) => void;
  onChange: () => void;
  /** Adiciona/remove exclusivamente o Host do túnel ativo no guard da porta privada. */
  onTunnelHost: (host: string | undefined) => void;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
}

export class RemoteAccessRuntime {
  private listener?: RemoteListener;
  private gate?: ReturnType<typeof createRemoteGate>;
  private sessions?: RemoteSessions;
  private readonly loginCodes = new RemoteLoginCodes();
  private child?: ChildProcess;
  private readonly sockets = new Set<Duplex>();
  private queue: Promise<unknown> = Promise.resolve();
  private state: RemoteAccessStatus['state'] = 'disabled';
  private error?: string;
  private url?: string;
  private shuttingDown = false;
  private readonly env: NodeJS.ProcessEnv = { ...process.env };

  constructor(private readonly opts: RuntimeOptions) {}

  status(): RemoteAccessStatus {
    const inDocker = this.opts.config.inDocker;
    const inDevelopment = this.opts.config.dev;
    const cloudflared = findCloudflared(this.env);
    return {
      available: !inDocker && !inDevelopment && !!cloudflared,
      ...(!inDocker && inDevelopment ? { unavailableReason: 'development_mode' as const } : {}),
      ...(!inDocker && !inDevelopment && !cloudflared ? { unavailableReason: 'cloudflared_missing' as const } : {}),
      ...(inDocker ? { unavailableReason: 'docker' as const } : {}),
      configured: this.isConfigured(),
      state: this.state,
      ...(this.state === 'active' && this.url ? { url: this.url } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  handleRequest(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    if (url.pathname.startsWith('/api/remote-access/')) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Gerencie o acesso pelo celular no próprio computador.' }));
      req.resume();
      return true;
    }
    if (!this.gate) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Acesso pelo celular indisponível.' }));
      req.resume();
      return true;
    }
    return this.gate(req, res, url);
  }

  /** Migra configurações antigas para loopback e mantém qualquer túnel público desligado após reiniciar. */
  initialize(): Promise<RemoteAccessStatus> {
    return this.serialize(async () => {
      const cfg = this.opts.config.remote;
      if (cfg && !this.opts.config.inDocker) {
        const legacyDomain = this.env.HABBLAUD_REMOTE_DOMAIN?.trim().toLowerCase();
        const allowedHosts = (this.env.HABBLAUD_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
        const retainedHosts = allowedHosts.filter((host) => host.toLowerCase() !== legacyDomain);
        const changes: Record<string, string | null> = {};
        if (this.opts.config.remoteEnabled !== false || cfg.host !== '127.0.0.1') {
          changes.HABBLAUD_REMOTE_ENABLED = '0';
          changes.HABBLAUD_REMOTE_HOST = '127.0.0.1';
        }
        if (legacyDomain) {
          changes.HABBLAUD_REMOTE_DOMAIN = null;
          changes.HABBLAUD_REMOTE_NAME = null;
          changes.HABBLAUD_REMOTE_HTTP_PORT = null;
          changes.HABBLAUD_ALLOWED_HOSTS = retainedHosts.length ? retainedHosts.join(',') : null;
          this.opts.config.allowedHosts.delete(legacyDomain);
        }
        if (this.env.AIOFFICE_REMOTE_CONFIGURED === '1') {
          for (const key of ['HABBLAUD_REMOTE_USER', 'HABBLAUD_REMOTE_PASSWORD_HASH', 'HABBLAUD_REMOTE_PASSWORD']) {
            if (this.env[key] !== undefined) changes[key] = null;
          }
        }
        if (Object.keys(changes).length) this.persist(changes);
        this.opts.config.remoteEnabled = false;
        this.opts.config.remote = { ...cfg, host: '127.0.0.1' };
      }
      this.state = 'disabled';
      this.url = undefined;
      this.error = undefined;
      this.loginCodes.clear();
      this.invalidateSessions();
      this.opts.onTunnelHost(undefined);
      this.opts.onChange();
      return this.status();
    });
  }

  /** Ativa a configuração local e inicia o túnel, sem armazenar senha ou token. */
  configure(): Promise<RemoteAccessStatus> {
    if (this.opts.config.dev) throw new RemoteAccessError(409, 'development_mode');
    if (this.opts.config.inDocker) throw new RemoteAccessError(409, 'cloudflared_missing');
    return this.serialize(async () => {
      this.state = 'starting';
      this.error = undefined;
      this.opts.onChange();
      try {
        await this.stopCurrent();
        const previous = this.opts.config.remote;
        const tlsDir = previous?.tls.dir ?? tlsPaths(remoteTlsBase(this.opts.config.home)).serverDir;
        if (basename(tlsDir).toLowerCase() === 'server') {
          ensureServerCert(tlsPaths(dirname(tlsDir)), ORIGIN_HOSTS);
        } else {
          this.validateExistingOriginCertificate(previous?.tls);
        }

        const port = previous?.port ?? this.validPort(this.env.HABBLAUD_REMOTE_PORT) ?? 4748;
        const changes = {
          HABBLAUD_REMOTE_ENABLED: '0',
          AIOFFICE_REMOTE_CONFIGURED: '1',
          HABBLAUD_REMOTE_USER: null,
          HABBLAUD_REMOTE_PASSWORD_HASH: null,
          HABBLAUD_REMOTE_PASSWORD: null,
          HABBLAUD_REMOTE_PORT: String(port),
          HABBLAUD_REMOTE_HOST: '127.0.0.1',
          HABBLAUD_REMOTE_ALLOW: 'none',
          HABBLAUD_REMOTE_TLS_DIR: JSON.stringify(tlsDir.replace(/\\/g, '/')),
          HABBLAUD_REMOTE_DOMAIN: null,
          HABBLAUD_REMOTE_NAME: null,
          HABBLAUD_REMOTE_HTTP_PORT: null,
          HABBLAUD_REMOTE_INSECURE_HTTP: null,
        };
        const env = { ...this.env, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value ?? undefined])) };
        env.HABBLAUD_REMOTE_TLS_DIR = tlsDir;
        const parsed = parseRemoteConfig(env, false);
        if (!parsed.config) throw new RemoteAccessError(500, 'tunnel_start_failed');
        this.persist(changes);
        Object.assign(this.env, env);
        this.opts.config.remote = { ...parsed.config, host: '127.0.0.1' };
        this.opts.config.remoteEnabled = false;
        this.opts.config.remoteWarning = undefined;
        this.state = 'disabled';
        this.opts.onChange();
        return await this.startNow();
      } catch (cause) {
        await this.stopCurrent();
        this.setError(errorCode(cause));
        throw new RemoteAccessError(cause instanceof RemoteAccessError ? cause.status : 500, this.error!);
      }
    });
  }

  start(): Promise<RemoteAccessStatus> {
    return this.serialize(() => this.startNow());
  }

  listSessions(): RemoteSessionInfo[] {
    return this.sessions?.list() ?? [];
  }

  revokeSession(id: string): boolean {
    return this.sessions?.revokeById(id) ?? false;
  }

  generateCode(): Promise<{ code: string; expiresAt: number }> {
    return this.serialize(async () => {
      if (this.state !== 'active' || !this.listener || !this.child || this.child.exitCode !== null || this.child.signalCode !== null || !this.url) {
        throw new RemoteAccessError(409, 'tunnel_not_active');
      }
      return this.loginCodes.issue();
    });
  }

  stop(): Promise<RemoteAccessStatus> {
    return this.serialize(async () => {
      await this.stopCurrent();
      try {
        if (this.opts.config.remote) this.persist({ HABBLAUD_REMOTE_ENABLED: '0', HABBLAUD_REMOTE_HOST: '127.0.0.1' });
        this.opts.config.remoteEnabled = false;
        if (this.opts.config.remote) this.opts.config.remote = { ...this.opts.config.remote, host: '127.0.0.1' };
        this.state = 'disabled';
        this.error = undefined;
        this.opts.onChange();
        return this.status();
      } catch (cause) {
        this.setError('tunnel_stopped');
        throw new RemoteAccessError(500, this.error!);
      }
    });
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.stopCurrent();
  }

  private async startNow(): Promise<RemoteAccessStatus> {
    if (this.shuttingDown) throw new RemoteAccessError(409, 'tunnel_start_failed');
    if (this.opts.config.dev) throw new RemoteAccessError(409, 'development_mode');
    if (this.opts.config.inDocker) throw new RemoteAccessError(409, 'cloudflared_missing');
    if (!this.opts.config.remote || !this.isConfigured()) throw new RemoteAccessError(409, 'not_configured');
    if (this.state === 'active' && this.child && this.listener && this.url) return this.status();

    const executable = findCloudflared(this.env);
    if (!executable) {
      this.setError('cloudflared_missing');
      throw new RemoteAccessError(409, 'cloudflared_missing');
    }

    this.state = 'starting';
    this.error = undefined;
    this.opts.onChange();
    try {
      const cfg = this.opts.config.remote;
      this.opts.config.remote = { ...cfg, host: '127.0.0.1' };
      this.persist({ HABBLAUD_REMOTE_ENABLED: '1', HABBLAUD_REMOTE_HOST: '127.0.0.1' });
      this.opts.config.remoteEnabled = true;
      await this.openListener();
      const origin = `https://127.0.0.1:${cfg.port}`;
      const child = spawn(executable, [
        'tunnel', '--no-autoupdate', '--url', origin, '--origin-ca-pool', cfg.tls.caFile,
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      const tunnel = await this.waitForTunnel(child);
      if (this.shuttingDown || child.exitCode !== null || child.signalCode !== null) throw new RemoteAccessError(409, 'tunnel_start_failed');
      this.url = tunnel.url;
      this.opts.onTunnelHost(tunnel.hostname);
      this.state = 'active';
      this.error = undefined;
      this.opts.onChange();
      return this.status();
    } catch (cause) {
      await this.stopCurrent();
      this.setError(errorCode(cause));
      throw new RemoteAccessError(cause instanceof RemoteAccessError ? cause.status : 500, this.error!);
    }
  }

  private waitForTunnel(child: ChildProcess): Promise<{ url: string; hostname: string }> {
    return new Promise((resolve, reject) => {
      let output = '';
      let diagnostics = '';
      let settled = false;
      const finish = (error?: Error, tunnel?: { url: string; hostname: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off('error', onError);
        child.off('exit', onExit);
        if (error) reject(error);
        else resolve(tunnel!);
      };
      const consume = (chunk: Buffer | string) => {
        output = `${output}${chunk.toString()}`.slice(-64_000);
        const tunnel = parseQuickTunnelUrl(output);
        if (tunnel) finish(undefined, tunnel);
      };
      const consumeStderr = (chunk: Buffer | string) => {
        diagnostics = appendCloudflaredDiagnostic(diagnostics, chunk);
        consume(chunk);
      };
      const onError = (cause: Error) => finish(new RemoteAccessError(500, errorCode(cause)));
      const onExit = () => finish(new RemoteAccessError(500, 'tunnel_start_failed'));
      const timer = setTimeout(() => {
        this.opts.log.warn(`cloudflared did not provide a Quick Tunnel URL within 120 seconds; stopping the startup attempt.${diagnostics ? ` stderr=${diagnostics}` : ''}`);
        finish(new RemoteAccessError(504, 'tunnel_start_failed'));
      }, QUICK_TUNNEL_START_TIMEOUT_MS);
      timer.unref();
      child.stdout?.on('data', consume);
      child.stderr?.on('data', consumeStderr);
      child.once('error', onError);
      child.once('exit', onExit);
      child.once('exit', (code, signal) => { void this.onTunnelExit(child, code, signal, diagnostics); });
    });
  }

  private async onTunnelExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null, diagnostics: string): Promise<void> {
    if (this.child !== child || this.shuttingDown) return;
    this.opts.log.warn(`cloudflared exited unexpectedly (code=${code ?? 'unknown'}, signal=${signal ?? 'none'}).${diagnostics ? ` stderr=${diagnostics}` : ''}`);
    this.child = undefined;
    this.url = undefined;
    this.loginCodes.clear();
    this.opts.onTunnelHost(undefined);
    await this.closeListener();
    this.invalidateSessions();
    this.setError('tunnel_start_failed');
  }

  private async openListener(): Promise<void> {
    await this.closeListener();
    const cfg = this.opts.config.remote;
    if (!cfg) throw new RemoteAccessError(409, 'not_configured');
    if (!existsSync(cfg.tls.caFile)) throw new RemoteAccessError(409, 'tunnel_start_failed');
    const certificate = new X509Certificate(readFileSync(cfg.tls.certFile));
    const authority = new X509Certificate(readFileSync(cfg.tls.caFile));
    const targets = certTargets(certificate.toString());
    const validFrom = new Date(certificate.validFrom).getTime();
    const validTo = new Date(certificate.validTo).getTime();
    if (!authority.ca || !certificate.verify(authority.publicKey) || validFrom > Date.now() || validTo <= Date.now() ||
        (!targets.dns.includes('localhost') && !targets.ips.includes('127.0.0.1'))) {
      throw new RemoteAccessError(409, 'tunnel_start_failed');
    }
    const sessions = new RemoteSessions(
      // Cada listener usa um nonce efêmero. Assim, cookies de uma execução anterior
      // não voltam a valer mesmo se a rotação do segredo persistente falhar.
      Buffer.concat([loadSecret(join(this.opts.config.dataDir, 'remote-secret')), randomBytes(32)]),
      cfg,
      Date.now,
    );
    this.sessions = sessions;
    this.gate = createRemoteGate({ config: cfg, sessions, loginCodes: this.loginCodes, secure: true });
    const listener = startRemoteListener({ ...cfg, host: '127.0.0.1' }, this.opts.onRequest, this.opts.log);
    this.listener = listener;
    listener.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        listener.server.off('error', onError);
        listener.server.off('listening', onListening);
        listener.server.off('close', onClose);
      };
      const onListening = () => { cleanup(); resolve(); };
      const onError = (cause: Error) => { cleanup(); reject(cause); };
      const onClose = () => { cleanup(); reject(new RemoteAccessError(409, 'tunnel_start_failed')); };
      listener.server.once('listening', onListening);
      listener.server.once('error', onError);
      listener.server.once('close', onClose);
    });
    listener.server.on('error', () => {
      this.setError('tunnel_start_failed');
      void this.stopCurrent();
    });
  }

  private async stopCurrent(): Promise<void> {
    this.loginCodes.clear();
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
      child.kill();
      await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    this.url = undefined;
    this.opts.onTunnelHost(undefined);
    await this.closeListener();
    this.invalidateSessions();
  }

  private async closeListener(): Promise<void> {
    const listener = this.listener;
    this.listener = undefined;
    this.gate = undefined;
    this.sessions?.clear();
    this.sessions = undefined;
    if (!listener) return;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (!listener.server.listening) {
      try { listener.close(); } catch { /* listen falhou antes de abrir um socket */ }
      return;
    }
    await new Promise<void>((resolve) => {
      listener.server.close(() => resolve());
      listener.server.closeAllConnections();
    });
  }

  private invalidateSessions(): void {
    const file = join(this.opts.config.dataDir, 'remote-secret');
    const temporary = `${file}.rotate-${randomBytes(8).toString('hex')}.tmp`;
    try {
      const secret = randomBytes(32).toString('hex');
      writeFileSync(temporary, secret, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      chmodSync(temporary, 0o600);
      renameSync(temporary, file);
    } catch {
      // As sessões da execução atual já foram removidas; sem disco gravável, a nova execução gera outra chave.
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  private validateExistingOriginCertificate(tls?: RemoteTls): void {
    if (!tls || !existsSync(tls.certFile) || !existsSync(tls.caFile)) throw new RemoteAccessError(409, 'tunnel_start_failed');
    try {
      const certificate = new X509Certificate(readFileSync(tls.certFile));
      const ca = new X509Certificate(readFileSync(tls.caFile));
      const names = certTargets(certificate.toString());
      const validFrom = new Date(certificate.validFrom).getTime();
      const validTo = new Date(certificate.validTo).getTime();
      if (!ca.ca || !certificate.verify(ca.publicKey) || validFrom > Date.now() || validTo <= Date.now() ||
          (!names.dns.includes('localhost') && !names.ips.includes('127.0.0.1'))) {
        throw new Error('invalid origin certificate');
      }
    } catch {
      throw new RemoteAccessError(409, 'tunnel_start_failed');
    }
  }

  private validPort(raw: string | undefined): number | undefined {
    const port = Number(raw);
    return Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined;
  }

  private isConfigured(): boolean {
    return !!this.opts.config.remote && this.env.AIOFFICE_REMOTE_CONFIGURED === '1';
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (this.shuttingDown) throw new RemoteAccessError(409, 'tunnel_start_failed');
      return operation();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private persist(changes: Record<string, string | null>): void {
    const file = this.opts.config.envFile;
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const temporary = `${file}.remote-${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, updateEnv(current, changes), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      chmodSync(temporary, 0o600);
      renameSync(temporary, file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) { delete this.env[key]; delete process.env[key]; }
      else {
        const parsed = readEnvValue(`${key}=${value}`, key)!;
        this.env[key] = parsed;
        process.env[key] = parsed;
      }
    }
  }

  private setError(code: string): void {
    this.state = 'error';
    this.error = code;
    this.opts.onChange();
  }
}
