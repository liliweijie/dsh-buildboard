import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('MCP discovery, local HTTP auth, CRUD and script injection protection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'board-protocol-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {env: {...process.env, BUILDBOARD_DATA_DIR: dir}, stdio: ['pipe', 'pipe', 'pipe']});
  const pending = new Map(); let id = 0;
  const lines = createInterface({input: child.stdout});
  lines.on('line', line => {const message = JSON.parse(line); pending.get(message.id)?.(message.result); pending.delete(message.id);});
  function rpc(method, params) { return new Promise(resolve => { const sequence = ++id; pending.set(sequence, resolve); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: sequence, method, params}) + '\n'); }); }
  try {
    assert.equal((await rpc('initialize', {})).serverInfo.name, 'buildboard-codex');
    const discovery = await rpc('tools/list', {});
    assert.equal(discovery.tools.length, 6);
    const app = discovery.tools.find(tool => tool.name === 'open_buildboard');
    assert.deepEqual(app._meta['openai/ui'].entrypoints, [{type: 'global'}, {type: 'thread'}]);
    assert.deepEqual(discovery.tools.find(tool => tool.name === 'buildboard_ui')._meta.ui.visibility, ['app']);
    const resource = (await rpc('resources/read', {uri: app._meta.ui.resourceUri})).contents[0];
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.text.includes('ui/initialize'));
    assert.ok(resource.text.includes('buildboardNative'));
    assert.ok(!resource.text.includes('src="/app.js"'));
    assert.ok(!resource.text.includes('href="/style.css"'));
    assert.deepEqual(resource._meta.ui.csp.connectDomains, []);
    const saved = await rpc('tools/call', {name: 'buildboard_ui', arguments: {action: 'notes', data: {text: 'Saved from native panel'}}});
    assert.ok(saved.structuredContent.id);
    const nativeList = await rpc('tools/call', {name: 'buildboard_ui', arguments: {action: 'notes'}});
    assert.equal(nativeList.structuredContent.notes[0].text, 'Saved from native panel');
    await rpc('tools/call', {name: 'buildboard_ui', arguments: {action: 'delete', data: {id: saved.structuredContent.id}}});
    const invalid = await rpc('tools/call', {name: 'buildboard_ui', arguments: {action: 'arbitrary-command'}});
    assert.equal(invalid.isError, true);
    const result = await rpc('tools/call', {name: 'open_buildboard'});
    const {url} = JSON.parse(result.content[0].text); const parsed = new URL(url); const token = parsed.hash.slice(1); parsed.hash = '';
    const api = (path, data, headers = {}) => fetch(new URL(path, parsed), {method: data ? 'POST' : 'GET', headers: {'x-buildboard-token': token, 'Content-Type': 'application/json', ...headers}, ...(data ? {body: JSON.stringify(data)} : {})});
    assert.equal((await fetch(new URL('/api/notes', parsed))).status, 403);
    assert.equal((await api('/api/notes', undefined, {origin: 'https://evil.example'})).status, 403);
    const page = await fetch(parsed); assert.equal(page.status, 200); assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
    const note = await (await api('/api/notes', {text: '<script>alert(1)</script>'})).json(); assert.ok(note.id);
    const list = await (await api('/api/notes')).json(); assert.equal(list.notes[0].text, '<script>alert(1)</script>');
    const prepared = await rpc('tools/call', {name: 'prepare_note_analysis', arguments: {id: note.id}}); assert.ok(prepared.content[0].text.includes('<note>'));
    assert.equal((await api('/api/delete', {id: note.id})).status, 200);
    assert.equal((await (await api('/api/notes')).json()).notes.length, 0);
    assert.equal((await api('/api/notes', {text: 'x', images: ['javascript:bad']})).status, 400);
  } finally { child.stdin.end(); child.kill(); lines.close(); await rm(dir, {recursive: true, force: true}); }
});
