// Converte o JSONL do oh-my-pi em entradas do painel de conversa do Habblaud.
import type { TerminalEntry } from '../../../shared/types';
import { maskSecrets } from '../../../shared/activity';
import {
  marked,
  prepare,
  RESULT_MAX,
  RESULT_MAX_LINES,
  TEXT_MAX,
  THINKING_MAX,
  toolView,
  type TerminalParser as ParserContract,
} from '../terminal';
import { tr } from '../../../shared/i18n';

type Rec = Record<string, unknown>;

const SEEN_MAX = 20_000;

function rec(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toMs(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function blocks(value: unknown): Rec[] {
  if (!Array.isArray(value)) return [];
  return value.map(rec).filter((block): block is Rec => !!block);
}

function inputRecord(value: unknown): Rec {
  const object = rec(value);
  if (object) return object;
  if (typeof value !== 'string') return {};
  try {
    return rec(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  return blocks(value)
    .map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      if (block.type === 'image') return tr('[imagem]');
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Parser de conversa do OMP: cada registro usa `type: "message"` e papel na propriedade `message.role`. */
class OmpTerminalParser implements ParserContract {
  private out: TerminalEntry[] = [];
  private readonly seen = new Set<string>();
  private sequence = 0;
  private lastAt?: number;

  push(line: string): TerminalEntry[] {
    this.out = [];
    try {
      this.parse(line);
    } catch {
      // Uma linha parcial ou inesperada não deve interromper a leitura das próximas.
    }
    return this.out;
  }

  private emit(entry: TerminalEntry): void {
    if (this.seen.has(entry.id)) return;
    this.seen.add(entry.id);
    if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value as string);
    this.out.push(entry);
  }

  private parse(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    const event = rec(value);
    if (event?.type !== 'message') return;
    const message = rec(event.message);
    if (!message) return;

    const at = toMs(message.timestamp) ?? toMs(event.timestamp) ?? this.lastAt ?? Date.now();
    this.lastAt = at;
    const id = str(event.id) ?? str(message.id) ?? `omp:${++this.sequence}`;
    const role = str(message.role);

    if (role === 'user') this.user(id, at, message.content);
    else if (role === 'assistant') this.assistant(id, at, message.content, str(event.cwd));
    else if (role === 'toolResult') this.result(id, at, message);
  }

  private user(id: string, at: number, content: unknown): void {
    const text = contentText(content).trim();
    if (!text) return;
    const prepared = marked(prepare(text, TEXT_MAX));
    if (prepared) this.emit({ kind: 'user', id: `${id}:user`, at, text: prepared });
  }

  private assistant(id: string, at: number, content: unknown, cwd?: string): void {
    const list = typeof content === 'string' ? [{ type: 'text', text: content }] : blocks(content);
    list.forEach((block, index) => {
      const entryId = `${id}:${index}`;
      if (block.type === 'text') {
        const text = typeof block.text === 'string' ? marked(prepare(block.text, TEXT_MAX)) : '';
        if (text) this.emit({ kind: 'assistant', id: entryId, at, text });
      } else if (block.type === 'thinking') {
        const raw = str(block.thinking) ?? str(block.summary);
        const entry: Extract<TerminalEntry, { kind: 'thinking' }> = { kind: 'thinking', id: entryId, at };
        if (raw) entry.text = marked(prepare(raw, THINKING_MAX));
        this.emit(entry);
      } else if (block.type === 'toolCall') {
        const tool = str(block.name) ?? 'ferramenta';
        const input = inputRecord(block.arguments);
        const view = toolView(tool, input, cwd);
        const entry: Extract<TerminalEntry, { kind: 'tool' }> = {
          kind: 'tool',
          id: str(block.id) ?? `${id}:tool:${index}`,
          at,
          tool,
          title: maskSecrets(view.title),
        };
        if (view.input) {
          entry.input = view.input;
          entry.inputKind = view.inputKind;
        }
        this.emit(entry);
      }
    });
  }

  private result(id: string, at: number, message: Rec): void {
    const toolUseId = str(message.toolCallId);
    if (!toolUseId) return;
    const prepared = prepare(contentText(message.content), RESULT_MAX, RESULT_MAX_LINES);
    const entry: Extract<TerminalEntry, { kind: 'result' }> = {
      kind: 'result',
      id: `${id}:result`,
      at,
      toolUseId,
      text: prepared.text || tr('(sem saída)'),
    };
    if (message.isError === true) entry.error = true;
    if (prepared.truncated) entry.truncated = true;
    this.emit(entry);
  }
}

/** Uma instância nova por stream, sem pré-consumir o histórico que o painel precisa exibir. */
export function createOmpTerminalParser(): ParserContract {
  return new OmpTerminalParser();
}
