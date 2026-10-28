const $ = id => document.getElementById(id);
const token = location.hash.slice(1) || sessionStorage.getItem('buildboard-token');
if (token) sessionStorage.setItem('buildboard-token', token);
history.replaceState(null, '', location.pathname);
let notes = [], images = [], editing = null, selected = null, saving = false, processing = false;
const say = text => { $('message').textContent = text; };
async function api(path, data) {
  const response = await fetch(`/api/${path}`, {method: data === undefined ? 'GET' : 'POST', headers: {'x-buildboard-token': token || '', 'Content-Type': 'application/json'}, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '请求失败'); return value;
}
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, fn, label) { const node = el('button', text); node.type = 'button'; if (label) node.setAttribute('aria-label', label); node.onclick = () => Promise.resolve().then(fn).catch(e => say(e.message)); return node; }
async function refreshNotes() { notes = (await api('notes')).notes; render(); }
function render() {
  $('notes').replaceChildren(); $('note-count').textContent = notes.length;
  if (!notes.length) $('notes').append(el('p', '还没有记录，先写下一个想法。', 'empty'));
  let day = '';
  for (const note of notes) {
    const date = new Date(note.createdAt); const current = date.toLocaleDateString('zh-CN');
    if (day !== current) { day = current; $('notes').append(el('h3', day, 'day')); }
    const article = el('article', undefined, `note${note.done ? ' done' : ''}`);
    const top = el('div', undefined, 'note-top'); const title = el('div', note.title, 'note-title');
    const time = el('time', date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})); time.dateTime = date.toISOString();
    title.ondblclick = () => edit(note); top.append(title, time); article.append(top, el('p', note.text, 'note-content'));
    const gallery = el('div', undefined, 'images');
    for (const src of note.images) { const img = el('img'); img.src = src; img.alt = '便签附件'; gallery.append(img); }
    article.append(gallery);
    const actions = el('div', undefined, 'note-actions');
    actions.append(button(note.done ? '✓ 已完成' : '待办', async () => { await api('notes', {...note, done: !note.done}); await refreshNotes(); }));
    actions.append(button('编辑', () => edit(note)));
    actions.append(button('分析', () => { selected = note; $('analysis-result').textContent = ''; $('analysis-dialog').showModal(); }));
    actions.append(button('删除', async () => { if (!confirm(`删除“${note.title}”？`)) return; await api('delete', {id: note.id}); if (editing === note.id) clear(); await refreshNotes(); }));
    article.append(actions); $('notes').append(article);
  }
}
function attachments() {
  $('attachments').replaceChildren(); images.forEach((src, i) => {
    const wrapper = el('div', undefined, 'attachment'); const img = el('img'); img.src = src; img.alt = `附件 ${i + 1}`;
    wrapper.append(img, button('×', () => { images.splice(i, 1); attachments(); }, `移除附件 ${i + 1}`)); $('attachments').append(wrapper);
  });
}
function edit(note) { editing = note.id; $('title').value = note.title; $('text').value = note.text; images = [...note.images]; attachments(); $('editor-title').textContent = '编辑便签'; $('cancel').hidden = false; $('save').textContent = '保存修改'; count(); $('text').focus(); }
function clear() { editing = null; images = []; $('note-form').reset(); attachments(); $('editor-title').textContent = '随手记'; $('cancel').hidden = true; $('save').textContent = '记下'; count(); }
function count() { $('count').textContent = `${$('text').value.length} / 4000`; }
$('text').oninput = count;
$('cancel').onclick = clear;
$('note-form').onsubmit = async event => {
  event.preventDefault(); if (saving || processing) return; saving = true; $('save').disabled = true;
  try { const previous = notes.find(n => n.id === editing); await api('notes', {id: editing || undefined, title: $('title').value, text: $('text').value, images, done: previous?.done || false}); clear(); say('已保存'); await refreshNotes(); }
  catch (e) { say(e.message); } finally { saving = false; $('save').disabled = false; }
};
$('text').onkeydown = event => { if (event.isComposing) return; if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); const area = $('text'); area.setRangeText('\n', area.selectionStart, area.selectionEnd, 'end'); count(); return; } if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $('note-form').requestSubmit(); } if (event.key === 'Escape' && editing) clear(); };
async function compress(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('单张原图不能超过 20MB');
  const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let result;
  for (const quality of [.82, .65, .45, .25]) { result = canvas.toDataURL('image/webp', quality); if (result.length <= 240000) return result; }
  throw new Error('图片压缩后仍过大，请缩小图片后重试');
}
async function addFiles(files) {
  if (processing || saving) return; processing = true; $('save').disabled = true;
  try {
    const incoming = [...files]; if (images.length + incoming.length > 6) throw new Error('每条便签最多 6 张图片');
    const processed = []; for (const file of incoming) processed.push(await compress(file));
    images.push(...processed); attachments(); say('图片已添加，保存后生效');
  } catch (e) { say(e.message); } finally { processing = false; $('save').disabled = false; $('files').value = ''; }
}
$('files').onchange = event => addFiles(event.target.files);
$('text').onpaste = event => { const files = [...(event.clipboardData?.files || [])]; if (files.length) { event.preventDefault(); addFiles(files); } };
const composer = document.querySelector('.composer');
composer.ondragover = event => { event.preventDefault(); composer.classList.add('drop'); };
composer.ondragleave = () => composer.classList.remove('drop');
composer.ondrop = event => { event.preventDefault(); composer.classList.remove('drop'); addFiles(event.dataTransfer.files); };
async function refreshUsage() {
  try {
    const value = await api('usage'); const window = value.windows?.[0];
    const expired = window?.resetsAt && window.resetsAt * 1000 <= Date.now();
    $('remaining').textContent = window && !expired ? `${Math.floor(window.remainingPercent)}%` : '—';
    $('meter').value = window && !expired ? window.remainingPercent : 0;
    $('meter').hidden = !window || expired;
    $('quota-detail').textContent = window && !expired ? `${value.windows.length > 1 ? window.label + ' · ' : ''}${window.resetsAt ? new Date(window.resetsAt * 1000).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) + ' 重置' : '重置时间未知'} · 每 30 秒刷新` : expired ? '窗口已到期，正在等待账户刷新' : value.message;
    $('quota').title = value.windows?.map(w => `${w.label}：剩余 ${Math.floor(w.remainingPercent)}%`).join('\n') || value.message;
  } catch { $('remaining').textContent = '—'; $('meter').hidden = true; $('quota-detail').textContent = '连接中断 · 请从 Codex 重新打开'; }
}
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({version: 1, notes}, null, 2)], {type: 'application/json'}));
  const link = el('a'); link.href = url; link.download = `buildboard-codex-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('close-analysis').onclick = () => $('analysis-dialog').close();
$('run-analysis').onclick = async () => {
  $('run-analysis').disabled = true; $('analysis-result').textContent = '正在分析…';
  try { const result = await api('analysis', {id: selected.id, workspace: $('workspace').value.trim() || undefined}); $('analysis-result').textContent = result.text; }
  catch (e) { $('analysis-result').textContent = e.message; } finally { $('run-analysis').disabled = false; }
};
refreshNotes().catch(e => say(e.message)); refreshUsage();
setInterval(() => { if (!document.hidden) refreshUsage(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshUsage(); refreshNotes().catch(e => say(e.message)); } });
