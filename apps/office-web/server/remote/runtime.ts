// Controle da segunda porta HTTPS no próprio processo; alterações de conta nunca guardam a senha em texto puro.
import { randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, join } from 'node:path';
import type { Duplex } from 'node:stream';
import type { RemoteAccessStatus } from '../../shared/types';
import type { ServerConfig } from '../config';
import { createRemoteGate, loadSecret, parseRemoteConfig, RemoteSessions, startRemoteListener, type RemoteListener } from '../http/remote';
import { addToList, readEnvValue, updateEnv } from './envfile';
import { hashPassword } from './password';
import { certTargets, ensureServerCert, isPrivateIpv4, lanAddresses, remoteTargets, remoteTlsBase, tlsPaths } from './tls';

export class RemoteAccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function validateRemoteCredentials(user: unknown, password: unknown): { user: string; password: string } {
  if (typeof user !== 'string' || !/^[\p{L}\p{N}_.@-]{1,64}$/u.test(user)) {
    throw new RemoteAccessError(400, 'Use um usuário de 1 a 64 caracteres: letras, números, ponto, hífen, sublinhado ou @.');
  }
  if (typeof password !== 'string' || [...password].length < 12 || /\p{Cs}/u.test(password)) throw new RemoteAccessError(400, 'Use uma senha com pelo menos 12 caracteres Unicode válidos.');
  if (Buffer.byteLength(password, 'utf8') > 1024) throw new RemoteAccessError(400, 'A senha excede 1024 bytes.');
  if (password.trim() !== password) throw new RemoteAccessError(400, 'Evite espaços no começo ou no fim da senha.');
  if (password.normalize('NFC').toLowerCase() === user.normalize('NFC').toLowerCase()) throw new RemoteAccessError(400, 'A senha deve ser diferente do usuário.');
  return { user, password };
}

function safeRemoteError(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE') return 'A porta HTTPS já está em uso. Libere a porta e tente iniciar novamente.';
  if (code === 'EACCES' || code === 'EPERM') return 'O sistema negou permissão para abrir a porta HTTPS ou gravar a configuração.';
  return error instanceof RemoteAccessError ? error.message : fallback;
}

interface RuntimeOptions {
  config: ServerConfig;
  onRequest: (req: IncomingMessage, res: ServerResponse) => void;
  onChange: () => void;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
}

export class RemoteAccessRuntime {
  private listener?: RemoteListener;
  private gate?: ReturnType<typeof createRemoteGate>;
  private readonly sockets = new Set<Duplex>();
  private queue: Promise<unknown> = Promise.resolve();
  private state: RemoteAccessStatus['state'];
  private error?: string;
  private shuttingDown = false;
  private readonly env: NodeJS.ProcessEnv = { ...process.env };

  constructor(private readonly opts: RuntimeOptions) {
    this.state = opts.config.inDocker || opts.config.remoteEnabled === false ? 'disabled' : opts.config.remote ? 'starting' : opts.config.remoteWarning ? 'error' : 'disabled';
    if (this.state === 'error') this.error = 'A configuração de acesso remoto está incompleta ou inválida. Configure a conta novamente.';
    if (opts.config.inDocker) this.error = 'O acesso pelo celular exige o servidor Node no computador; o controle HTTPS não está disponível no Docker.';
  }

  status(): RemoteAccessStatus {
    const cfg = this.opts.config.remote;
    const ca = this.ca();
    let urls: string[] | undefined;
    if (cfg && this.state === 'active') {
      try {
        const targets = certTargets(readFileSync(cfg.tls.certFile));
        const wildcard = cfg.host === '0.0.0.0' || cfg.host === '::';
        const ips = lanAddresses().filter((ip) => targets.ips.includes(ip) && (wildcard || cfg.host === ip));
        const domain = this.env.HABBLAUD_REMOTE_DOMAIN?.trim().toLowerCase();
        const dns = domain && targets.dns.includes(domain) && wildcard ? [domain] : [];
        urls = [...new Set([...ips, ...dns])].map((host) => `https://${host}:${cfg.port}`);
      } catch { urls = []; }
    }
    return {
      available: !this.opts.config.inDocker,
      configured: !!cfg,
      state: this.state,
      ...(cfg ? { port: cfg.port, user: cfg.user } : {}),
      ...(urls ? { urls } : {}),
      ...(ca ? { caFingerprint: new X509Certificate(ca).fingerprint256 } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** Reconstrói somente o PEM público, mesmo se houver conteúdo extra no arquivo. */
  ca(): string | undefined {
    const file = this.opts.config.remote?.tls.caFile;
    if (!file) return undefined;
    try {
      const cert = new X509Certificate(readFileSync(file));
      return cert.ca ? cert.toString() : undefined;
    } catch { return undefined; }
  }

  handleRequest(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    if (url.pathname.startsWith('/api/remote-access/')) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Gerencie o acesso remoto pelo próprio computador.' }));
      req.resume();
      return true;
    }
    if (!this.gate) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Acesso remoto indisponível.' }));
      req.resume();
      return true;
    }
    return this.gate(req, res, url);
  }

  initialize(): Promise<RemoteAccessStatus> {
    return this.serialize(async () => {
      if (!this.opts.config.inDocker && this.opts.config.remote && this.opts.config.remoteEnabled !== false) await this.openListener();
      return this.status();
    });
  }

  configure(user: unknown, password: unknown): Promise<RemoteAccessStatus> {
    this.requireNode();
    // Validação ocorre antes de entrar na fila e antes de qualquer escrita ou interrupção da porta atual.
    const credentials = validateRemoteCredentials(user, password);
    return this.serialize(async () => {
      let fallback = 'Não foi possível gerar o hash da senha. Tente novamente.';
      try {
        const hash = await hashPassword(credentials.password);
        if (this.shuttingDown) throw new RemoteAccessError(409, 'O servidor está encerrando.');
        this.state = 'starting';
        this.error = undefined;
        this.opts.onChange();
        await this.closeListener();
        fallback = 'Não foi possível preparar os certificados HTTPS. Confira o OpenSSL e as permissões da pasta de dados.';
        const previous = this.opts.config.remote;
        const managedBase = previous && basename(previous.tls.dir) === 'server' ? dirname(previous.tls.dir) : remoteTlsBase(this.opts.config.home);
        const paths = tlsPaths(managedBase);
        const domain = this.env.HABBLAUD_REMOTE_DOMAIN?.trim().toLowerCase() || undefined;
        const targets = remoteTargets({ domain });
        // Mantém nomes já assinados para que uma configuração pela interface preserve VPNs existentes.
        if (previous && existsSync(previous.tls.certFile)) {
          const old = certTargets(readFileSync(previous.tls.certFile));
          targets.dns = [...new Set([...targets.dns, ...old.dns])];
          targets.ips = [...new Set([...targets.ips, ...old.ips.filter(isPrivateIpv4)])];
        }
        ensureServerCert(paths, targets);
        const rawPort = Number(this.env.HABBLAUD_REMOTE_PORT);
        const port = previous?.port ?? (Number.isInteger(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 4748);
        fallback = 'Não foi possível salvar a configuração do acesso remoto. Confira as permissões do arquivo .env.';
        const file = join(this.opts.config.rootDir, '.env');
        const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
        const changes = {
          HABBLAUD_REMOTE_ENABLED: '1',
          HABBLAUD_REMOTE_USER: credentials.user,
          HABBLAUD_REMOTE_PASSWORD_HASH: hash,
          HABBLAUD_REMOTE_PASSWORD: null,
          HABBLAUD_REMOTE_PORT: String(port),
          HABBLAUD_REMOTE_HOST: previous?.host ?? (this.env.HABBLAUD_REMOTE_HOST?.trim() || '0.0.0.0'),
          HABBLAUD_REMOTE_ALLOW: 'none',
          HABBLAUD_REMOTE_TLS_DIR: JSON.stringify(paths.serverDir.replace(/\\/g, '/')),
          HABBLAUD_REMOTE_INSECURE_HTTP: null,
          ...(domain ? {
            HABBLAUD_ALLOWED_HOSTS: addToList(readEnvValue(current, 'HABBLAUD_ALLOWED_HOSTS'),
              ...(this.env.HABBLAUD_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()),
              ...this.opts.config.allowedHosts, domain),
          } : {}),
        };
        const env = { ...this.env, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value ?? undefined])) };
        // O valor para o parser é o caminho real; as aspas são só a representação no .env.
        env.HABBLAUD_REMOTE_TLS_DIR = paths.serverDir;
        const parsed = parseRemoteConfig(env, this.opts.config.inDocker);
        if (!parsed.config) throw new RemoteAccessError(500, 'Não foi possível validar a configuração HTTPS gerada.');
        this.persist(changes);
        Object.assign(this.env, env);
        this.opts.config.remote = parsed.config;
        if (domain) this.opts.config.allowedHosts.add(domain);
        this.opts.config.remoteWarning = undefined;
        this.opts.config.remoteEnabled = true;
        fallback = 'Não foi possível iniciar a porta HTTPS. Confira o certificado e o endereço de escuta.';
        await this.openListener();
        return this.status();
      } catch (error) {
        await this.closeListener();
        this.setError(safeRemoteError(error, fallback));
        throw new RemoteAccessError(error instanceof RemoteAccessError ? error.status : 500, this.error!);
      }
    });
  }

  start(): Promise<RemoteAccessStatus> {
    return this.serialize(async () => {
      this.requireNode();
      if (!this.opts.config.remote) throw new RemoteAccessError(409, 'Configure o usuário e a senha antes de iniciar o acesso remoto.');
      try {
        this.persist({ HABBLAUD_REMOTE_ENABLED: '1' });
        this.opts.config.remoteEnabled = true;
        if (this.state !== 'active') await this.openListener();
        return this.status();
      } catch (error) {
        await this.closeListener();
        this.setError(safeRemoteError(error, 'Não foi possível salvar ou iniciar o acesso HTTPS. Confira a porta e as permissões do arquivo .env.'));
        throw new RemoteAccessError(500, this.error!);
      }
    });
  }

  stop(): Promise<RemoteAccessStatus> {
    return this.serialize(async () => {
      // Fechar vem primeiro: mesmo que o disco falhe, nenhuma conexão remota permanece aberta.
      await this.closeListener();
      try {
        this.persist({ HABBLAUD_REMOTE_ENABLED: '0' });
        this.opts.config.remoteEnabled = false;
        this.state = 'disabled';
        this.error = undefined;
        this.opts.onChange();
        return this.status();
      } catch (error) {
        this.setError(safeRemoteError(error, 'A porta HTTPS foi fechada, mas não foi possível salvar a desativação no arquivo .env.'));
        throw new RemoteAccessError(500, this.error!);
      }
    });
  }

  shutdown(): Promise<void> {
    this.shuttingDown = true;
    return this.closeListener();
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (this.shuttingDown) throw new RemoteAccessError(409, 'O servidor está encerrando.');
      return operation();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private requireNode(): void {
    if (this.opts.config.inDocker) throw new RemoteAccessError(409, 'O acesso pelo celular exige o servidor Node no computador; o controle HTTPS não está disponível no Docker.');
  }

  /** Renova IPs privados em certificados gerenciados sem trocar a CA confiada pelo celular. */
  private refreshManagedCertificate(): void {
    const cfg = this.opts.config.remote!;
    if (basename(cfg.tls.dir) !== 'server') return;
    const paths = tlsPaths(dirname(cfg.tls.dir));
    // Certificados fornecidos externamente continuam sob responsabilidade de quem os instalou.
    if (!existsSync(paths.caKey) || !existsSync(paths.caCert)) return;
    try {
      const targets = remoteTargets({ domain: this.env.HABBLAUD_REMOTE_DOMAIN?.trim().toLowerCase() || undefined });
      const old = certTargets(readFileSync(cfg.tls.certFile));
      targets.dns = [...new Set([...targets.dns, ...old.dns])];
      targets.ips = [...new Set([...targets.ips, ...old.ips.filter(isPrivateIpv4)])];
      ensureServerCert(paths, targets);
    } catch {
      throw new RemoteAccessError(500, 'Não foi possível renovar o certificado para a rede atual. Confira o OpenSSL e as permissões; se a CA não cobrir o endereço, use npm run remote:setup -- --new-ca e reinstale a CA no celular.');
    }
  }

  private persist(changes: Record<string, string | null>): void {
    const file = join(this.opts.config.rootDir, '.env');
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

  private async openListener(): Promise<void> {
    await this.closeListener();
    const cfg = this.opts.config.remote!;
    this.state = 'starting';
    this.error = undefined;
    this.opts.onChange();
    try {
      this.requireNode();
      this.refreshManagedCertificate();
      const sessions = new RemoteSessions(loadSecret(join(this.opts.config.dataDir, 'remote-secret')), cfg, Date.now, join(this.opts.config.dataDir, 'remote-revoked.json'));
      this.gate = createRemoteGate({ config: cfg, sessions, secure: true, caFile: cfg.tls.caFile });
      const listener = startRemoteListener(cfg, this.opts.onRequest, this.opts.log, this.opts.config.allowedHosts);
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
        const onError = (error: Error) => { cleanup(); reject(error); };
        const onClose = () => { cleanup(); reject(new RemoteAccessError(409, 'A porta HTTPS foi fechada antes de iniciar.')); };
        listener.server.once('listening', onListening);
        listener.server.once('error', onError);
        listener.server.once('close', onClose);
      });
      if (this.shuttingDown) { await this.closeListener(); throw new RemoteAccessError(409, 'O servidor está encerrando.'); }
      listener.server.on('error', (error) => {
        this.setError(safeRemoteError(error, 'A porta HTTPS encontrou um erro. Tente iniciar novamente.'));
        void this.closeListener();
      });
      this.state = 'active';
      this.opts.onChange();
    } catch (error) {
      await this.closeListener();
      this.setError(safeRemoteError(error, 'Não foi possível iniciar a porta HTTPS. Confira o certificado e o endereço de escuta.'));
      throw new RemoteAccessError(500, this.error!);
    }
  }

  private async closeListener(): Promise<void> {
    const listener = this.listener;
    this.listener = undefined;
    this.gate = undefined;
    if (!listener) return;
    const closed = new Promise<void>((resolve) => listener.server.once('close', () => resolve()));
    listener.close();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await closed;
  }

  private setError(message: string): void {
    this.state = 'error';
    this.error = message;
    this.opts.onChange();
  }
}
