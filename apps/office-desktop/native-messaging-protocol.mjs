export const NATIVE_MESSAGE_LIMIT = 1024 * 1024;
export const NATIVE_HOST_NAME = 'com.iapro.aioffice';
export const NATIVE_EXTENSION_ORIGIN = 'chrome-extension://kcapmchomgbpjgdfdijhlnnjehmhdfdc/';
export const NATIVE_ACTIONS = new Set(['connect', 'open', 'stop', 'agent-message', 'terminal-open', 'terminal-close']);

export function encodeNativeFrame(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > NATIVE_MESSAGE_LIMIT) throw new RangeError('Native Messaging response exceeds 1 MiB.');
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export function validateNativeRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'A mensagem precisa ser um objeto.';
  if (value.v !== 1) return 'Versão de protocolo Native Messaging incompatível.';
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 80) return 'Identificador de mensagem inválido.';
  if (!NATIVE_ACTIONS.has(value.action)) return 'Ação Native Messaging não permitida.';
  if (value.action === 'agent-message' || value.action === 'terminal-open' || value.action === 'terminal-close') {
    if (typeof value.agentId !== 'string' || !value.agentId.trim() || value.agentId.length > 512 || /[\\/\u0000-\u001f\u007f]/.test(value.agentId)) {
      return 'Identificador de agente inválido.';
    }
  }
  if (value.action === 'agent-message' && (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 20_000)) {
    return 'A instrução precisa ter entre 1 e 20.000 caracteres.';
  }
  return undefined;
}

/** Decode Chrome's four-byte little-endian length prefix, including split/multiple chunks. */
export function createNativeFrameDecoder(onMessage, { maxBytes = NATIVE_MESSAGE_LIMIT, onError = () => {} } = {}) {
  let buffered = Buffer.alloc(0);
  let closed = false;

  return {
    push(chunk) {
      if (closed) return;
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : Buffer.from(chunk);
      try {
        while (buffered.length >= 4) {
          const size = buffered.readUInt32LE(0);
          if (size > maxBytes) throw new RangeError(`Native Messaging request exceeds ${maxBytes} bytes.`);
          if (buffered.length < size + 4) return;
          const raw = buffered.subarray(4, size + 4).toString('utf8');
          buffered = buffered.subarray(size + 4);
          onMessage(JSON.parse(raw));
        }
      } catch (error) {
        closed = true;
        buffered = Buffer.alloc(0);
        onError(error);
      }
    },
    end() {
      if (closed) return;
      closed = true;
      if (buffered.length) onError(new Error('Native Messaging stream ended in the middle of a frame.'));
      buffered = Buffer.alloc(0);
    },
  };
}

/** Parse SSE records from arbitrary UTF-8 chunks. Comments and incomplete records are ignored. */
export function createSseDecoder(onEvent) {
  const textDecoder = new TextDecoder();
  let buffered = '';
  return {
    push(chunk, final = false) {
      buffered += typeof chunk === 'string' ? chunk : textDecoder.decode(chunk, { stream: !final });
      buffered = buffered.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      let boundary;
      while ((boundary = buffered.indexOf('\n\n')) !== -1) {
        const record = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const fields = record.split('\n');
        let event = 'message';
        const data = [];
        for (const line of fields) {
          if (!line || line.startsWith(':')) continue;
          const separator = line.indexOf(':');
          const name = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
          if (name === 'event') event = value;
          else if (name === 'data') data.push(value);
        }
        if (data.length) onEvent({ event, data: data.join('\n') });
      }
      if (final && buffered.trim()) buffered = '';
    },
  };
}
