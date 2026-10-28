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
    assert.equal((await rpc('tools/list', {})).tools.length, 5);
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
