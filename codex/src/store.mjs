import {mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';

export function validateNote(value) {
  if (!value || typeof value.text !== 'string' || value.text.length > 4000) throw new Error('正文最多 4000 字');
  const images = value.images ?? [];
  if (!Array.isArray(images) || images.length > 6 || images.some(x => typeof x !== 'string' || x.length > 240000 || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(x))) throw new Error('图片格式或大小不符合要求');
  if (!value.text.trim() && !images.length) throw new Error('请写点内容或添加图片');
  if (typeof value.title !== 'undefined' && (typeof value.title !== 'string' || value.title.length > 80)) throw new Error('标题最多 80 字');
  return {text: value.text, title: value.title?.trim() || value.text.trim().slice(0, 32) || '图片便签', images, done: value.done === true};
}
export class Store {
  constructor(dir) { this.dir = dir; this.path = join(dir, 'notes.v1.json'); this.queue = Promise.resolve(); }
  async read() {
    await mkdir(this.dir, {recursive: true, mode: 0o700});
    try { return this.parse(await readFile(this.path, 'utf8')); }
    catch (e) {
      if (e.code === 'ENOENT') return [];
      // Recover a corrupted primary only from a valid backup; never silently overwrite it.
      try { return this.parse(await readFile(this.path + '.backup', 'utf8')); }
      catch { throw new Error('便签文件损坏，已保留原文件，请先恢复备份'); }
    }
  }
  parse(raw) {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.notes)) throw new Error('Invalid notes file');
    return value.notes;
  }
  async lock() {
    await mkdir(this.dir, {recursive: true, mode: 0o700});
    const path = this.path + '.lock';
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await mkdir(path, {mode: 0o700});
        await writeFile(join(path, 'pid'), String(process.pid));
        return () => rm(path, {recursive: true, force: true});
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const pid = Number(await readFile(join(path, 'pid'), 'utf8'));
          if (Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') await rm(path, {recursive: true, force: true}); }
          }
        } catch { /* Another process may still be creating its lock. */ }
        await delay(50);
      }
    }
    throw new Error('便签正被另一窗口保存，请稍后重试');
  }
  mutate(fn) {
    const operation = this.queue.then(async () => {
      const unlock = await this.lock();
      try {
      const notes = await this.read(); const result = fn(notes);
      if (notes.length > 500) throw new Error('最多保存 500 条便签');
      const data = JSON.stringify({version: 1, notes});
      if (Buffer.byteLength(data) > 32 * 1024 * 1024) throw new Error('便签空间已满，请导出后清理');
      // Back up the validated current state, not a potentially corrupted primary file.
      await writeFile(this.path + '.backup', JSON.stringify({version: 1, notes: await this.read()}), {mode: 0o600});
      const temp = this.path + '.' + randomUUID();
      await writeFile(temp, data, {mode: 0o600}); await rename(temp, this.path); return result;
      } finally { await unlock(); }
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  save(input) {
    const clean = validateNote(input);
    return this.mutate(notes => {
      const previous = input.id ? notes.find(n => n.id === input.id) : null;
      if (input.id && !previous) throw new Error('便签不存在');
      const note = {...clean, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now()};
      if (previous) notes[notes.indexOf(previous)] = note; else notes.unshift(note);
      return note;
    });
  }
  remove(id) { return this.mutate(notes => { const index = notes.findIndex(n => n.id === id); if (index < 0) throw new Error('便签不存在'); notes.splice(index, 1); return {ok: true}; }); }
}
