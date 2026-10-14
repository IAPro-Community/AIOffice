import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const RELEASE_API = 'https://api.github.com/repos/IAPro-Community/AIOffice/releases/latest';
const RELEASE_DOWNLOAD_ROOT = 'https://github.com/IAPro-Community/AIOffice/releases/download';
const INSTALLER_NAME = 'AIOffice-Setup.exe';
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;
const REDIRECT_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

function stableVersion(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return undefined;
  return parts;
}

export function compareStableVersions(left, right) {
  const a = stableVersion(left);
  const b = stableVersion(right);
  if (!a || !b) throw new Error('AIOffice release version is not a stable semantic version.');
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function parseRelease(payload) {
  const parts = stableVersion(payload?.tag_name);
  if (!parts || payload?.draft !== false || payload?.prerelease !== false || !Array.isArray(payload?.assets)) {
    throw new Error('The latest GitHub release metadata is invalid or is not a stable release.');
  }
  const version = parts.join('.');
  const asset = payload.assets.find((item) => item?.name === INSTALLER_NAME);
  const digest = typeof asset?.digest === 'string' ? /^sha256:([a-f\d]{64})$/i.exec(asset.digest)?.[1].toLowerCase() : undefined;
  const expectedUrl = `${RELEASE_DOWNLOAD_ROOT}/${payload.tag_name}/${INSTALLER_NAME}`;
  if (!asset || !digest || asset.browser_download_url !== expectedUrl || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES) {
    throw new Error('The latest GitHub release is missing a valid installer and SHA-256 digest.');
  }
  return {
    version,
    tag: payload.tag_name,
    digest,
    size: asset.size,
    url: expectedUrl,
    releaseUrl: `https://github.com/IAPro-Community/AIOffice/releases/tag/${payload.tag_name}`,
  };
}

export async function fetchLatestAIOfficeRelease(fetchImpl = fetch) {
  const response = await fetchImpl(RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AIOffice-Desktop-Updater',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || response.url !== RELEASE_API) throw new Error(`GitHub Releases returned HTTP ${response.status}.`);
  return parseRelease(await response.json());
}

async function fetchInstallerResponse(release, fetchImpl) {
  let url = release.url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443') || !REDIRECT_HOSTS.has(parsed.hostname)) throw new Error('The installer download redirected to an untrusted host.');
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'AIOffice-Desktop-Updater', Accept: 'application/octet-stream' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15 * 60_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok || !response.body) throw new Error(`GitHub installer download returned HTTP ${response.status}.`);
      const finalUrl = new URL(response.url || url);
      if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password || (finalUrl.port && finalUrl.port !== '443') || !REDIRECT_HOSTS.has(finalUrl.hostname)) throw new Error('The installer download came from an untrusted host.');
      return response;
    }
    const location = response.headers.get('location');
    if (!location || redirects === 5) throw new Error('The installer download has too many or invalid redirects.');
    url = new URL(location, url).href;
  }
  throw new Error('The installer download has too many redirects.');
}

async function fileMatches(path, release) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== release.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === release.digest;
  } catch {
    return false;
  }
}

async function removeOldInstallerCache(directory, keepPath) {
  const keepName = basename(keepPath);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^AIOffice-Setup-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.exe$/i.test(entry.name) && entry.name !== keepName) {
      await rm(join(directory, entry.name), { force: true });
    }
  }
}

export async function downloadVerifiedInstaller(release, directory, fetchImpl = fetch, onProgress = () => {}) {
  const validated = parseRelease({
    tag_name: release?.tag,
    draft: false,
    prerelease: false,
    assets: [{ name: INSTALLER_NAME, digest: `sha256:${release?.digest}`, size: release?.size, browser_download_url: release?.url }],
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^\.aioffice-update-[0-9a-f-]{36}\.part$/i.test(entry.name)) {
      await rm(join(directory, entry.name), { force: true }).catch(() => {});
    }
  }
  const targetPath = join(directory, `${INSTALLER_NAME.replace(/\.exe$/i, '')}-${validated.version}.exe`);
  if (await fileMatches(targetPath, validated)) {
    onProgress(100);
    return { ...validated, path: targetPath };
  }

  const partPath = join(directory, `.aioffice-update-${randomUUID()}.part`);
  try {
    const response = await fetchInstallerResponse(validated, fetchImpl);
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength !== validated.size)) throw new Error('The installer size does not match the GitHub release metadata.');
    const hash = createHash('sha256');
    let bytes = 0;
    let lastProgress = -1;
    let lastProgressAt = 0;
    const verifier = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > validated.size || bytes > MAX_INSTALLER_BYTES) return callback(new Error('The installer exceeded its declared size.'));
        hash.update(chunk);
        const progress = Math.min(100, Math.floor(bytes * 100 / validated.size));
        if (progress === 100 || progress > lastProgress && (progress - lastProgress >= 1 || Date.now() - lastProgressAt >= 500)) {
          lastProgress = progress;
          lastProgressAt = Date.now();
          onProgress(progress);
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(partPath, { flags: 'wx', mode: 0o600 }));
    if (bytes !== validated.size || hash.digest('hex') !== validated.digest) throw new Error('The installer SHA-256 digest does not match the official GitHub release.');
    await rm(targetPath, { force: true });
    await rename(partPath, targetPath);
    await removeOldInstallerCache(directory, targetPath).catch(() => {});
    return { ...validated, path: targetPath };
  } catch (error) {
    await rm(partPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function verifyDownloadedInstaller(downloaded) {
  const parts = stableVersion(downloaded?.version);
  const digest = typeof downloaded?.digest === 'string' && /^[a-f\d]{64}$/i.test(downloaded.digest) ? downloaded.digest.toLowerCase() : undefined;
  if (!parts || !digest || !Number.isSafeInteger(downloaded?.size) || typeof downloaded?.path !== 'string') return false;
  return fileMatches(downloaded.path, { version: parts.join('.'), digest, size: downloaded.size });
}
