import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const INSPECTION_TIMEOUT_MS = 7_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 8_000;

export class PortConflictError extends Error {
  constructor(port, owners, reason = 'occupied') {
    super(`A porta ${port} já está em uso.`);
    this.name = 'PortConflictError';
    this.port = port;
    this.owners = owners.map(({ Name, ProcessId }) => ({ name: Name || 'Processo desconhecido', pid: ProcessId }));
    this.reason = reason;
  }
}

export function configuredServerPort(value, defaultPort = 4747) {
  if (value === undefined || value.trim() === '') return defaultPort;
  const normalized = value.trim();
  if (!/^\d{1,5}$/.test(normalized)) throw new Error(`A porta configurada em HABBLAUD_PORT não é válida: “${normalized.slice(0, 32)}”. Use um número entre 1 e 65535.`);
  const port = Number(normalized);
  if (port < 1 || port > 65535) throw new Error(`A porta configurada em HABBLAUD_PORT não é válida: ${normalized}. Use um número entre 1 e 65535.`);
  return port;
}

function asProcessList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => Number.isInteger(Number(item.ProcessId)));
}

async function windowsPortListeners(port) {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$port = ${port}`,
    '$records = @(Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {',
    '  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $_"',
    '  if ($p) {',
    '    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.ParentProcessId)"',
    '    [pscustomobject]@{ ProcessId=[int]$p.ProcessId; ParentProcessId=[int]$p.ParentProcessId; Name=$p.Name; ExecutablePath=$p.ExecutablePath; CommandLine=$p.CommandLine; ParentName=$parent.Name; ParentExecutablePath=$parent.ExecutablePath; ParentCommandLine=$parent.CommandLine }',
    '  }',
    '})',
    'ConvertTo-Json -InputObject $records -Compress',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
    windowsHide: true,
    timeout: INSPECTION_TIMEOUT_MS,
    maxBuffer: 256 * 1024,
  });
  return asProcessList(JSON.parse(stdout.trim() || '[]'));
}

async function unixProcess(pid) {
  const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'pid=,ppid=,args='], {
    timeout: INSPECTION_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
  });
  const match = stdout.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/s);
  if (!match) return undefined;
  const [, processId, parentProcessId, commandLine] = match;
  const parent = await execFileAsync('ps', ['-p', parentProcessId, '-o', 'pid=,ppid=,args='], {
    timeout: INSPECTION_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
  }).then(({ stdout: parentOutput }) => {
    const parentMatch = parentOutput.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/s);
    const parentCommandLine = parentMatch?.[3] ?? '';
    const parentExecutablePath = parentCommandLine.trim().split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '') ?? '';
    return parentMatch ? { ParentName: basename(parentExecutablePath), ParentExecutablePath: parentExecutablePath, ParentCommandLine: parentCommandLine } : {};
  }).catch(() => ({}));
  return {
    ProcessId: Number(processId),
    ParentProcessId: Number(parentProcessId),
    Name: basename(commandLine.trim().split(/\s+/)[0].replace(/^['"]|['"]$/g, '')),
    ExecutablePath: commandLine.trim().split(/\s+/)[0].replace(/^['"]|['"]$/g, ''),
    CommandLine: commandLine,
    ...parent,
  };
}

async function unixPortListeners(port) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      timeout: INSPECTION_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    }));
  } catch (error) {
    if (error?.code === 1 && !error.stdout?.trim()) return [];
    throw error;
  }
  const pids = [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))];
  return (await Promise.all(pids.map(unixProcess))).filter(Boolean);
}

async function portListeners(port, platform) {
  if (platform === 'win32') return windowsPortListeners(port);
  return unixPortListeners(port);
}

function normalizedPath(value) {
  return typeof value === 'string' ? resolve(value).replaceAll('\\', '/').toLowerCase() : '';
}

function aiofficeServerProcessKind(owner, executablePath, userDataDir) {
  const expectedExecutable = normalizedPath(executablePath);
  const commandLine = String(owner.CommandLine ?? '').toLowerCase();
  const sameExecutable = normalizedPath(owner.ExecutablePath) === expectedExecutable
    || commandLine.includes(expectedExecutable);
  const utilityNode = commandLine.includes('--type=utility') && commandLine.includes('node.mojom.nodeservice');
  const userDataPath = normalizedPath(userDataDir);
  const belongsToUser = userDataPath && commandLine.replaceAll('\\\\', '/').replaceAll('\\', '/').includes(userDataPath);
  const parentStillOpen = normalizedPath(owner.ParentExecutablePath) === normalizedPath(executablePath)
    && !String(owner.ParentCommandLine ?? '').toLowerCase().includes('--type=');
  if (sameExecutable && utilityNode && belongsToUser && !parentStillOpen) return 'desktop';
  const normalizedCommandLine = commandLine.replaceAll('\\\\', '/').replaceAll('\\', '/');
  if (normalizedCommandLine.includes('apps/office-web/scripts/start-managed.mjs')) return 'managed';
  return undefined;
}

async function requestCooperativeShutdown(port, processId, fetchImpl) {
  const origin = `http://127.0.0.1:${port}`;
  try {
    const healthResponse = await fetchImpl(`${origin}/api/updates/health`, { signal: AbortSignal.timeout(1500) });
    if (!healthResponse.ok) return { stopped: false };
    const health = await healthResponse.json();
    if (health.pid !== processId || typeof health.nonce !== 'string' || health.nonce.length < 32) return { stopped: false };
    const response = await fetchImpl(`${origin}/api/updates/shutdown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ pid: processId, nonce: health.nonce }),
      signal: AbortSignal.timeout(2500),
    });
    if (response.status === 409) return { stopped: false, activeSessions: true };
    return { stopped: response.status === 202 };
  } catch {
    return { stopped: false };
  }
}

async function waitForPortToClear(port, platform, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const owners = await portListeners(port, platform);
    if (!owners.length) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  return false;
}

/** Stop only a server process identified as the AIOffice utility or managed launcher. */
export async function recoverOrphanedAIOfficePort({
  port,
  executablePath,
  userDataDir,
  platform = process.platform,
  fetchImpl = fetch,
  killProcess = (pid, signal) => process.kill(pid, signal),
}) {
  let owners;
  try {
    owners = await portListeners(port, platform);
  } catch (error) {
    return { state: 'inspection-failed', error };
  }
  if (!owners.length) return { state: 'free' };

  const appOwners = owners.map((owner) => ({ owner, kind: aiofficeServerProcessKind(owner, executablePath, userDataDir) }));
  if (appOwners.some(({ kind }) => !kind)) return { state: 'occupied', owners };

  let shutdownMethod = 'cooperative shutdown';
  for (const { owner } of appOwners) {
    const cooperative = await requestCooperativeShutdown(port, Number(owner.ProcessId), fetchImpl);
    if (cooperative.activeSessions) return { state: 'active-sessions', owners };
    if (!cooperative.stopped) {
      shutdownMethod = 'process signal';
      try { killProcess(Number(owner.ProcessId), 'SIGTERM'); }
      catch (error) {
        if (error?.code !== 'ESRCH') return { state: 'stop-failed', owners, error };
      }
    }
  }

  try {
    if (await waitForPortToClear(port, platform, SERVER_SHUTDOWN_TIMEOUT_MS)) {
      return { state: 'recovered', owners: appOwners.map(({ owner }) => owner), shutdownMethod };
    }
    const remainingOwners = await portListeners(port, platform);
    return { state: 'occupied', owners: remainingOwners.length ? remainingOwners : appOwners.map(({ owner }) => owner) };
  } catch (error) {
    return { state: 'stop-failed', owners: appOwners.map(({ owner }) => owner), error };
  }
}

export function portOwnerLabels(owners = []) {
  return owners.map((owner) => `${owner.Name || owner.name || 'Processo desconhecido'} (PID ${owner.ProcessId ?? owner.pid ?? '?'})`);
}
