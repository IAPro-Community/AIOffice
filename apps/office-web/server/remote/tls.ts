// HTTPS da porta remota: uma autoridade certificadora (CA) local, criada uma vez por instalação, e o certificado do
// servidor assinado por ela. O celular confia na CA uma vez (instalando o ca.crt) e daí em diante a conexão é
// cifrada e sem aviso. OpenSSL vem do PATH ou do Git for Windows.
//
// Pastas (padrão ~/.habblaud/remote-tls, permissão 700):
//   ca/ca.key, ca/ca.crt            a CA: a chave NUNCA sai daqui (não vai para o container)
//   ca/constraints.json             os nomes que a CA pode assinar (ver abaixo)
//   server/server.key, server.crt   o certificado do servidor (o docker-up monta SÓ esta pasta, somente leitura)
//   server/ca.crt                   cópia pública da CA, servida em /remote/ca.crt para instalar no celular
//
// O certificado do servidor vale 397 dias (o limite que a Apple aceita) e cobre localhost, <nome>.local e os IPs da
// rede local; ensureServerCert o refaz quando falta um nome/IP (o IP do Wi-Fi mudou) ou quando faltam 30 dias.
//
// A CA é restrita (nameConstraints, crítico): só vale para localhost, nomes .local, o endereço próprio escolhido no
// setup e IPs de rede privada. Mesmo que a chave dela vaze, um certificado para qualquer outro site é recusado pelo
// celular que confia nela. Trocar o endereço próprio pede uma CA nova (e instalar o certificado de novo no celular).
import { spawnSync } from 'node:child_process';
import { createPrivateKey, randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { tr } from '../../shared/i18n';

export const CA_DAYS = 3650;
export const SERVER_DAYS = 397;
export const RENEW_BEFORE_DAYS = 30;

export interface TlsPaths {
  base: string;
  caDir: string;
  caKey: string;
  caCert: string;
  serverDir: string;
  serverKey: string;
  serverCert: string;
  publicCa: string;
}

export function tlsPaths(base: string): TlsPaths {
  const caDir = join(base, 'ca');
  const serverDir = join(base, 'server');
  return {
    base,
    caDir,
    caKey: join(caDir, 'ca.key'),
    caCert: join(caDir, 'ca.crt'),
    serverDir,
    serverKey: join(serverDir, 'server.key'),
    serverCert: join(serverDir, 'server.crt'),
    publicCa: join(serverDir, 'ca.crt'),
  };
}

/** Faixas de IPv4 que a CA pode assinar: loopback, redes privadas e a 100.64/10 (CGNAT, a do Tailscale). */
const PRIVATE_V4: ReadonlyArray<readonly [string, string]> = [
  ['127.0.0.0', '255.0.0.0'],
  ['10.0.0.0', '255.0.0.0'],
  ['172.16.0.0', '255.240.0.0'],
  ['192.168.0.0', '255.255.0.0'],
  ['100.64.0.0', '255.192.0.0'],
];

function v4(ip: string): number | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  return parts.some((n) => n > 255) ? undefined : (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/** IPv4 de rede privada (o que a CA pode assinar). */
export function isPrivateIpv4(ip: string): boolean {
  const n = v4(ip);
  return n !== undefined && PRIVATE_V4.some(([net, mask]) => ((n & v4(mask)!) >>> 0) === v4(net));
}

/** IPv4 da rede local (sem loopback, link-local 169.254 nem endereço público). */
export function lanAddresses(ifaces = networkInterfaces()): string[] {
  const out = new Set<string>();
  for (const list of Object.values(ifaces)) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && isPrivateIpv4(a.address)) out.add(a.address);
    }
  }
  return [...out].sort();
}

/** Nome mDNS do computador (<nome>.local), que o celular acha mesmo quando o IP muda. */
export function localDnsName(run = spawnSync): string | undefined {
  // O Windows usa o IP da LAN: o hostname não garante um serviço mDNS disponível.
  if (process.platform === 'win32') return undefined;
  if (process.platform === 'darwin') {
    const r = run('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' });
    const name = typeof r.stdout === 'string' ? r.stdout.trim() : '';
    if (r.status === 0 && /^[A-Za-z0-9-]{1,63}$/.test(name)) return `${name.toLowerCase()}.local`;
  }
  const short = hostname().split('.')[0];
  return /^[A-Za-z0-9-]{1,63}$/.test(short) ? `${short.toLowerCase()}.local` : undefined;
}

export interface CertTargets {
  dns: string[];
  ips: string[];
}

export function defaultTargets(): CertTargets {
  const dns = ['localhost'];
  const local = localDnsName();
  if (local) dns.push(local);
  return { dns, ips: ['127.0.0.1', ...lanAddresses()] };
}

/** Nomes e IPs (subjectAltName) de um certificado PEM. */
export function certTargets(pem: string | Buffer): CertTargets {
  const san = new X509Certificate(pem).subjectAltName ?? '';
  const dns: string[] = [];
  const ips: string[] = [];
  for (const part of san.split(',')) {
    const [kind, ...rest] = part.trim().split(':');
    const value = rest.join(':');
    if (kind === 'DNS') dns.push(value.toLowerCase());
    else if (kind === 'IP Address') ips.push(value);
  }
  return { dns, ips };
}

export type CertStatus = { ok: true; expiresAt: Date } | { ok: false; reason: string };

/** O certificado do servidor serve como está? (existe, foi assinado por esta CA, cobre tudo e não está perto de vencer) */
export function serverCertStatus(paths: TlsPaths, wanted: CertTargets, now = new Date()): CertStatus {
  if (!existsSync(paths.serverCert) || !existsSync(paths.serverKey)) return { ok: false, reason: tr('certificado do servidor ainda não existe') };
  if (!existsSync(paths.caCert)) return { ok: false, reason: tr('a CA local não existe') };
  let cert: X509Certificate;
  let ca: X509Certificate;
  try {
    cert = new X509Certificate(readFileSync(paths.serverCert));
    ca = new X509Certificate(readFileSync(paths.caCert));
  } catch {
    return { ok: false, reason: tr('certificado ilegível') };
  }
  if (!cert.verify(ca.publicKey)) return { ok: false, reason: tr('certificado não foi assinado pela CA atual') };
  try {
    if (!cert.checkPrivateKey(createPrivateKey(readFileSync(paths.serverKey)))) return { ok: false, reason: tr('a chave não corresponde ao certificado') };
  } catch {
    return { ok: false, reason: tr('chave privada ilegível') };
  }
  if (new Date(cert.validFrom).getTime() > now.getTime() || new Date(ca.validTo).getTime() <= now.getTime()) {
    return { ok: false, reason: tr('certificado fora do prazo de validade') };
  }
  const expiresAt = new Date(cert.validTo);
  if (expiresAt.getTime() - now.getTime() < RENEW_BEFORE_DAYS * 86_400_000) return { ok: false, reason: tr('certificado perto de vencer') };
  const have = certTargets(readFileSync(paths.serverCert));
  const missing = [...wanted.dns.filter((d) => !have.dns.includes(d.toLowerCase())), ...wanted.ips.filter((ip) => !have.ips.includes(ip))];
  if (missing.length) return { ok: false, reason: tr('faltam no certificado: {0}', [missing.join(', ')]) };
  return { ok: true, expiresAt };
}

type Run = typeof spawnSync;

/** Git for Windows inclui OpenSSL mesmo quando o executável não aparece no PATH. */
export function opensslExecutable(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === 'win32') {
    const candidates = [
      join(env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
      'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
      join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'usr', 'bin', 'openssl.exe'),
    ];
    const found = candidates.find((file) => existsSync(file));
    if (found) return found;
  }
  return 'openssl';
}

function openssl(run: Run, args: string[]): void {
  const r = run(opensslExecutable(), args, { encoding: 'utf8', windowsHide: true });
  if (r.error) throw new Error(tr('não achei o openssl ({0}); instale-o e rode de novo', [r.error.message]));
  if (r.status !== 0) throw new Error(tr('openssl {0} falhou: {1}', [args[0], String(r.stderr).trim().split('\n').slice(-2).join(' ')]));
}

function ensureDir(dir: string, mode: number): void {
  mkdirSync(dir, { recursive: true, mode });
  chmodSync(dir, mode);
}

function constraintsFile(paths: TlsPaths): string {
  return join(paths.caDir, 'constraints.json');
}

/** Nomes (DNS) que a CA pode assinar: localhost, tudo que termina em .local e os `domains` (com os subdomínios). */
export function caDomains(domains: readonly string[] = []): string[] {
  if (domains.some((d) => !isValidDomain(d.trim().toLowerCase()))) throw new Error('Invalid certificate domain');
  return [...new Set(['localhost', 'local', ...domains.map((d) => d.trim().toLowerCase()).filter(Boolean)])];
}

/** A CA desta pasta pode assinar todos os `targets`? (CA antiga, sem restrição, não serve.) */
export function caCovers(paths: TlsPaths, targets: CertTargets): boolean {
  let allowed: string[];
  try {
    const raw: unknown = JSON.parse(readFileSync(constraintsFile(paths), 'utf8'));
    allowed = Array.isArray((raw as { dns?: unknown }).dns) ? ((raw as { dns: unknown[] }).dns.filter((d) => typeof d === 'string') as string[]) : [];
  } catch {
    return false;
  }
  const okName = (name: string) => allowed.some((a) => name === a || name.endsWith(`.${a}`));
  return targets.dns.every((d) => okName(d.toLowerCase())) && targets.ips.every(isPrivateIpv4);
}

/** Linhas do openssl.cnf com a restrição de nomes da CA. */
export function nameConstraintLines(dns: readonly string[]): string[] {
  return [
    'nameConstraints = critical,@name_constraints',
    '[name_constraints]',
    ...dns.map((d, i) => `permitted;DNS.${i} = ${d}`),
    ...PRIVATE_V4.map(([net, mask], i) => `permitted;IP.${i} = ${net}/${mask}`),
  ];
}

/**
 * Cria a CA local se ainda não existe. Devolve true quando criou. `domains`: endereços próprios que ela poderá assinar
 * (além de localhost e .local).
 */
export function ensureCa(paths: TlsPaths, label: string, run: Run = spawnSync, domains: readonly string[] = []): boolean {
  if (existsSync(paths.caKey) && existsSync(paths.caCert)) return false;
  ensureDir(paths.base, 0o700);
  ensureDir(paths.caDir, 0o700);
  const dns = caDomains(domains);
  const work = join(tmpdir(), `habblaud-ca-${randomBytes(6).toString('hex')}`);
  mkdirSync(work, { mode: 0o700 });
  try {
    const cnf = join(work, 'ca.cnf');
    writeFileSync(
      cnf,
      [
        '[req]',
        'distinguished_name = dn',
        'prompt = no',
        'x509_extensions = v3_ca',
        '[dn]',
        `CN = Habblaud local CA (${label.replace(/[^A-Za-z0-9 .-]/g, '')})`,
        'O = Habblaud',
        '[v3_ca]',
        'basicConstraints = critical,CA:TRUE,pathlen:0',
        'keyUsage = critical,keyCertSign,cRLSign',
        'subjectKeyIdentifier = hash',
        ...nameConstraintLines(dns),
        '',
      ].join('\n'),
    );
    const key = join(work, 'ca.key');
    const crt = join(work, 'ca.crt');
    openssl(run, ['req', '-x509', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', String(CA_DAYS), '-keyout', key, '-out', crt, '-config', cnf]);
    chmodSync(key, 0o600);
    writeFileSync(constraintsFile(paths), `${JSON.stringify({ dns })}\n`, { mode: 0o600 });
    renameSync(key, paths.caKey);
    renameSync(crt, paths.caCert);
    return true;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Mantém a cópia pública da CA atualizada, sem copiar conteúdo extra ou publicar um arquivo parcial. */
function ensurePublicCa(paths: TlsPaths): void {
  const ca = new X509Certificate(readFileSync(paths.caCert));
  if (!ca.ca) throw new Error('O certificado da CA local é inválido.');
  const pem = Buffer.from(`${ca.toString().trimEnd()}\n`, 'utf8');
  if (existsSync(paths.publicCa) && readFileSync(paths.publicCa).equals(pem)) return;
  const temporary = `${paths.publicCa}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, pem, { mode: 0o644, flag: 'wx' });
    chmodSync(temporary, 0o644);
    renameSync(temporary, paths.publicCa);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

/** Emite (de novo) o certificado do servidor, assinado pela CA, cobrindo `targets`. Troca os arquivos de uma vez. */
export function issueServerCert(paths: TlsPaths, targets: CertTargets, run: Run = spawnSync): void {
  validateTargets(targets);
  if (!existsSync(paths.caKey) || !existsSync(paths.caCert)) throw new Error(tr('a CA local não existe: rode npm run remote:setup'));
  ensureDir(paths.serverDir, 0o700);
  const work = join(tmpdir(), `habblaud-cert-${randomBytes(6).toString('hex')}`);
  mkdirSync(work, { mode: 0o700 });
  try {
    const key = join(work, 'server.key');
    const csr = join(work, 'server.csr');
    const crt = join(work, 'server.crt');
    const ext = join(work, 'server.ext');
    const cn = targets.dns.find((d) => d.endsWith('.local')) ?? 'localhost';
    writeFileSync(
      ext,
      [
        'basicConstraints = critical,CA:FALSE',
        'keyUsage = critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage = serverAuth',
        'subjectKeyIdentifier = hash',
        'authorityKeyIdentifier = keyid,issuer',
        `subjectAltName = ${[...targets.dns.map((d) => `DNS:${d}`), ...targets.ips.map((ip) => `IP:${ip}`)].join(',')}`,
        '',
      ].join('\n'),
    );
    openssl(run, ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-keyout', key, '-out', csr, '-subj', `/CN=${cn}/O=Habblaud`]);
    openssl(run, [
      'x509', '-req', '-in', csr, '-CA', paths.caCert, '-CAkey', paths.caKey, '-sha256', '-days', String(SERVER_DAYS),
      '-set_serial', `0x${randomBytes(16).toString('hex')}`, '-extfile', ext, '-out', crt,
    ]);
    // A chave fica restrita ao proprietário em sistemas POSIX; no Windows valem as ACLs do perfil.
    chmodSync(key, 0o600);
    chmodSync(crt, 0o644);
    // Troca atômica (rename), na ordem chave -> certificado: quem recarrega ao ver o certificado novo já acha a chave nova.
    renameSync(key, paths.serverKey);
    renameSync(crt, paths.serverCert);
    ensurePublicCa(paths);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export interface EnsureResult {
  createdCa: boolean;
  issued: boolean;
  reason?: string;
  targets: CertTargets;
}

/** Endereços próprios dos `targets` (o que não é localhost nem .local), para a restrição de nomes da CA. */
function ownDomains(targets: CertTargets): string[] {
  return targets.dns.filter((d) => d !== 'localhost' && !d.endsWith('.local'));
}

/**
 * Garante a CA e um certificado de servidor válido para os nomes/IPs de agora (refaz só quando precisa). IPs fora das
 * redes privadas ficam de fora. Se a CA não cobre os nomes (endereço próprio novo, ou CA antiga sem restrição): com
 * `newCa` (o setup) cria outra; sem ele, falha pedindo o setup.
 */
export function ensureServerCert(paths: TlsPaths, wanted: CertTargets = defaultTargets(), opts: { force?: boolean; run?: Run; newCa?: boolean; rotateCa?: boolean } = {}): EnsureResult {
  validateTargets(wanted);
  const run = opts.run ?? spawnSync;
  const targets: CertTargets = { dns: wanted.dns, ips: wanted.ips.filter(isPrivateIpv4) };
  if (opts.rotateCa && existsSync(paths.caDir)) {
    const parent = dirname(paths.base);
    const stageRoot = join(parent, `.remote-tls-stage-${randomBytes(8).toString('hex')}`);
    const backupRoot = join(parent, `.remote-tls-backup-${randomBytes(8).toString('hex')}`);
    const stagePaths = tlsPaths(stageRoot);
    const backupPaths = tlsPaths(backupRoot);
    let movedCa = false;
    let movedServer = false;
    let committed = false;
    let installedCa = false;
    let installedServer = false;
    let preserveBackup = false;
    try {
      const staged = ensureServerCert(stagePaths, targets, { run });
      mkdirSync(backupRoot, { mode: 0o700 });
      renameSync(paths.caDir, backupPaths.caDir);
      movedCa = true;
      if (existsSync(paths.serverDir)) {
        renameSync(paths.serverDir, backupPaths.serverDir);
        movedServer = true;
      }
      renameSync(stagePaths.caDir, paths.caDir);
      installedCa = true;
      renameSync(stagePaths.serverDir, paths.serverDir);
      installedServer = true;
      committed = true;
      rmSync(backupRoot, { recursive: true, force: true });
      return { ...staged, createdCa: true, issued: true, reason: tr('CA nova') };
    } catch (error) {
      if (movedCa || movedServer || installedCa || installedServer) {
        try {
          if (installedCa) rmSync(paths.caDir, { recursive: true, force: true });
          if (installedServer) rmSync(paths.serverDir, { recursive: true, force: true });
          if (movedCa) renameSync(backupPaths.caDir, paths.caDir);
          if (movedServer) renameSync(backupPaths.serverDir, paths.serverDir);
        } catch (restoreError) {
          preserveBackup = true;
          throw new Error(`Falha ao trocar a CA e restaurar a anterior (${String(restoreError)}). Cópia anterior preservada em ${backupRoot}.`);
        }
      }
      throw error;
    } finally {
      rmSync(stageRoot, { recursive: true, force: true });
      if (!committed && !preserveBackup) rmSync(backupRoot, { recursive: true, force: true });
    }
  }
  if (existsSync(paths.caKey) && existsSync(paths.caCert) && !caCovers(paths, targets)) {
    if (!opts.newCa) throw new Error(tr('a CA local não cobre {0}: repita com --new-ca e reinstale a CA nos dispositivos', [targets.dns.join(', ')]));
    rmSync(paths.caDir, { recursive: true, force: true });
    rmSync(paths.serverDir, { recursive: true, force: true });
  }
  const createdCa = ensureCa(paths, targets.dns.find((d) => d.endsWith('.local')) ?? 'habblaud', run, ownDomains(targets));
  const status = serverCertStatus(paths, targets);
  if (!opts.force && !createdCa && status.ok) {
    ensurePublicCa(paths);
    return { createdCa, issued: false, targets };
  }
  issueServerCert(paths, targets, run);
  return { createdCa, issued: true, reason: opts.force ? tr('pedido') : status.ok ? tr('CA nova') : status.reason, targets };
}

/** SHA-256 da CA, para conferir no celular antes de confiar nela. */
export function caFingerprint(paths: TlsPaths): string | undefined {
  try {
    return new X509Certificate(readFileSync(paths.caCert)).fingerprint256;
  } catch {
    return undefined;
  }
}

/** Pasta das chaves do acesso remoto (~/.habblaud/remote-tls). */
export function remoteTlsBase(home: string): string {
  return join(home, '.habblaud', 'remote-tls');
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Nome curto para <nome>.local (letras, números e hífen). */
export function isValidName(name: string): boolean {
  return LABEL.test(name);
}

/** Endereço próprio (ex.: meuclaude.home): 2+ partes válidas, sem ponto final nem IP. */
export function isValidDomain(domain: string): boolean {
  const parts = domain.split('.');
  return domain.length <= 253 && parts.length >= 2 && parts.every((p) => LABEL.test(p)) && !/^\d+$/.test(parts[parts.length - 1]);
}

function validateTargets(targets: CertTargets): void {
  if (!targets.dns.length && !targets.ips.length) throw new Error('Certificate requires at least one address');
  if (targets.dns.some((name) => name !== 'localhost' && !isValidDomain(name))) throw new Error('Invalid certificate domain');
  if (targets.ips.some((ip) => !isPrivateIpv4(ip))) throw new Error('Certificate addresses must be private IPv4 addresses');
}

/** Nomes do certificado: os padrões (localhost, <computador>.local, IPs) + <nome>.local + o endereço próprio. */
export function remoteTargets(opts: { name?: string; domain?: string }, base: CertTargets = defaultTargets()): CertTargets {
  if (opts.name && !isValidName(opts.name)) throw new Error('Invalid certificate name');
  if (opts.domain && !isValidDomain(opts.domain)) throw new Error('Invalid certificate domain');
  const dns = [...base.dns];
  for (const n of [opts.name ? `${opts.name}.local` : undefined, opts.domain]) {
    const v = n?.trim().toLowerCase();
    if (v && !dns.includes(v)) dns.push(v);
  }
  return { dns, ips: [...base.ips] };
}

/** IPv4 da interface da rota padrão (o Wi-Fi/cabo de verdade); sem ela, o primeiro IP da rede local. */
export function primaryIp(platform: NodeJS.Platform = process.platform): string | undefined {
  let iface: string | undefined;
  if (platform === 'darwin') {
    const r = spawnSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' });
    iface = /interface:\s*(\S+)/.exec(String(r.stdout))?.[1];
  } else if (platform === 'linux') {
    const r = spawnSync('ip', ['route', 'show', 'default'], { encoding: 'utf8' });
    iface = /\bdev\s+(\S+)/.exec(String(r.stdout))?.[1];
  }
  const addr = iface ? networkInterfaces()[iface]?.find((a) => a.family === 'IPv4' && !a.internal)?.address : undefined;
  return addr ?? lanAddresses()[0];
}
