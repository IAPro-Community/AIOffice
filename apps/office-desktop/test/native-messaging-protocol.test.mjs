import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNativeFrameDecoder,
  createSseDecoder,
  encodeNativeFrame,
  validateNativeRequest,
} from '../native-messaging-protocol.mjs';

test('Native Messaging frames use a little-endian byte length and decode split or batched messages', () => {
  const first = encodeNativeFrame({ v: 1, id: 'one', action: 'connect', text: 'ação' });
  const second = encodeNativeFrame({ v: 1, id: 'two', action: 'open' });
  assert.equal(first.readUInt32LE(0), first.length - 4);
  const received = [];
  const decoder = createNativeFrameDecoder((value) => received.push(value));
  decoder.push(first.subarray(0, 2));
  decoder.push(Buffer.concat([first.subarray(2), second]));
  assert.deepEqual(received, [
    { v: 1, id: 'one', action: 'connect', text: 'ação' },
    { v: 1, id: 'two', action: 'open' },
  ]);
});

test('Native Messaging decoder rejects oversized, malformed, and incomplete frames', () => {
  const failures = [];
  const tooLarge = Buffer.alloc(4);
  tooLarge.writeUInt32LE(1025);
  createNativeFrameDecoder(() => {}, { maxBytes: 1024, onError: (error) => failures.push(error) }).push(tooLarge);
  const badJson = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from('{')]);
  createNativeFrameDecoder(() => {}, { onError: (error) => failures.push(error) }).push(badJson);
  const partial = createNativeFrameDecoder(() => {}, { onError: (error) => failures.push(error) });
  partial.push(Buffer.from([3, 0, 0, 0, 0x7b]));
  partial.end();
  assert.equal(failures.length, 3);
});

test('Native Messaging request validation limits protocol version and supported actions', () => {
  assert.equal(validateNativeRequest({ v: 1, id: '1', action: 'connect' }), undefined);
  assert.match(validateNativeRequest({ v: 2, id: '1', action: 'connect' }), /incompatível/);
  assert.match(validateNativeRequest({ v: 1, id: '1', action: 'run' }), /não permitida/);
  assert.match(validateNativeRequest({ v: 1, id: '1'.repeat(81), action: 'stop' }), /Identificador/);
});

test('SSE decoder handles CRLF, multiline data, split chunks, and comments', () => {
  const events = [];
  const decoder = createSseDecoder((event) => events.push(event));
  decoder.push(Buffer.from(': heartbeat\r\nevent: feed\r\ndata: [{"id":\r\n'));
  decoder.push(Buffer.from('data: "a"}]\r\n\r\nevent: notice\ndata: []\n\n'));
  assert.deepEqual(events, [
    { event: 'feed', data: '[{"id":\n"a"}]' },
    { event: 'notice', data: '[]' },
  ]);
});
