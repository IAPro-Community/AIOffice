import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAC_ASSETS = [
  'AIOffice-Setup-macOS-arm64.zip',
  'AIOffice-Setup-macOS-x64.zip',
];
const LINUX_ASSET = 'AIOffice-Setup-Linux-x64.AppImage';

function yamlString(value) {
  return JSON.stringify(value);
}

async function describeAsset(directory, name) {
  const path = join(directory, name);
  const [contents, details] = await Promise.all([readFile(path), stat(path)]);
  if (!details.isFile() || details.size === 0) throw new Error(`Asset vazio ou inválido: ${name}`);
  return {
    url: name,
    sha512: createHash('sha512').update(contents).digest('base64'),
    size: details.size,
  };
}

function manifest(version, assets, releaseDate) {
  const files = assets.map(({ url, sha512, size }) => [
    `  - url: ${yamlString(url)}`,
    `    sha512: ${yamlString(sha512)}`,
    `    size: ${size}`,
  ].join('\n')).join('\n');
  const primary = assets[0];
  return [
    `version: ${version}`,
    'files:',
    files,
    `path: ${yamlString(primary.url)}`,
    `sha512: ${yamlString(primary.sha512)}`,
    `releaseDate: ${yamlString(releaseDate)}`,
    '',
  ].join('\n');
}

export async function createDesktopUpdateManifests({ assetsDirectory, version, releaseDate = new Date().toISOString() }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versão estável inválida: ${version}`);
  const macAssets = await Promise.all(MAC_ASSETS.map((name) => describeAsset(assetsDirectory, name)));
  const linuxAssets = [await describeAsset(assetsDirectory, LINUX_ASSET)];
  await Promise.all([
    writeFile(join(assetsDirectory, 'latest-mac.yml'), manifest(version, macAssets, releaseDate), 'utf8'),
    writeFile(join(assetsDirectory, 'latest-linux.yml'), manifest(version, linuxAssets, releaseDate), 'utf8'),
  ]);
  return ['latest-mac.yml', 'latest-linux.yml'];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const assetsDirectory = process.argv[2] || 'dist/release-assets';
    const files = await createDesktopUpdateManifests({ assetsDirectory, version: packageJson.version });
    console.log(`Manifestos de atualização criados: ${files.join(', ')}`);
  } catch (error) {
    console.error(`[AIOffice] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
