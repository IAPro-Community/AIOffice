/** Verificador somente de leitura para a equipe revisar releases de marmottajr/habblaud. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'apps/office-web/upstream-habblaud.json');

function parseVersion(value) {
  const match = /^(?:v)?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,40}))?$/.exec(value);
  return match ? { numbers: match.slice(1, 4).map(Number), pre: match[4] } : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error('tag de versão inválida');
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0);
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
}

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const repo = manifest.upstreamRepository;
  const reviewedTag = manifest.reviewedThrough?.tag;
  if (typeof repo !== 'string' || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    throw new Error('repositório upstream inválido no manifesto');
  }
  if (typeof reviewedTag !== 'string' || !parseVersion(reviewedTag)) {
    throw new Error('marco revisado inválido no manifesto');
  }

  console.log('[AIOffice] Consulta de leitura para a equipe mantenedora.');
  console.log(`Revisado até: ${reviewedTag} (${manifest.reviewedThrough.commit})`);

  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aioffice-upstream-review' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);

  const release = await response.json();
  const latestTag = typeof release.tag_name === 'string' ? release.tag_name : '';
  if (!parseVersion(latestTag)) throw new Error('a release mais recente não tem uma tag semver reconhecida');
  console.log(`Release upstream mais recente: ${latestTag}`);

  if (compareVersions(latestTag, reviewedTag) <= 0) {
    console.log('Nenhuma release mais nova que o marco revisado.');
    return;
  }

  const compareUrl = `https://github.com/${repo}/compare/${encodeURIComponent(reviewedTag)}...${encodeURIComponent(latestTag)}`;
  console.log(`Há mudanças para revisão: ${compareUrl}`);
  console.log('Este comando não baixa código nem altera o AIOffice. Revise e porte seletivamente em uma branch própria.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[AIOffice] Não foi possível consultar o upstream: ${message}`);
  process.exitCode = 1;
});
