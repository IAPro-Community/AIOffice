// Acesso remoto autenticado por Quick Tunnel temporário do Cloudflare. A porta principal continua local; a porta
// HTTPS do túnel aceita somente loopback e TODA requisição nela passa por este gate antes da API.
//
// Sessão: cookie HttpOnly + SameSite=Strict + Secure assinado com HMAC, nonce exclusivo e validade de 12 horas;
// chave = segredo persistente + nonce aleatório por listener + usuário interno; cookies não sobrevivem à troca do listener.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, unwatchFile, watchFile, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import https from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isJsonContentType } from './guard';
import { getLocale, tr } from '../../shared/i18n';

export type RemoteFeature = 'permissions' | 'messages' | 'terminal';

const FEATURES: readonly RemoteFeature[] = ['permissions', 'messages', 'terminal'];

export interface RemoteTls {
  dir: string;
  keyFile: string;
  certFile: string;
  caFile: string;
}

export interface RemoteConfig {
  port: number;
  host: string;
  user: string;
  allow: ReadonlySet<RemoteFeature>;
  /** HTTPS obrigatório; nenhuma porta HTTP remota é criada. */
  tls: RemoteTls;
}

export const DEFAULT_REMOTE_PORT = 4748;
export const COOKIE = 'habblaud_remote';
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
export const LOGIN_CODE_LENGTH = 6;

const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LOGIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function defaultTlsDir(env: NodeJS.ProcessEnv, inDocker: boolean): string {
  if (env.HABBLAUD_REMOTE_TLS_DIR?.trim()) return env.HABBLAUD_REMOTE_TLS_DIR.trim();
  return inDocker ? '/remote-tls' : join(env.HOME || homedir(), '.habblaud', 'remote-tls', 'server');
}

/** Lê as credenciais e o certificado de origem do túnel. O runtime só abre o listener no loopback. */
export function parseRemoteConfig(
  env: NodeJS.ProcessEnv,
  inDocker: boolean,
  exists: (path: string) => boolean = existsSync,
): { config?: RemoteConfig; warning?: string } {
  const configured = env.AIOFFICE_REMOTE_CONFIGURED === '1';
  const legacyCredentials = !!env.HABBLAUD_REMOTE_USER?.trim() || !!env.HABBLAUD_REMOTE_PASSWORD_HASH?.trim() || !!env.HABBLAUD_REMOTE_PASSWORD?.trim();
  if (!configured) return legacyCredentials ? { warning: tr('A configuração antiga do acesso móvel precisa ser refeita no painel do AIOffice.') } : {};
  const dir = defaultTlsDir(env, inDocker);
  const tls: RemoteTls = { dir, keyFile: join(dir, 'server.key'), certFile: join(dir, 'server.crt'), caFile: join(dir, 'ca.crt') };
  const hasTls = exists(tls.keyFile) && exists(tls.certFile);
  if (!hasTls) return { warning: tr('O certificado local para o túnel ainda não está disponível.') };
  const rawPort = Number(env.HABBLAUD_REMOTE_PORT ?? '');
  const port = inDocker ? DEFAULT_REMOTE_PORT : Number.isInteger(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : DEFAULT_REMOTE_PORT;
  const host = inDocker ? '0.0.0.0' : env.HABBLAUD_REMOTE_HOST?.trim() || '127.0.0.1';
  return {
    config: { port, host, user: 'aioffice', allow: parseAllow(env.HABBLAUD_REMOTE_ALLOW), tls },
  };
}

export function parseAllow(raw: string | undefined): Set<RemoteFeature> {
  if (raw === undefined || !raw.trim()) return new Set<RemoteFeature>();
  const out = new Set<RemoteFeature>();
  for (const part of raw.split(',')) {
    const p = part.trim().toLowerCase();
    if ((FEATURES as readonly string[]).includes(p)) out.add(p as RemoteFeature);
  }
  return out;
}

/** Segredo de assinatura: lido de `file` ou criado (32 bytes, permissão 600). Sem disco gravável, vale só nesta execução. */
export function loadSecret(file: string): Buffer {
  try {
    if (existsSync(file)) {
      const hex = readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
    }
    const secret = randomBytes(32);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
    chmodSync(file, 0o600);
    return secret;
  } catch {
    return randomBytes(32);
  }
}

/** Compara em tempo constante (os dois lados viram digests do mesmo tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(h(a), h(b));
}

/** Código de pareamento emitido localmente: válido por cinco minutos e consumido no primeiro login correto. */
export class RemoteLoginCodes {
  private digest?: Buffer;
  private expiresAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  issue(): { code: string; expiresAt: number } {
    const bytes = randomBytes(LOGIN_CODE_LENGTH);
    const code = [...bytes].map((byte) => LOGIN_CODE_ALPHABET[byte & 31]).join('');
    this.digest = createHash('sha256').update(code, 'utf8').digest();
    this.expiresAt = this.now() + LOGIN_CODE_TTL_MS;
    return { code, expiresAt: this.expiresAt };
  }

  consume(candidate: string): boolean {
    const normalized = candidate.replace(/[\s-]/g, '').toUpperCase();
    if (!this.digest || this.expiresAt <= this.now() || !LOGIN_CODE_PATTERN.test(normalized)) {
      if (this.expiresAt <= this.now()) this.clear();
      return false;
    }
    const digest = createHash('sha256').update(normalized, 'utf8').digest();
    if (!timingSafeEqual(digest, this.digest)) return false;
    this.clear();
    return true;
  }

  clear(): void {
    this.digest?.fill(0);
    this.digest = undefined;
    this.expiresAt = 0;
  }
}

export interface RemoteSessionInfo {
  id: string;
  device: string;
  loggedInAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

/** Rótulo aproximado: nunca conserva o User-Agent bruto nem dados de rede. */
function remoteDeviceLabel(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').slice(0, 2_048);
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Edge'
    : /(?:OPR|Opera)\//i.test(ua) ? 'Opera'
    : /(?:Firefox|FxiOS)\//i.test(ua) ? 'Firefox'
    : /(?:Chrome|CriOS)\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  const platform = /(?:iPhone|iPad|iPod)/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /(?:Macintosh|Mac OS X)/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  return `${browser} · ${platform}`;
}

export class RemoteSessions {
  private readonly key: Buffer;
  /** Assinatura interna -> metadados públicos; somente sessões emitidas nesta execução são aceitas. */
  private readonly records = new Map<string, RemoteSessionInfo>();

  constructor(
    secret: Buffer,
    cfg: Pick<RemoteConfig, 'user'>,
    private readonly now: () => number = Date.now,
  ) {
    this.key = createHmac('sha256', secret).update(cfg.user, 'utf8').digest();
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload, 'utf8').digest('base64url');
  }

  issue(userAgent?: string): { token: string; maxAgeS: number } {
    this.prune();
    const loggedInAt = this.now();
    const exp = loggedInAt + SESSION_MS;
    const payload = `v2.${exp}.${randomBytes(16).toString('base64url')}`;
    const sig = this.sign(payload);
    this.records.set(sig, {
      id: randomBytes(24).toString('base64url'),
      device: remoteDeviceLabel(userAgent),
      loggedInAt,
      lastSeenAt: loggedInAt,
      expiresAt: exp,
    });
    return { token: `${payload}.${sig}`, maxAgeS: Math.floor(SESSION_MS / 1000) };
  }

  verify(token: string | undefined): boolean {
    this.prune();
    const parsed = this.parse(token);
    return !!parsed && this.records.has(parsed.sig);
  }

  /** Chamado por requisição autenticada; revalidações periódicas de streams não contam como acesso. */
  touch(token: string | undefined): void {
    const parsed = this.parse(token);
    const record = parsed && this.records.get(parsed.sig);
    if (record) record.lastSeenAt = this.now();
  }

  list(): RemoteSessionInfo[] {
    this.prune();
    return [...this.records.values()].map(({ id, device, loggedInAt, lastSeenAt, expiresAt }) => ({
      id, device, loggedInAt, lastSeenAt, expiresAt,
    }));
  }

  revokeById(id: string): boolean {
    this.prune();
    for (const [sig, record] of this.records) {
      if (record.id === id) return this.records.delete(sig);
    }
    return false;
  }

  clear(): void {
    this.records.clear();
  }

  /** Encerra este token (botão "Sair"); token inválido ou vencido não muda nada. */
  revoke(token: string | undefined): void {
    const parsed = this.parse(token);
    if (!parsed) return;
    this.records.delete(parsed.sig);
  }

  private parse(token: string | undefined): { exp: number; sig: string } | undefined {
    if (!token) return undefined;
    const m = /^v2\.(\d{10,16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!m) return undefined;
    const exp = Number(m[1]);
    if (!Number.isSafeInteger(exp) || exp <= this.now() || exp > this.now() + SESSION_MS) return undefined;
    const expected = Buffer.from(this.sign(`v2.${m[1]}.${m[2]}`));
    const got = Buffer.from(m[3]);
    return expected.length === got.length && timingSafeEqual(expected, got) ? { exp, sig: m[3] } : undefined;
  }

  private prune(): void {
    const now = this.now();
    for (const [sig, record] of this.records) if (record.expiresAt <= now) this.records.delete(sig);
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Freio por IP do visitante; CF-Connecting-IP só é aceito na porta de origem loopback do túnel. */
export class LoginThrottle {
  private readonly attempts = new Map<string, { failures: number; blockedUntil: number; busy: boolean }>();

  constructor(private readonly now: () => number = Date.now, private readonly maxKeys = 512) {}

  private state(key: string): { failures: number; blockedUntil: number; busy: boolean } {
    let state = this.attempts.get(key);
    if (!state) {
      if (this.attempts.size >= this.maxKeys) this.attempts.delete(this.attempts.keys().next().value!);
      state = { failures: 0, blockedUntil: 0, busy: false };
      this.attempts.set(key, state);
    } else {
      // Reinsere para a eviction remover primeiro as chaves menos recentes.
      this.attempts.delete(key);
      this.attempts.set(key, state);
    }
    return state;
  }

  /** Segundos até poder tentar de novo (0 = pode; 1 enquanto outra tentativa está em andamento). */
  retryAfter(key = 'default'): number {
    const state = this.attempts.get(key);
    return state ? Math.max(state.busy ? 1 : 0, Math.ceil((state.blockedUntil - this.now()) / 1000)) : 0;
  }

  /** Começa uma tentativa (já contada como falha); false se o freio ou outra tentativa não deixam. */
  begin(key = 'default'): boolean {
    if (this.retryAfter(key) > 0) return false;
    const state = this.state(key);
    state.busy = true;
    state.failures++;
    if (state.failures >= 5) state.blockedUntil = this.now() + Math.min(300, 2 ** (state.failures - 5)) * 1000;
    return true;
  }

  /** Fim da tentativa começada em begin(): acertou zera o freio; errou fica a falha já contada. */
  end(ok: boolean, key = 'default'): void {
    const state = this.attempts.get(key);
    if (!state) return;
    state.busy = false;
    if (ok) {
      state.failures = 0;
      state.blockedUntil = 0;
    }
  }
}

/** Requisições que chegaram pela porta remota e passaram pelo login. */
const remoteRequests = new WeakSet<IncomingMessage>();
/** Capacidades aprovadas para a requisição remota, sem inferir confiança pelo Host. */
const remoteCapabilities = new WeakMap<IncomingMessage, ReadonlySet<RemoteFeature>>();
/** Arquivos que a porta remota serve sem login: manifesto e ícones (o celular os busca antes do login, sem o
 *  cookie). Nada da API nem do escritório. */
const PUBLIC_STATIC = /^\/(manifest\.webmanifest|assets\/brand\/[\w.@-]+\.png)$/;

export function isRemoteRequest(req: IncomingMessage): boolean {
  return remoteRequests.has(req);
}

export function remoteAllows(req: IncomingMessage, feature: RemoteFeature): boolean {
  return remoteCapabilities.get(req)?.has(feature) ?? false;
}

const LONG_LIVED_REMOTE = /^\/api\/(?:stream|agents\/[^/]+\/terminal|sessions\/[^/]+\/[^/]+\/terminal)$/;
const SESSION_RECHECK_MS = 10_000;

function closeWhenRemoteSessionEnds(res: ServerResponse, sessions: RemoteSessions, token: string | undefined): void {
  const timer = setInterval(() => {
    if (!sessions.verify(token)) {
      clearInterval(timer);
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  }, SESSION_RECHECK_MS);
  timer.unref();
  res.once('close', () => clearInterval(timer));
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(data);
}

function readBody(req: IncomingMessage, max = 8 * 1024): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= max) chunks.push(c);
    });
    req.on('end', () => (size > max ? fail(new Error(tr('corpo grande demais'))) : ok(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', fail);
  });
}

/** Texto nosso (tr) dentro do HTML: escapa o que o HTML interpretaria. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function loginPage(): string {
  // Dentro do <script>: JSON com "<" escapado, para nenhum texto fechar a tag.
  const js = (text: string) => JSON.stringify(text).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>${esc(tr('AIOffice · Acesso Móvel'))}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/assets/brand/logo-mark.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="AIOffice">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#121520">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    background: #111420 radial-gradient(circle at 50% 15%, rgba(60, 75, 120, 0.18) 0%, transparent 60%);
    color: #e5e9f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: #181c2b;
    border: 1px solid #2e354e;
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .brand-logo {
    width: 44px;
    height: 44px;
    image-rendering: pixelated;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 4px;
    border: 1px solid #333c56;
  }
  .brand-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .brand-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h1 {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f4c95d;
  }
  .tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(244, 201, 93, 0.15);
    color: #f4c95d;
    border: 1px solid rgba(244, 201, 93, 0.3);
  }
  .brand-sub {
    font-size: 12px;
    color: #8c96b5;
  }
  .desc {
    margin-bottom: 18px;
    color: #a3adc9;
    font-size: 13px;
    line-height: 1.5;
  }
  .field {
    margin-bottom: 16px;
  }
  .field-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12px;
    font-weight: 600;
    color: #8c96b5;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  input {
    width: 100%;
    height: 52px;
    padding: 0 16px;
    font: 700 24px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.3em;
    text-align: center;
    text-transform: uppercase;
    color: #ffffff;
    background: #0f121d;
    border: 2px solid #363e5c;
    border-radius: 8px;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
  }
  input:focus {
    outline: none;
    border-color: #f4c95d;
    box-shadow: 0 0 0 3px rgba(244, 201, 93, 0.2);
  }
  .paste-btn {
    margin-top: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 0;
    color: #f4c95d;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 0;
  }
  .paste-btn:hover {
    text-decoration: underline;
  }
  button[type="submit"] {
    width: 100%;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    color: #121520;
    background: linear-gradient(180deg, #fce182 0%, #f4c95d 100%);
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(244, 201, 93, 0.3);
    transition: transform 0.1s, opacity 0.15s, filter 0.15s;
    touch-action: manipulation;
  }
  button[type="submit"]:hover {
    filter: brightness(1.05);
  }
  button[type="submit"]:active {
    transform: scale(0.98);
  }
  button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: wait;
    transform: none;
  }
  .security-note {
    margin: 16px 0 0;
    padding: 10px 12px;
    border-left: 3px solid #f4c95d;
    background: rgba(244, 201, 93, 0.08);
    border-radius: 0 6px 6px 0;
    color: #f1d89b;
    font-size: 11px;
    line-height: 1.5;
  }
  #err {
    min-height: 20px;
    margin-top: 12px;
    color: #ff7b72;
    font-size: 13px;
    text-align: center;
    font-weight: 600;
  }
  #err:empty {
    display: none;
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <img src="/assets/brand/logo-mark.png" width="44" height="44" alt="AIOffice" class="brand-logo" onerror="this.style.display='none'">
    <div class="brand-meta">
      <div class="brand-title-row">
        <h1>AIOffice</h1>
        <span class="tag">${esc(tr('Móvel'))}</span>
      </div>
      <span class="brand-sub">${esc(tr('Escritório Virtual'))}</span>
    </div>
  </div>
  <p class="desc">${esc(tr('Acesse seu escritório com o código temporário gerado no painel local do AIOffice.'))}</p>
  <form id="f" autocomplete="on">
    <div class="field">
      <div class="field-label-row">
        <label for="c">${esc(tr('Código de acesso'))}</label>
        <button type="button" class="paste-btn" id="p" title="${esc(tr('Colar código copiado'))}">📋 ${esc(tr('Colar código'))}</button>
      </div>
      <div class="input-wrap">
        <input id="c" name="code" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" minlength="${LOGIN_CODE_LENGTH}" maxlength="${LOGIN_CODE_LENGTH}" placeholder="••••••" autofocus required>
      </div>
    </div>
    <button id="b" type="submit">${esc(tr('Entrar'))}</button>
    <div id="err" role="alert"></div>
  </form>
  <p class="security-note">${esc(tr('Este link usa um endereço temporário do Cloudflare. Se o Chrome marcar o site como perigoso, não prossiga nem informe o código. Trocar a senha por um código não remove um alerta do Safe Browsing.'))}</p>
</div>
<script>
  const f = document.getElementById('f'), b = document.getElementById('b'), c = document.getElementById('c'), p = document.getElementById('p'), err = document.getElementById('err');
  function formatCode() {
    c.value = c.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    if (c.value.length === 6) {
      f.requestSubmit();
    }
  }
  c.addEventListener('input', formatCode);
  if (p && navigator.clipboard && navigator.clipboard.readText) {
    p.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          c.value = text.trim();
          formatCode();
          c.focus();
        }
      } catch {}
    });
  } else if (p) {
    p.style.display = 'none';
  }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    b.disabled = true; err.textContent = '';
    const cleanCode = c.value.replace(/[\\s-]/g, '').toUpperCase();
    if (cleanCode.length !== 6) {
      err.textContent = ${js(tr('O código precisa ter 6 caracteres.'))};
      b.disabled = false;
      c.focus();
      return;
    }
    try {
      const r = await fetch('/api/remote/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ code: cleanCode }) });
      if (r.ok) { location.replace('/'); return; }
      const body = await r.json().catch(() => ({}));
      err.textContent = body.error || ${js(tr('Não deu para entrar.'))};
    } catch { err.textContent = ${js(tr('Sem conexão com o AIOffice.'))}; }
    b.disabled = false;
  });
</script>
</body>
</html>
`;
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(html);
}

function cookieHeader(value: string, maxAgeS: number, secure: boolean): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`;
}

export interface RemoteGateDeps {
  config: Pick<RemoteConfig, 'user'> & { allow?: ReadonlySet<RemoteFeature> };
  sessions: RemoteSessions;
  loginCodes: RemoteLoginCodes;
  /** Deve ser true: a porta remota fala exclusivamente HTTPS. */
  secure: true;
  throttle?: LoginThrottle;
}

/**
 * Filtro da porta remota, depois do guard (Host/Origin/JSON) e antes da API: devolve true quando já respondeu (login,
 * logout, 401, redirecionamento, CA) e false quando a requisição está autenticada — e então a marca como remota.
 */
export function createRemoteGate(deps: RemoteGateDeps): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  if (deps.secure !== true) throw new Error('Remote access requires HTTPS');
  const throttle = deps.throttle ?? new LoginThrottle();
  return (req, res, url) => {
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const authed = deps.sessions.verify(readCookie(req.headers.cookie, COOKIE));

    // A porta remota exige a origem exata, incluindo esquema e porta. O guard local aceita aliases locais.
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== `https://${req.headers.host}`) {
        req.resume();
        sendJson(res, 403, { error: tr('Origem não permitida.') });
        return true;
      }
      if (!isJsonContentType(req.headers['content-type'])) {
        req.resume();
        sendJson(res, 415, { error: tr('Envie o corpo como JSON (Content-Type: application/json).') });
        return true;
      }
    }

    if (authed) deps.sessions.touch(readCookie(req.headers.cookie, COOKIE));

    if (path === '/api/remote/login') {
      if (method !== 'POST') {
        sendJson(res, 405, { error: tr('método não permitido') }, { Allow: 'POST' });
        return true;
      }
      const forwarded = req.headers['cf-connecting-ip'];
      const peer = req.socket.remoteAddress ?? '';
      const peerIsLoopback = peer === '127.0.0.1' || peer === '::1' || peer.startsWith('::ffff:127.');
      const ip = peerIsLoopback && typeof forwarded === 'string' && isIP(forwarded.trim()) ? forwarded.trim() : 'local';
      const tooMany = () => {
        const wait = Math.max(1, throttle.retryAfter(ip));
        sendJson(res, 429, { error: tr('Muitas tentativas. Tente de novo em {0} s.', [wait]) }, { 'Retry-After': String(wait) });
      };
      if (throttle.retryAfter(ip) > 0) {
        req.resume();
        tooMany();
        return true;
      }
      // A tentativa só começa (e ocupa o freio) com o corpo inteiro na mão: um corpo que nunca termina não trava o
      // login de mais ninguém.
      let begun = false;
      let ok = false;
      readBody(req)
        .then(async (raw) => {
          if (!throttle.begin(ip)) return tooMany();
          begun = true;
          let body: { code?: unknown } = {};
          try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
          } catch {
            // corpo inválido: cai na recusa abaixo
          }
          const code = typeof body.code === 'string' ? body.code : '';
          if (!deps.loginCodes.consume(code)) return sendJson(res, 401, { error: tr('Código incorreto, expirado ou já utilizado.') });
          ok = true;
          const { token, maxAgeS } = deps.sessions.issue(req.headers['user-agent']);
          sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(token, maxAgeS, deps.secure) });
        })
        .catch(() => {
          if (!res.headersSent) sendJson(res, 400, { error: tr('requisição inválida') });
        })
        .finally(() => {
          if (begun) throttle.end(ok, ip);
        });
      return true;
    }

    if (path === '/api/remote/logout') {
      req.resume();
      if (method !== 'POST') sendJson(res, 405, { error: tr('método não permitido') }, { Allow: 'POST' });
      else {
        deps.sessions.revoke(readCookie(req.headers.cookie, COOKIE));
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0, deps.secure) });
      }
      return true;
    }

    if (path === '/login') {
      req.resume();
      if (authed) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        res.end();
      } else sendHtml(res, loginPage());
      return true;
    }

    if (authed) {
      if (!remoteRouteAllowed(path, method, deps.config.allow ?? new Set())) {
        req.resume();
        sendJson(res, 403, { error: tr('recurso indisponível no acesso remoto') });
        return true;
      }
      remoteRequests.add(req);
      remoteCapabilities.set(req, deps.config.allow ?? new Set());
      if (LONG_LIVED_REMOTE.test(path)) closeWhenRemoteSessionEnds(res, deps.sessions, readCookie(req.headers.cookie, COOKIE));
      return false;
    }
    // Ícone e manifesto do app (Tela de Início): públicos, o celular os busca antes do login (e sem o cookie).
    if ((method === 'GET' || method === 'HEAD') && PUBLIC_STATIC.test(path)) {
      remoteRequests.add(req);
      return false;
    }

    req.resume();
    if (path === '/api' || path.startsWith('/api/')) {
      sendJson(res, 401, { error: tr('faça login: abra o AIOffice pelo link e informe o código temporário gerado no painel local') });
    } else {
      res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
      res.end();
    }
    return true;
  };
}

/** Política adicional da porta remota, aplicada antes de encaminhar à API compartilhada. */
export function remoteRouteAllowed(path: string, method: string, allow: ReadonlySet<RemoteFeature>): boolean {
  const read = method === 'GET' || method === 'HEAD';
  if (path === '/api/updates/health' || path === '/api/updates/shutdown') return false;
  if (path.startsWith('/api/pty') || /^\/api\/agents\/[^/]+\/(stop|takeover)$/.test(path)) return false;
  // Hooks, bridges, inbox e eventos de integração pertencem exclusivamente à porta local.
  if (path.startsWith('/api/codex/') || path.startsWith('/api/aioffice/') || path.startsWith('/api/mod/')) return false;
  if (/^\/api\/agents\/[^/]+\/terminal$/.test(path) || path.startsWith('/api/sessions/')) return read && allow.has('terminal');
  if (path === '/api/permissions' || path.startsWith('/api/permissions/')) {
    return allow.has('permissions') && (read && /^\/api\/permissions\/[^/]+$/.test(path) || method === 'POST' && /^\/api\/permissions\/[^/]+\/decision$/.test(path));
  }
  if (path === '/api/messages' || /^\/api\/messages\/[^/]+$/.test(path)) {
    return allow.has('messages') && (read || (method === 'POST' && path === '/api/messages'));
  }
  // Toda outra escrita fica bloqueada, inclusive demo, personagens, salas e novas rotas futuras.
  return read;
}

export interface RemoteListener {
  /** Servidor HTTPS separado da porta HTTP local. */
  server: https.Server;
  close(): void;
}

/**
 * Sobe exclusivamente HTTPS. O certificado recarrega quando muda, preservando conexões existentes.
 */
export function startRemoteListener(
  cfg: Pick<RemoteConfig, 'port' | 'host' | 'tls'>,
  onRequest: (req: IncomingMessage, res: ServerResponse) => void,
  log: { info(m: string): void; warn(m: string): void; error(m: string): void },
  _allowedHosts: ReadonlySet<string> = new Set(),
): RemoteListener {
  if (!cfg.tls) throw new Error('Remote access requires HTTPS');
  const tls = cfg.tls;
  const read = () => ({ key: readFileSync(tls.keyFile), cert: readFileSync(tls.certFile) });
  const secure = https.createServer({ ...read(), minVersion: 'TLSv1.2' }, onRequest);
  secure.headersTimeout = 15_000;
  secure.requestTimeout = 30_000;
  secure.keepAliveTimeout = 5_000;
  secure.on('tlsClientError', () => {
    // O handshake local é entre cloudflared e o servidor; o celular recebe o certificado público do Quick Tunnel.
  });
  const reload = () => {
    try {
      secure.setSecureContext(read());
      log.info(tr('   Acesso remoto: certificado recarregado.'));
    } catch (err) {
      log.warn(tr('   Acesso remoto: certificado novo ilegível, mantendo o anterior ({0}).', [(err as Error).message]));
    }
  };
  const watch = (cur: import('node:fs').Stats, prev: import('node:fs').Stats) => {
    if (cur.mtimeMs !== prev.mtimeMs || cur.ino !== prev.ino) reload();
  };
  watchFile(tls.certFile, { interval: 15_000, persistent: false }, watch);
  secure.once('error', () => unwatchFile(tls.certFile, watch));
  secure.on('error', (err) => log.error(tr('Acesso remoto: não deu para escutar na porta {0} ({1}).', [cfg.port, err.message])));
  secure.listen(cfg.port, cfg.host);
  return {
    server: secure,
    close: () => {
      unwatchFile(tls.certFile, watch);
      secure.close();
      secure.closeAllConnections();
    },
  };
}
