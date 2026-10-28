import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('native panel initializes and calls tools directly without a chat/model turn', async () => {
  const sent = []; const handlers = [];
  const parent = {postMessage: (message, origin) => sent.push({message, origin})};
  const context = vm.createContext({setTimeout, clearTimeout, window: {parent, addEventListener: (_, listener) => handlers.push(listener)}});
  const script = await readFile(new URL('../public/native-bridge.js', import.meta.url), 'utf8');
  vm.runInContext(script, context);
  assert.equal(sent[0].message.method, 'ui/initialize');
  // A foreign frame cannot complete the handshake.
  handlers[0]({source: {}, origin: 'https://evil.example', data: {jsonrpc: '2.0', id: 1, result: {}}});
  assert.equal(sent.length, 1);
  handlers[0]({source: parent, origin: 'https://chatgpt.com', data: {jsonrpc: '2.0', id: 1, result: {hostInfo: {name: 'test-host'}, hostCapabilities: {}}}});
  const resultPromise = vm.runInContext("buildboardNative.call('notes')", context);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(sent[1].message.method, 'ui/notifications/initialized');
  const call = sent[2]; assert.equal(call.message.method, 'tools/call'); assert.equal(call.message.params.name, 'buildboard_ui'); assert.equal(call.message.params.arguments.action, 'notes');
  assert.equal(call.origin, 'https://chatgpt.com');
  handlers[0]({source: parent, origin: 'https://chatgpt.com', data: {jsonrpc: '2.0', id: call.message.id, result: {structuredContent: {notes: []}}}});
  assert.equal((await resultPromise).notes.length, 0);
  assert.ok(sent.every(({message}) => !['ui/message', 'ui/update-model-context'].includes(message.method)));
});
