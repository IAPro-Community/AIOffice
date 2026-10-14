/** AIOffice release preview by default; --publish pushes a tag and lets release CI publish verified assets. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'IAPro-Community/AIOffice';
const GH_REPOSITORY = `github.com/${REPOSITORY}`;

export function parseReleaseArgs(argv) {
  const options = { publish: false, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '--publish') options.publish = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`opção desconhecida: ${arg}`);
  }
  if (options.publish && options.dryRun) throw new Error('use --publish ou --dry-run, nunca os dois juntos.');
  return options;
}

function isCanonicalRepository(value) {
  return typeof value === 'string' && /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)IAPro-Community\/AIOffice(?:\.git)?\/?$/i.test(value);
}

function validateVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error('a versão do package.json raiz deve ser SemVer, sem o prefixo v.');
  }
  const prerelease = version.split('+')[0].split('-').slice(1).join('-');
  if (prerelease.split('.').some((part) => /^0\d+$/.test(part))) {
    throw new Error('identificadores numéricos de pré-release não podem ter zeros à esquerda.');
  }
}

/** Preserve Markdown, including code fences, while omitting the changelog's link index. */
export function changelogSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## (?:\\[v?${escaped}\\]|v?${escaped})(?:\\s|$)`);
  const sections = [];
  let body;
  let fence;
  for (const line of changelog.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      if (!fence) fence = opening[1];
      else if (opening[1][0] === fence[0] && opening[1].length >= fence.length) fence = undefined;
      if (body) body.push(line);
      continue;
    }
    if (!fence && /^##\s/.test(line)) {
      body = heading.test(line) ? [] : undefined;
      if (body) sections.push(body);
    } else if (body && !fence && /^\[[^\]]+\]:\s/.test(line)) {
      body = undefined;
    } else if (body) body.push(line);
  }
  if (sections.length !== 1) throw new Error(`o CHANGELOG.md raiz precisa de exatamente uma seção para v${version}.`);
  const notes = sections[0].join('\n').trim();
  if (!notes || !notes.split('\n').some((line) => line.trim() && !/^#{1,6}\s/.test(line))) {
    throw new Error(`a seção de v${version} no CHANGELOG.md raiz não tem notas de release.`);
  }
  return notes;
}

function run(command, args, { input } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      input,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`${command} ${args.join(' ')} falhou: ${detail}`);
  }
}

function localPublishBlockers(tag) {
  const blockers = [];
  const branch = run('git', ['branch', '--show-current']);
  if (branch !== 'main') blockers.push(`publique a partir da main (atual: ${branch || 'HEAD destacado'}).`);
  if (run('git', ['status', '--porcelain', '--untracked-files=all'])) blockers.push('há mudanças não commitadas; revise e faça o commit antes de publicar.');
  if (run('git', ['tag', '--list', tag])) blockers.push(`a tag local ${tag} já existe; não será sobrescrita.`);
  return blockers;
}

function validateOrigin() {
  const gitRoot = resolve(run('git', ['rev-parse', '--show-toplevel']));
  if (gitRoot !== ROOT) throw new Error('o helper precisa estar na raiz do repositório AIOffice.');
  for (const kind of ['fetch', 'push']) {
    const args = ['remote', 'get-url', ...(kind === 'push' ? ['--push'] : []), '--all', 'origin'];
    const urls = run('git', args).split(/\r?\n/);
    if (!urls.every(isCanonicalRepository)) {
      throw new Error(`origin (${kind}) deve apontar exclusivamente para github.com/${REPOSITORY}.`);
    }
  }
}

function validateRemote(tag, head) {
  const refs = run('git', ['ls-remote', '--refs', 'origin', 'refs/heads/main', `refs/tags/${tag}`]);
  const remote = new Map(refs.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return [ref, sha];
  }));
  if (remote.get('refs/heads/main') !== head) throw new Error('HEAD deve ser igual à main remota; sincronize a branch antes de publicar.');
  if (remote.has(`refs/tags/${tag}`)) throw new Error(`a tag remota ${tag} já existe; não será sobrescrita.`);
  run('gh', ['auth', 'status', '--hostname', 'github.com']);
  const releaseTags = run('gh', ['api', '--hostname', 'github.com', '--paginate', `repos/${REPOSITORY}/releases?per_page=100`, '--jq', '.[].tag_name']);
  if (releaseTags.split(/\r?\n/).includes(tag)) throw new Error(`a release ${tag} já existe no AIOffice.`);
}

function main(argv) {
  const options = parseReleaseArgs(argv);
  if (options.help) {
    console.log('Uso: npm run release [-- --dry-run | --publish]\nSem opções: valida a origem, a versão raiz e o CHANGELOG; mostra as notas.\n--publish: exige main limpa e sincronizada e envia a tag; a CI publica os instaladores depois de validar builds e assinaturas.');
    return;
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (pkg.name !== 'aioffice' || !isCanonicalRepository(pkg.repository?.url)) {
    throw new Error(`o pacote raiz deve ser aioffice e apontar para ${REPOSITORY}.`);
  }
  validateVersion(pkg.version);
  const tag = `v${pkg.version}`;
  const notes = changelogSection(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), pkg.version);
  validateOrigin();
  run('git', ['check-ref-format', `refs/tags/${tag}`]);
  const head = run('git', ['rev-parse', 'HEAD']);
  const blockers = localPublishBlockers(tag);

  console.log(`AIOffice ${tag}\nRepositório: ${REPOSITORY}\nCommit: ${head}\n\n${notes}\n`);
  if (!options.publish) {
    console.log('Simulação: nenhuma tag, push ou release foi criada; o estado remoto não foi consultado.');
    if (blockers.length) console.log(`Bloqueios locais para publicar:\n${blockers.map((item) => `- ${item}`).join('\n')}`);
    console.log('Para iniciar a publicação após revisar e validar a versão: npm run release -- --publish');
    return;
  }
  if (blockers.length) throw new Error(blockers.join('\n'));
  validateRemote(tag, head);
  // Recheck local state after network checks, before the first write.
  if (run('git', ['rev-parse', 'HEAD']) !== head) throw new Error('HEAD mudou durante a validação; execute novamente.');
  const updatedBlockers = localPublishBlockers(tag);
  if (updatedBlockers.length) throw new Error(updatedBlockers.join('\n'));

  run('git', ['tag', '-a', tag, head, '-m', `AIOffice ${tag}`]);
  try {
    run('git', ['-c', 'remote.origin.mirror=false', '-c', 'push.followTags=false', 'push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
    console.log(`Tag ${tag} enviada. A pipeline AIOffice Desktop vai compilar e validar os instaladores antes de criar a release em https://${GH_REPOSITORY}/releases/tag/${tag}.`);
  } catch (error) {
    throw new Error(`${error.message}\nA tag local ${tag} foi criada. Confira a tag remota e o workflow antes de tentar novamente; o helper não remove nem sobrescreve tags.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[AIOffice] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
