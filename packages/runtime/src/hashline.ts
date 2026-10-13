import type { HashlinePatchOp } from './types.js';

export class HashlineEngine {
  public static apply(originalContent: string, ops: readonly HashlinePatchOp[]): string {
    const lines = originalContent.split(/\r?\n/);

    // Ordenar operações decrescentes por número de linha para preservar os offsets anteriores
    const sortedOps = [...ops].sort((a, b) => b.startLine - a.startLine);

    for (const op of sortedOps) {
      const startIdx = Math.max(0, op.startLine - 1);
      const endIdx = op.endLine !== undefined ? Math.max(startIdx, op.endLine - 1) : startIdx;

      if (op.type === 'CUT') {
        const deleteCount = endIdx - startIdx + 1;
        lines.splice(startIdx, deleteCount);
      } else if (op.type === 'PUT') {
        const replacement = op.body ? [...op.body] : [];
        const deleteCount = endIdx - startIdx + 1;
        lines.splice(startIdx, deleteCount, ...replacement);
      }
    }

    return lines.join('\n');
  }

  public static parseOps(input: string): HashlinePatchOp[] {
    const ops: HashlinePatchOp[] = [];
    const lines = input.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i]?.trim() ?? '';
      if (line.startsWith('CUT ')) {
        const match = /^CUT\s+(\d+)(?:\.=(\d+))?/.exec(line);
        if (match) {
          const startLine = parseInt(match[1]!, 10);
          const endLine = match[2] ? parseInt(match[2]!, 10) : startLine;
          ops.push({ type: 'CUT', startLine, endLine });
        }
        i += 1;
      } else if (line.startsWith('PUT ')) {
        const match = /^PUT\s+(\d+)(?:\.=(\d+))?:/.exec(line);
        if (match) {
          const startLine = parseInt(match[1]!, 10);
          const endLine = match[2] ? parseInt(match[2]!, 10) : startLine;
          const body: string[] = [];
          i += 1;
          while (i < lines.length && (lines[i]?.startsWith('+') || lines[i] === '')) {
            const raw = lines[i]!;
            body.push(raw.startsWith('+') ? raw.slice(1) : raw);
            i += 1;
          }
          ops.push({ type: 'PUT', startLine, endLine, body });
        } else {
          i += 1;
        }
      } else {
        i += 1;
      }
    }

    return ops;
  }
}
