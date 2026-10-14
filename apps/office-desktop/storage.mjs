import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function desktopPaths({ userDataDir, homeDir, legacyAppEnv }) {
  const userData = resolve(userDataDir);
  const home = resolve(homeDir);
  return {
    home,
    userData,
    maestroPrefix: join(userData, 'maestro-npm'),
    npmCache: join(userData, 'npm-cache'),
    dataDir: join(userData, 'habblaud'),
    envFile: join(userData, '.env'),
    logFile: join(userData, 'aioffice.log'),
    usageDir: join(home, '.habblaud', 'usage'),
    tlsDir: join(userData, 'remote-tls', 'server'),
    legacyDataDirs: [join(home, '.habblaud'), join(home, '.codetown')],
    legacyEnvFiles: [join(home, '.habblaud', '.env'), legacyAppEnv].filter(Boolean),
  };
}

export function desktopServerCwd(paths, { packaged, appPath }) {
  return packaged ? paths.home : resolve(appPath);
}

/** Copy old app state only when the desktop data directory does not exist; never move or overwrite user data. */
export function preserveLegacyData(dataDir, candidates) {
  const target = resolve(dataDir);
  if (existsSync(target)) return undefined;
  const source = candidates.map((candidate) => resolve(candidate)).find((candidate) => candidate !== target && existsSync(candidate) && statSync(candidate).isDirectory());
  if (!source) {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    return undefined;
  }
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
  return source;
}

/** Preserve existing desktop settings; the old source remains in place for rollback/recovery. */
export function preserveLegacyEnv(envFile, candidates) {
  const target = resolve(envFile);
  if (existsSync(target)) return undefined;
  const source = candidates.map((candidate) => resolve(candidate)).find((candidate) => candidate !== target && existsSync(candidate) && statSync(candidate).isFile());
  if (!source) return undefined;
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  copyFileSync(source, target, 1);
  try { chmodSync(target, 0o600); } catch { /* ACL inheritance protects Windows user data. */ }
  return source;
}

export function serverEnvironment(paths, current = process.env) {
  return {
    ...current,
    HABBLAUD_DATA_DIR: paths.dataDir,
    HABBLAUD_ENV_FILE: paths.envFile,
    HABBLAUD_USAGE_DIR: current.HABBLAUD_USAGE_DIR?.trim() || paths.usageDir,
    HABBLAUD_REMOTE_TLS_DIR: current.HABBLAUD_REMOTE_TLS_DIR?.trim() || paths.tlsDir,
    AIOFFICE_MAESTRO_HOME: current.AIOFFICE_MAESTRO_HOME?.trim() || paths.home,
    NPM_CONFIG_PREFIX: current.NPM_CONFIG_PREFIX?.trim() || paths.maestroPrefix,
    NPM_CONFIG_CACHE: current.NPM_CONFIG_CACHE?.trim() || paths.npmCache,
    HABBLAUD_HOST: '127.0.0.1',
    HABBLAUD_UPDATE_CHECK: '0',
    AIOFFICE_DESKTOP: '1',
  };
}
