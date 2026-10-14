import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountsService } from '../../accounts/service.js';
import { NameStore } from '../../model/names.js';
import { Office } from '../../model/office.js';
import { describeOmpTool, OmpSource } from './source.js';

let cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

describe('describeOmpTool', () => {
  it('descreve comandos bash de git, testes, linter e scripts com ícones e textos corretos', () => {
    const gitStatus = describeOmpTool('bash', { command: 'git status' });
    expect(gitStatus.kind).toBe('git');
    expect(gitStatus.icon).toBe('🌿');
    expect(gitStatus.text).toBe('Conferindo o git status');

    const gitBranch = describeOmpTool('bash', { command: 'git branch -a && git status -s', i: 'Listing branches' });
    expect(gitBranch.kind).toBe('git');
    expect(gitBranch.icon).toBe('🌿');
    expect(gitBranch.text).toBe('Conferindo as branches');
    expect(gitBranch.detail).toContain('Listing branches — git branch -a');

    const gitLog = describeOmpTool('bash', { command: 'git log -n 10 --oneline' });
    expect(gitLog.kind).toBe('git');
    expect(gitLog.text).toBe('Lendo o histórico do git');

    const npmTest = describeOmpTool('bash', { command: 'npm test' });
    expect(npmTest.kind).toBe('test');
    expect(npmTest.text).toBe('Rodando testes');

    const linter = describeOmpTool('bash', { command: 'npm run lint' });
    expect(linter.kind).toBe('run');
    expect(linter.text).toBe('Rodando o linter');

    const ls = describeOmpTool('bash', { command: 'ls -la' });
    expect(ls.text).toBe('Explorando pastas');
  });

  it('descreve leitura de arquivos locais e URIs internas do OMP', () => {
    const pr = describeOmpTool('read', { path: 'pr://?state=all' });
    expect(pr.kind).toBe('git');
    expect(pr.icon).toBe('🔀');
    expect(pr.text).toBe('Conferindo pull requests');

    const issue = describeOmpTool('read', { path: 'issue://123' });
    expect(issue.kind).toBe('read');
    expect(issue.icon).toBe('📋');
    expect(issue.text).toBe('Lendo issues');

    const skill = describeOmpTool('read', { path: 'skill://ralplan/SKILL.md' });
    expect(skill.kind).toBe('skill');
    expect(skill.icon).toBe('🧩');
    expect(skill.text).toBe('Lendo a skill ralplan');

    const file = describeOmpTool('read', { path: 'apps/office-web/package.json' });
    expect(file.kind).toBe('read');
    expect(file.icon).toBe('📖');
    expect(file.text).toBe('Lendo package.json');

    const img = describeOmpTool('read', { path: 'assets/logo.png' });
    expect(img.kind).toBe('read');
    expect(img.icon).toBe('🖼️');
    expect(img.text).toBe('Olhando logo.png');
  });

  it('descreve escrita e edição (extraindo caminho de blocos hashline)', () => {
    const wr = describeOmpTool('write', { path: 'src/server.ts' });
    expect(wr.kind).toBe('write');
    expect(wr.icon).toBe('📝');
    expect(wr.text).toBe('Escrevendo server.ts');

    const editBlock = describeOmpTool('edit', { input: '[src/server.ts#9FE5]\nPUT 6.=7:\n+const port = 8080;\n' });
    expect(editBlock.kind).toBe('edit');
    expect(editBlock.icon).toBe('✏️');
    expect(editBlock.text).toBe('Editando server.ts');
  });

  it('descreve glob, grep, task, todo, eval e web_search', () => {
    const glob = describeOmpTool('glob', { pattern: '*.ts' });
    expect(glob.kind).toBe('search');
    expect(glob.icon).toBe('🔎');
    expect(glob.text).toBe('Procurando *.ts');

    const grep = describeOmpTool('grep', { pattern: 'addActivity' });
    expect(grep.kind).toBe('search');
    expect(grep.icon).toBe('🔎');
    expect(grep.text).toBe('Buscando “addActivity”');

    const sub = describeOmpTool('task', { tasks: [{ name: 'Architect', task: 'Review architecture', agent: 'reviewer' }] });
    expect(sub.kind).toBe('delegate');
    expect(sub.icon).toBe('👥');
    expect(sub.text).toContain('Delegando: Architect');

    const todoDone = describeOmpTool('todo', { op: 'done', task: 'Configurar monorepo' });
    expect(todoDone.kind).toBe('plan');
    expect(todoDone.icon).toBe('✅');
    expect(todoDone.text).toBe('Concluiu tarefa: Configurar monorepo');

    const py = describeOmpTool('eval', { language: 'py', code: 'print(1)' });
    expect(py.kind).toBe('run');
    expect(py.icon).toBe('▶️');
    expect(py.text).toBe('Executando código Python');

    const ws = describeOmpTool('web_search', { query: 'vitest runners' });
    expect(ws.kind).toBe('web');
    expect(ws.icon).toBe('🌐');
    expect(ws.text).toBe('Pesquisando “vitest runners”');
  });
});

describe('OmpSource', () => {
  function setupTestDir() {
    const dir = join(tmpdir(), `omp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    cleanups.push(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    });
    return dir;
  }

  function setupOffice(sessionsDir: string) {
    let clock = Date.now();
    const now = () => clock;
    const accounts = new AccountsService({ dirs: [], home: sessionsDir, env: {}, now, onChange: () => {} });
    const office = new Office({
      names: new NameStore(null),
      version: 'test',
      startedAt: clock,
      accounts: (s) => accounts.list(s),
      sources: () => [],
      accountName: (id) => accounts.find(id)?.detected.name,
      now,
    });
    const source = new OmpSource(office, accounts, sessionsDir);
    cleanups.unshift(() => source.stop());
    return { office, accounts, source, clock, advance: (ms: number) => { clock += ms; } };
  }

  it('processa transcript do OMP com descrições ricas e sem emitir "{ferramenta} terminou"', () => {
    const sessionsDir = setupTestDir();
    const projectDir = join(sessionsDir, '-test-project');
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, 'session1.jsonl');

    const lines = [
      JSON.stringify({ type: 'title', title: 'Revisar commits e PRs' }),
      JSON.stringify({ type: 'session', id: 'sess-001', cwd: 'C:\\Users\\fbolz\\Documents\\Code\\AIOfficeBeta', timestamp: '2026-10-14T17:45:00.000Z' }),
      JSON.stringify({ type: 'model_change', model: 'google-antigravity/gemini-3.8-flash' }),
      JSON.stringify({
        type: 'message',
        id: 'msg-u1',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'revisa os ultimos commits e prs' }],
          timestamp: 1792000000000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-a1',
        message: {
          role: 'assistant',
          model: 'gemini-3.8-flash',
          usage: { input: 100, output: 50, cost: { total: 0.001 } },
          content: [
            { type: 'thinking', thinking: 'Analisando o pedido do usuario...' },
            {
              type: 'toolCall',
              id: 'call-read-1',
              name: 'read',
              arguments: { path: 'pr://', i: 'Fetching pull requests' },
            },
          ],
          stopReason: 'toolUse',
          timestamp: 1792000001000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-res-1',
        message: {
          role: 'toolResult',
          toolCallId: 'call-read-1',
          toolName: 'read',
          content: [{ type: 'text', text: 'No open PRs' }],
          isError: false,
          timestamp: 1792000002000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-a2',
        message: {
          role: 'assistant',
          usage: { input: 200, output: 80, cost: { total: 0.002 } },
          content: [
            {
              type: 'toolCall',
              id: 'call-bash-1',
              name: 'bash',
              arguments: { command: 'git log -n 5 --oneline', i: 'Checking recent commits' },
            },
          ],
          stopReason: 'toolUse',
          timestamp: 1792000003000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-res-2',
        message: {
          role: 'toolResult',
          toolCallId: 'call-bash-1',
          toolName: 'bash',
          content: [{ type: 'text', text: 'abc1234 feat: update\n' }],
          isError: false,
          timestamp: 1792000004000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-a3',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Aqui está o resumo dos últimos commits e PRs.' }],
          stopReason: 'endTurn',
          timestamp: 1792000005000,
        },
      }),
    ];

    writeFileSync(sessionFile, lines.join('\n'));

    const { office, source } = setupOffice(sessionsDir);
    source.scan();

    const agents = office.commit().snapshot.agents;
    expect(agents).toHaveLength(1);
    const agent = agents[0];
    expect(agent.id).toBe('omp:sess-001');
    expect(agent.title).toBe('Revisar commits e PRs');
    expect(agent.model).toBe('gemini-3.8-flash');
    expect(agent.status).toBe('idle');
    expect(agent.stats.toolCalls).toBe(2);
    expect(agent.stats.tokensIn).toBe(300);
    expect(agent.stats.tokensOut).toBe(130);
    expect(agent.stats.costUSD).toBe(0.003);

    const texts = agent.recent.map((a) => a.text);
    // Nenhuma atividade deve conter "terminou" (ex.: "read terminou" ou "bash terminou")
    // Deve conter as atividades descritas corretamente
    expect(texts.some((t) => t.startsWith('Nova tarefa:'))).toBe(true);
    expect(texts).toContain('Pensando…');
    expect(texts).toContain('Conferindo pull requests');
    expect(texts).toContain('Escrevendo a resposta');
  });

  it('emite novas atividades no feed ao vivo quando linhas são adicionadas', () => {
    const sessionsDir = setupTestDir();
    const projectDir = join(sessionsDir, '-test-project');
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, 'session2.jsonl');

    const initial = [
      JSON.stringify({ type: 'session', id: 'sess-002', cwd: 'C:\\test', timestamp: '2026-10-14T17:50:00.000Z' }),
      JSON.stringify({
        type: 'message',
        id: 'm1',
        message: {
          role: 'user',
          content: 'oi',
          timestamp: 1792000010000,
        },
      }),
    ];
    writeFileSync(sessionFile, initial.join('\n'));
    const initialMtime = statSync(sessionFile).mtime;

    const { office, source } = setupOffice(sessionsDir);
    source.scan();

    let feed = office.recentFeed(10);
    // Carga inicial não vai para o feed
    expect(feed).toHaveLength(0);

    // Agora adiciona novas linhas em tempo real
    const appended = [
      JSON.stringify({
        type: 'message',
        id: 'm2',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-test',
              name: 'bash',
              arguments: { command: 'npm test' },
            },
          ],
          stopReason: 'toolUse',
          timestamp: 1792000011000,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'm3',
        message: {
          role: 'toolResult',
          toolCallId: 'call-test',
          toolName: 'bash',
          content: [{ type: 'text', text: 'Tests passed' }],
          isError: false,
          timestamp: 1792000012000,
        },
      }),
    ];

    writeFileSync(sessionFile, [...initial, ...appended].join('\n'));
    // Mesmo mtime: a varredura também precisa notar bytes novos no JSONL.
    utimesSync(sessionFile, initialMtime, initialMtime);
    source.scan();

    feed = office.recentFeed(10);
    expect(feed.length).toBeGreaterThan(0);
    // Feed deve conter "Rodando testes", mas NÃO "bash terminou"
    expect(feed.some((f) => f.activity.text === 'Rodando testes')).toBe(true);
    expect(feed.some((f) => f.activity.text.includes('terminou'))).toBe(false);
  });

  it('registra erros de ferramentas quando isError for true', () => {
    const sessionsDir = setupTestDir();
    const projectDir = join(sessionsDir, '-test-project');
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, 'session3.jsonl');

    const lines = [
      JSON.stringify({ type: 'session', id: 'sess-003', cwd: 'C:\\test', timestamp: '2026-10-14T17:55:00.000Z' }),
      JSON.stringify({
        type: 'message',
        id: 'm-err-res',
        message: {
          role: 'toolResult',
          toolCallId: 'call-err',
          toolName: 'read',
          content: [{ type: 'text', text: 'ENOENT: file not found /path/to/missing.ts' }],
          isError: true,
          timestamp: 1792000020000,
        },
      }),
    ];
    writeFileSync(sessionFile, lines.join('\n'));

    const { office, source } = setupOffice(sessionsDir);
    source.scan();

    const agent = office.commit().snapshot.agents.find((a) => a.id === 'omp:sess-003');
    expect(agent).toBeDefined();
    const errAct = agent?.recent.find((a) => a.kind === 'error');
    expect(errAct).toBeDefined();
    expect(errAct?.text).toContain('Erro em read');
    expect(errAct?.error).toBe(true);
  });
});
