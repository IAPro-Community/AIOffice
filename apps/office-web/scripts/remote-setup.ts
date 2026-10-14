// Configuração explícita do acesso remoto. Não é executada ao iniciar o servidor.
// Usa IP da LAN/VPN e HTTPS; não instala serviços, VPN, regras de firewall ou encaminhamento de portas.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAllow } from '../server/http/remote';
import { readEnvValue, updateEnv } from '../server/remote/envfile';
import { hashPassword } from '../server/remote/password';
import { caFingerprint, ensureServerCert, lanAddresses, primaryIp, remoteTargets, remoteTlsBase, tlsPaths } from '../server/remote/tls';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, '.env');
export const MIN_PASSWORD = 12;

export interface SetupArgs {
  user?: string;
  port: number;
  allow: string;
  domain?: string;
  newCa: boolean;
  passwordStdin: boolean;
  off: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): SetupArgs {
  const out: SetupArgs = { port: 4748, allow: 'none', newCa: false, passwordStdin: false, off: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith('--')) throw new Error(`Falta o valor de ${arg}.`);
      return next;
    };
    if (arg === '--user') out.user = value().trim();
    else if (arg === '--port') out.port = Number(value());
    else if (arg === '--allow') out.allow = value().toLowerCase();
    else if (arg === '--domain') out.domain = value().toLowerCase();
    else if (arg === '--new-ca') out.newCa = true;
    else if (arg === '--password-stdin') out.passwordStdin = true;
    else if (arg === '--off') out.off = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Opção desconhecida: ${arg}.`);
  }
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) throw new Error('Porta inválida.');
  const features = out.allow.split(',').map((s) => s.trim());
  if (features.some((s) => !['none', 'permissions', 'messages', 'terminal'].includes(s))) throw new Error('Capacidade remota inválida.');
  if (features.includes('none') && features.length > 1) throw new Error('Use none sozinho.');
  if (out.user !== undefined && !/^[\p{L}\p{N}_.@-]{1,64}$/u.test(out.user)) throw new Error('Usuário inválido.');
  // Valida nomes antes de qualquer alteração no disco.
  remoteTargets({ domain: out.domain });
  return out;
}

export function passwordProblem(password: string, user: string): string | undefined {
  if ([...password].length < MIN_PASSWORD || /\p{Cs}/u.test(password)) return `Use pelo menos ${MIN_PASSWORD} caracteres Unicode válidos.`;
  if (Buffer.byteLength(password, 'utf8') > 1024) return 'A senha excede 1024 bytes.';
  if (password.trim() !== password) return 'Evite espaços no começo ou no fim.';
  if (password.normalize('NFC').toLowerCase() === user.normalize('NFC').toLowerCase()) return 'A senha deve ser diferente do usuário.';
  return undefined;
}

export function remoteEnv(current: string, settings: { user: string; hash: string; port: number; allow: string; tlsDir: string; domain?: string }): string {
  const allowedHosts = new Set((readEnvValue(current, 'HABBLAUD_ALLOWED_HOSTS') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (settings.domain) allowedHosts.add(settings.domain);
  return updateEnv(current, {
    HABBLAUD_REMOTE_ENABLED: '1',
    HABBLAUD_REMOTE_USER: settings.user,
    HABBLAUD_REMOTE_PASSWORD_HASH: settings.hash,
    HABBLAUD_REMOTE_PASSWORD: null,
    HABBLAUD_REMOTE_HOST: '0.0.0.0',
    HABBLAUD_REMOTE_PORT: String(settings.port),
    HABBLAUD_REMOTE_ALLOW: [...parseAllow(settings.allow)].join(',') || 'none',
    HABBLAUD_REMOTE_TLS_DIR: JSON.stringify(settings.tlsDir.replace(/\\/g, '/')),
    HABBLAUD_REMOTE_INSECURE_HTTP: null,
    HABBLAUD_REMOTE_NAME: null,
    HABBLAUD_REMOTE_HTTP_PORT: null,
    HABBLAUD_REMOTE_DOMAIN: settings.domain ?? null,
    HABBLAUD_ALLOWED_HOSTS: allowedHosts.size ? [...allowedHosts].join(',') : null,
  });
}

function askHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) throw new Error('Sem terminal para perguntar a senha: use --password-stdin.');
  return new Promise((resolvePassword, reject) => {
    process.stdout.write(`${prompt}: `);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    let password = '';
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolvePassword(password);
          return;
        }
        if (ch === '\u0003' || ch === '\u0004') {
          cleanup();
          reject(new Error('Configuração cancelada.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') password = [...password].slice(0, -1).join('');
        else if (ch >= ' ') password += ch;
      }
    };
    input.on('data', onData);
  });
}

async function stdinPassword(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += String(chunk);
    if (Buffer.byteLength(data, 'utf8') > 2048) throw new Error('Entrada da senha grande demais.');
  }
  return data.split(/\r?\n/)[0] ?? '';
}

function writeEnv(content: string): void {
  const temporary = `${ENV_FILE}.remote-setup.tmp`;
  writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  chmodSync(temporary, 0o600);
  renameSync(temporary, ENV_FILE);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Uso: npm run remote:setup -- [--user nome] [--port 4748] [--allow none|permissions,messages,terminal] [--domain nome-da-vpn] [--new-ca] [--password-stdin] [--off]');
    console.log('Configura login e HTTPS por IP privado. Fora de casa, conecte computador e celular à mesma VPN privada.');
    console.log('--new-ca troca a CA se os novos endereços não forem cobertos; instale a nova CA em cada dispositivo.');
    console.log('Depois de configurar ou usar --off, reinicie o servidor para aplicar. --off preserva a conta e os certificados.');
    return;
  }
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  if (args.off) {
    writeEnv(updateEnv(current, { HABBLAUD_REMOTE_ENABLED: '0', HABBLAUD_REMOTE_PASSWORD: null, HABBLAUD_REMOTE_INSECURE_HTTP: null }));
    console.log('Acesso remoto desligado no .env; conta e certificados preservados. Reinicie o servidor para aplicar.');
    return;
  }
  let user = args.user;
  if (!user) {
    if (!process.stdin.isTTY) throw new Error('Informe --user quando usar entrada padrão.');
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try { user = (await readline.question(`Usuário [${userInfo().username}]: `)).trim() || userInfo().username; }
    finally { readline.close(); }
  }
  if (!/^[\p{L}\p{N}_.@-]{1,64}$/u.test(user)) throw new Error('Usuário inválido.');
  const password = args.passwordStdin ? await stdinPassword() : await askHidden('Senha');
  const problem = passwordProblem(password, user);
  if (problem) throw new Error(problem);
  if (!args.passwordStdin && password !== await askHidden('Repita a senha')) throw new Error('As senhas não conferem.');
  const hash = await hashPassword(password);
  const paths = tlsPaths(remoteTlsBase(process.env.HOME || homedir()));
  const targets = remoteTargets({ domain: args.domain });
  const hadCa = existsSync(paths.caCert);
  const certificate = ensureServerCert(paths, targets, { newCa: args.newCa, rotateCa: args.newCa });
  writeEnv(remoteEnv(current, { user, hash, port: args.port, allow: args.allow, tlsDir: paths.serverDir, domain: args.domain }));
  console.log('Login e HTTPS configurados. Reinicie o servidor para aplicar.');
  if (hadCa && certificate.createdCa) console.warn('A CA anterior foi substituída. Remova-a dos dispositivos e instale a nova CA mostrada abaixo.');
  const primary = primaryIp();
  const addresses = new Set([...(primary ? [primary] : []), ...lanAddresses(), ...(args.domain ? [args.domain] : [])]);
  for (const address of addresses) console.log(`https://${address}:${args.port}`);
  console.log(`CA pública: ${paths.publicCa}`);
  console.log(`Impressão digital SHA-256: ${caFingerprint(paths) ?? 'indisponível'}`);
  console.log('Instale somente essa CA no celular e confira a impressão digital antes de confiar.');
  console.log('Fora de casa: use o endereço privado da VPN, com ambos os dispositivos conectados.');
  if (process.platform === 'win32') console.log('No Windows, as chaves são protegidas pela ACL da pasta do usuário; chmod não substitui permissões NTFS.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
