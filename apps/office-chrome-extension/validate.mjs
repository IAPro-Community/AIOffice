import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ACTIVITY_KINDS, normalizePreferences } from './activity-kinds.js';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(extensionDir, '../..');
const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
const sharedTypes = await readFile(path.join(rootDir, 'apps/office-web/shared/types.ts'), 'utf8');
const protocolSource = await readFile(path.join(rootDir, 'apps/office-desktop/native-messaging-protocol.mjs'), 'utf8');
const hostSource = await readFile(path.join(rootDir, 'apps/office-desktop/native-host/main.go'), 'utf8');
const installerSource = await readFile(path.join(rootDir, 'apps/office-desktop/installer.nsh'), 'utf8');
const kindsBlock = sharedTypes.match(/export type ActivityKind\s*=([\s\S]*?);/);
if (!kindsBlock) throw new Error('ActivityKind não encontrado em apps/office-web/shared/types.ts.');
const sharedKinds = [...kindsBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
const extra = ACTIVITY_KINDS.filter((kind) => !sharedKinds.includes(kind));
const missing = sharedKinds.filter((kind) => !ACTIVITY_KINDS.includes(kind));
if (extra.length || missing.length) {
  throw new Error(`Categorias ActivityKind divergentes. Faltando: ${missing.join(', ') || 'nenhuma'}; extras: ${extra.join(', ') || 'nenhuma'}.`);
}

const expectedPermissions = ['sidePanel', 'nativeMessaging', 'notifications', 'alarms', 'storage'];
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify([...expectedPermissions].sort())) {
  throw new Error(`Permissões inesperadas no manifesto: ${manifest.permissions.join(', ')}.`);
}

for (const entry of [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  'activity-kinds.js',
  'feed-recovery.js',
  'feed-view.js',
  'host-state.js',
  'sidepanel.css',
  'avatar-renderer.js',
  'notification.svg',
]) {
  if (!entry) throw new Error('Entrada obrigatória ausente no manifesto.');
  await readFile(path.join(extensionDir, entry));
}

for (const size of ['16', '32', '48', '128']) {
  const iconPath = manifest.icons?.[size];
  if (!iconPath || manifest.action?.default_icon?.[size] !== iconPath) {
    throw new Error(`Ícone do AIOffice ausente ou divergente no manifesto (${size}px).`);
  }
  const icon = await readFile(path.join(extensionDir, iconPath));
  if (!icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Ícone do AIOffice não é PNG válido (${size}px).`);
  }
  if (icon.readUInt32BE(16) !== Number(size) || icon.readUInt32BE(20) !== Number(size)) {
    throw new Error(`Dimensões incorretas para o ícone do AIOffice (${size}px).`);
  }
}

const extensionHash = createHash('sha256').update(Buffer.from(manifest.key || '', 'base64')).digest('hex').slice(0, 32);
const extensionId = extensionHash.replace(/[0-9a-f]/g, (digit) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16)));
const expectedOrigin = `chrome-extension://${extensionId}/`;
const protocolHostName = protocolSource.match(/NATIVE_HOST_NAME\s*=\s*'([^']+)'/)?.[1];
const protocolOrigin = protocolSource.match(/NATIVE_EXTENSION_ORIGIN\s*=\s*'([^']+)'/)?.[1];
const nativeOrigin = hostSource.match(/extensionOrigin\s*=\s*"([^"]+)"/)?.[1];
if (!protocolHostName || !installerSource.includes(protocolHostName)) {
  throw new Error('Nome do Native Messaging host divergente entre a extensão e o instalador desktop.');
}
if (protocolOrigin !== expectedOrigin || nativeOrigin !== expectedOrigin || !installerSource.includes(expectedOrigin)) {
  throw new Error('ID da extensão divergente entre manifesto, host nativo e instalador desktop.');
}

const defaults = normalizePreferences();
if (ACTIVITY_KINDS.some((kind) => defaults.activityKinds[kind] !== true)) {
  throw new Error('Todos os ActivityKind devem estar ativos por padrão.');
}
if (defaults.includeDetails !== false || defaults.noticesEnabled !== true) {
  throw new Error('Preferências seguras padrão divergentes.');
}

console.log(`Extensão validada: ${ACTIVITY_KINDS.length} categorias, ${manifest.permissions.length} permissões e identidade do host sincronizada.`);
