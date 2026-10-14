export function updateStrategy({ packaged, platform, env = {}, release = {} }) {
  if (!packaged) return { mode: 'disabled', channel: 'latest', reason: 'updates-disabled-in-development' };
  if (env.AIOFFICE_DISABLE_UPDATES === '1') return { mode: 'disabled', channel: 'latest', reason: 'updates-disabled-by-configuration' };
  // The Windows installer is verified against GitHub's SHA-256 release digest before execution.
  // Native electron-updater remains available on platforms with signed update packages.
  if (platform === 'win32') return { mode: 'github-installer', channel: 'latest' };
  if (platform === 'darwin' && release.signed !== true) {
    return { mode: 'disabled', channel: 'latest', reason: 'unsigned-build' };
  }
  if (platform === 'linux' && !env.APPIMAGE) return { mode: 'manual', channel: 'latest', reason: 'use-system-package-manager' };
  return { mode: 'automatic', channel: 'latest' };
}
