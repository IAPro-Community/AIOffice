// Configuração do servidor a partir das variáveis de ambiente (documentadas em server/README.md).
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverClaudeDirs } from './accounts/detect';
import { parseAllowedHosts } from './http/guard';
import { parseGithubRepo } from './updates/checker';
import { tr } from '../shared/i18n';

export interface ServerConfig {
  port: number;
  host: string;
  /** `--dev`: Vite em middleware mode (HMR) no mesmo servidor. */
  dev: boolean;
  /** Liga o simulador de demonstração ao iniciar. */
  demo: boolean;
  /** Rodando dentro de um container (PIDs do registro são do host: não dá para checá-los). */
  inDocker: boolean;
  home: string;
  /** Config dirs do Claude Code observados (um por conta). */
  claudeDirs: string[];
  /** Onde o Habblaud guarda o próprio estado (nomes persistidos). */
  dataDir: string;
  /**
   * Pasta com o uso capturado pelo statusline do Claude Code (scripts/statusline-tap.mjs):
   * HABBLAUD_USAGE_DIR ou ~/.habblaud/usage. No Docker, o docker-up monta essa pasta em /usage.
   */
  usageDir: string;
  /** Nomes extras aceitos no cabeçalho Host/Origin (HABBLAUD_ALLOWED_HOSTS); localhost e IPs sempre valem. */
  allowedHosts: Set<string>;
  /**
   * Terminal (GET /api/agents/:id/terminal) ligado: só com bind local, isto é, com o Habblaud acessível apenas
   * pelo próprio computador (ver terminalOffReason). É a trava de tudo o que mostra ou age sobre as sessões.
   */
  terminal: boolean;
  /**
   * Mensagens pelo escritório (POST /api/messages e a caixa de entrada do plugin habblaud-mensagens) ligadas: a
   * trava do terminal e HABBLAUD_MENSAGENS sem desligar (ver messagesOffReason).
   */
  messages: boolean;
  /** Grava a linha do tempo do escritório para o timelapse (<dataDir>/timeline); HABBLAUD_TIMELINE=0 desliga. */
  timeline: boolean;
  /** Raiz do projeto (onde fica o package.json); serve dist/client a partir daqui. */
  rootDir: string;
  version: string;
  /** Repositório no GitHub ("dono/nome", do campo `repository` do package.json) onde saem as versões novas. */
  repo?: string;
  /** Consulta o GitHub atrás de versão nova (server/updates/checker.ts); HABBLAUD_UPDATE_CHECK=0 desliga. */
  updateCheck: boolean;
  /** Observa as sessões do Codex (sources/codex/); HABBLAUD_CODEX=0 desliga. */
  codex: boolean;
}

export function isTruthy(v: string | undefined): boolean {
  return !!v && /^(1|true|yes|sim|on)$/i.test(v.trim());
}

/** Sobe a partir de `from` até achar o package.json do projeto. */
export function findRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name;
        if (name === 'habblaud') return dir;
      } catch {
        // package.json ilegível: continua subindo
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(from, '..');
}

/** Versão e repositório do package.json. */
function readPackage(rootDir: string): { version: string; repo?: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version?: unknown; repository?: unknown };
    return { version: typeof pkg.version === 'string' ? pkg.version : '0.0.0', repo: parseGithubRepo(pkg.repository) };
  } catch {
    return { version: '0.0.0' };
  }
}

export function detectDocker(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HABBLAUD_IN_DOCKER !== undefined) return isTruthy(env.HABBLAUD_IN_DOCKER);
  return existsSync('/.dockerenv');
}

/**
 * Endereço de escuta que só o próprio computador alcança: 127.0.0.0/8, `::1` (com ou sem colchetes)
 * ou `localhost`. `0.0.0.0`, `::`, IPs de rede e nomes quaisquer não contam.
 */
export function isLoopbackBind(value: string | undefined): boolean {
  let v = value?.trim().toLowerCase() ?? '';
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  if (v === 'localhost') return true;
  const family = isIP(v);
  if (family === 4) return v.startsWith('127.');
  if (family !== 6) return false;
  try {
    // Forma canônica (0:0:0:0:0:0:0:1 -> [::1]).
    return new URL(`http://[${v}]/`).hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Por que o terminal fica desligado (undefined = ligado). Os transcripts têm a conversa inteira, então ele
 * só liga quando o Habblaud não fica exposto além do próprio computador:
 * - Node: o HABBLAUD_HOST precisa ser loopback;
 * - Docker: o processo sempre escuta em 0.0.0.0 dentro do container e quem decide a exposição é a porta
 *   publicada no host, HABBLAUD_BIND (o docker-compose.yml repassa o mesmo valor ao container). Ausente
 *   ou vazia = desligado: sem ela não dá para saber se a porta está exposta.
 * HABBLAUD_TERMINAL com qualquer valor que não seja "ligado" (0, false, off...) desliga; não existe forma
 * de ligar com a porta exposta.
 */
export function terminalOffReason(env: NodeJS.ProcessEnv, host: string, inDocker: boolean): string | undefined {
  const flag = env.HABBLAUD_TERMINAL?.trim();
  if (flag && !isTruthy(flag)) return `HABBLAUD_TERMINAL=${flag}`;
  if (inDocker) {
    const bind = env.HABBLAUD_BIND?.trim();
    if (!bind) return tr('HABBLAUD_BIND não chegou ao container, então a porta pode estar exposta na rede');
    return isLoopbackBind(bind) ? undefined : tr('a porta está exposta na rede: HABBLAUD_BIND={0}', [bind]);
  }
  return isLoopbackBind(host) ? undefined : tr('a porta está exposta na rede: HABBLAUD_HOST={0}', [host]);
}

/**
 * Por que as mensagens pelo escritório ficam desligadas (undefined = ligadas). Elas entram na sessão como se você
 * as tivesse digitado, então seguem a trava do terminal; HABBLAUD_MENSAGENS com qualquer valor que não seja
 * "ligado" (0, false, off, no...) desliga só elas.
 */
export function messagesOffReason(env: NodeJS.ProcessEnv, host: string, inDocker: boolean): string | undefined {
  const flag = env.HABBLAUD_MENSAGENS?.trim();
  if (flag && !isTruthy(flag)) return `HABBLAUD_MENSAGENS=${flag}`;
  const terminal = terminalOffReason(env, host, inDocker);
  return terminal ? tr('mesma trava do terminal: {0}', [terminal]) : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): ServerConfig {
  const home = env.HOME || homedir();
  const inDocker = detectDocker(env);
  const port = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  const rootDir = findRoot(dirname(fileURLToPath(import.meta.url)));
  const host = env.HABBLAUD_HOST?.trim() || '127.0.0.1';
  const pkg = readPackage(rootDir);
  return {
    port: Number.isFinite(port) && port > 0 && port < 65536 ? port : 4747,
    host,
    dev: argv.includes('--dev'),
    demo: isTruthy(env.HABBLAUD_DEMO),
    inDocker,
    home,
    claudeDirs: discoverClaudeDirs(env, home),
    dataDir: resolve(env.HABBLAUD_DATA_DIR?.trim() || (inDocker ? '/data' : join(home, '.habblaud'))),
    usageDir: resolve(env.HABBLAUD_USAGE_DIR?.trim() || join(home, '.habblaud', 'usage')),
    allowedHosts: parseAllowedHosts(env.HABBLAUD_ALLOWED_HOSTS),
    terminal: terminalOffReason(env, host, inDocker) === undefined,
    messages: messagesOffReason(env, host, inDocker) === undefined,
    timeline: !env.HABBLAUD_TIMELINE?.trim() || isTruthy(env.HABBLAUD_TIMELINE),
    rootDir,
    version: pkg.version,
    repo: pkg.repo,
    updateCheck: !env.HABBLAUD_UPDATE_CHECK?.trim() || isTruthy(env.HABBLAUD_UPDATE_CHECK),
    codex: !env.HABBLAUD_CODEX?.trim() || isTruthy(env.HABBLAUD_CODEX),
  };
}
