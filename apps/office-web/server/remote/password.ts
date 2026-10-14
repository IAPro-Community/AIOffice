// Senha do acesso remoto guardada como hash scrypt (nunca em texto puro no .env).
//
// Formato: scrypt:<log2 N>:<r>:<p>:<sal base64url>:<hash base64url>. Sem "$" de propósito: o Docker Compose interpola
// "$" no .env. Definido pelo painel local AIOffice e conferido no login do túnel (http/remote.ts).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface PasswordHash {
  logN: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

/** 2^15 com r=8: ~32 MB e algumas dezenas de ms por tentativa; caro o bastante para quem chuta, barato no login. */
export const DEFAULT_LOG_N = 15;
const KEY_LEN = 32;
const SALT_LEN = 16;
const HASH_RE = /^scrypt:(\d{1,2}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/;

function validParams(logN: number, r: number, p: number): boolean {
  return Number.isInteger(logN) && logN >= 14 && logN <= 18 && Number.isInteger(r) && r >= 1 && r <= 8 &&
    Number.isInteger(p) && p >= 1 && p <= 4 && 128 * 2 ** logN * r <= 64 * 1024 * 1024 && 2 ** logN * r * p <= 2 ** 20;
}

function maxmem(logN: number, r: number): number {
  // O scrypt usa ~128 * N * r bytes; folga para não estourar o limite padrão (32 MB) do Node.
  return 256 * 2 ** logN * r;
}

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, fail) =>
    scrypt(password.normalize('NFC'), salt, KEY_LEN, { N: 2 ** logN, r, p, maxmem: maxmem(logN, r) }, (err, key) => (err ? fail(err) : ok(key))),
  );
}

export async function hashPassword(password: string, logN = DEFAULT_LOG_N): Promise<string> {
  if (!validParams(logN, 8, 1)) throw new Error('Invalid scrypt parameters');
  if (Buffer.byteLength(password, 'utf8') > 1024) throw new Error('Password exceeds 1024 bytes');
  const salt = randomBytes(SALT_LEN);
  const r = 8;
  const p = 1;
  const hash = await derive(password, salt, logN, r, p);
  return `scrypt:${logN}:${r}:${p}:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

/** Lê o hash; undefined quando o texto não tem o formato (ou parâmetros fora do razoável). */
export function parsePasswordHash(value: string | undefined): PasswordHash | undefined {
  const m = HASH_RE.exec(value?.trim() ?? '');
  if (!m) return undefined;
  const [logN, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!validParams(logN, r, p)) return undefined;
  const salt = Buffer.from(m[4], 'base64url');
  const hash = Buffer.from(m[5], 'base64url');
  if (salt.length !== SALT_LEN || hash.length !== KEY_LEN || salt.toString('base64url') !== m[4] || hash.toString('base64url') !== m[5]) return undefined;
  return { logN, r, p, salt, hash };
}

/** Confere a senha em tempo constante (o scrypt roda sempre, até com senha vazia). */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (!validParams(stored.logN, stored.r, stored.p) || Buffer.byteLength(password, 'utf8') > 1024) return false;
  const key = await derive(password, stored.salt, stored.logN, stored.r, stored.p);
  return key.length === stored.hash.length && timingSafeEqual(key, stored.hash);
}
