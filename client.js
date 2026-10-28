/* global window, document, navigator */
/**
 * Client half of the buildboard bundle.
 *
 * The header icon (registered in the session header utilities) toggles a popup
 * window. Its header-left box shows the live DeepSeek account balance and the
 * session's live token usage; the body keeps the composer on the left and a
 * foldable history of timestamped, editable-title entries on the right.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-buildboard',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    const OVERLAY_SLOT = 'shell.overlay';
    const HEADER_SLOT = 'conversation.session.header.utilities';
    const NS = 'dsh-buildboard';
    // 笔记主键：永远不要改名或删除，否则会丢用户数据
    const NOTES_KEY = 'dsh.blackboard.notes.v1';
    // 同一个数组的备份键：主键损坏时自动恢复
    const NOTES_BACKUP_KEY = 'dsh.blackboard.notes.backup.v1';
    const FOLD_KEY = 'dsh.buildboard.history.folded.v1';
    const MAX_NOTES = 500;
    const MAX_NOTE_CHARS = 4000;
    const MAX_IMAGES = 6;
    const MAX_IMAGE_EDGE = 1200;
    const IMAGE_QUALITY = 0.82;
    const MAX_IMAGE_CHARS = 240000;
    const MAX_STORE_CHARS = 2000000;
    const MAX_TITLE_CHARS = 80;
    const SHORTCUT = 'Alt+B';
    const BALANCE_REFRESH_MS = 30000;

    const ZH = {
      title: 'buildboard',
      open: '打开 buildboard',
      close: '关闭 buildboard',
      placeholder: '写点什么…',
      markDone: '记下',
      analyzeNote: '分析',
      analyzing: '正在创建分析会话…',
      analyzeFailed: '创建分析会话失败：',
      untitledSession: '未命名对话',
      rename: '重命名',
      editContent: '编辑内容',
      editing: '正在编辑',
      cancelEdit: '取消编辑',
      saveEdit: '完成编辑',
      titleHint: '双击重命名',
      addImage: '插入图片',
      removeImage: '移除图片',
      imageNote: '图片',
      imageCount: '{n} 张图片',
      imageFailed: '图片处理失败',
      storageFull: '存储空间不足，图片未保存，请删掉一些图片',
      inputHint: 'Enter 完成 · Ctrl+Enter 换行',
      deleteNote: '删除这条',
      emptyHistory: '还没有记录',
      foldHistory: '收起历史',
      unfoldHistory: '展开历史',
      balance: '余额',
      usage: '用量',
      bonus: '赠金',
      signedOut: '未登录',
      usageInput: '输入',
      usageCacheRead: '缓存读',
      usageCacheWrite: '缓存写',
      usageOutput: '输出',
      usageContext: '上下文',
      status: '状态',
      statusOpen: '待办',
      statusDone: '完成',
    };

    const EN = {
      title: 'buildboard',
      open: 'Open buildboard',
      close: 'Close buildboard',
      placeholder: 'Write something…',
      markDone: 'Mark done',
      analyzeNote: 'Analyze',
      analyzing: 'Creating analysis session…',
      analyzeFailed: 'Could not create the analysis session: ',
      untitledSession: 'Untitled conversation',
      rename: 'Rename',
      editContent: 'Edit content',
      editing: 'Editing',
      cancelEdit: 'Cancel edit',
      saveEdit: 'Save changes',
      titleHint: 'Double-click to rename',
      addImage: 'Insert image',
      removeImage: 'Remove image',
      imageNote: 'Image',
      imageCount: '{n} images',
      imageFailed: 'Image processing failed',
      storageFull: 'Not enough storage — image was not saved. Remove some images.',
      inputHint: 'Enter to finish · Ctrl+Enter for a new line',
      deleteNote: 'Delete this entry',
      emptyHistory: 'No entries yet',
      foldHistory: 'Fold history',
      unfoldHistory: 'Unfold history',
      balance: 'Balance',
      usage: 'Usage',
      bonus: 'Bonus',
      signedOut: 'Signed out',
      usageInput: 'Input',
      usageCacheRead: 'Cache read',
      usageCacheWrite: 'Cache write',
      usageOutput: 'Output',
      usageContext: 'Context',
      status: 'Status',
      statusOpen: 'Open',
      statusDone: 'Done',
    };

    const DICTS = { 'zh-CN': ZH, zh: ZH, en: EN };

    const pad2 = (value) => (value < 10 ? '0' + value : String(value));

    function formatRowTime(timestamp) {
      const date = new Date(timestamp);
      return pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' +
        pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function formatFull(timestamp) {
      const date = new Date(timestamp);
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' +
        pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
    }

    function formatTokens(value) {
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (value >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return String(Math.round(value));
    }

    function groupThousands(text) {
      const parts = text.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }

    /** Platform Web formatting: two decimals, positive amounts truncated, sub-cent below 0.01. */
    function formatMoney(amount, currency) {
      const symbol = currency === 'USD' ? '$' : '¥';
      const value = typeof amount === 'string' ? Number(amount) : amount;
      if (typeof value !== 'number' || !isFinite(value)) return symbol + String(amount);
      if (value === 0) return symbol + '0.00';
      if (value < 0) {
        const absolute = Math.abs(value);
        return '-' + symbol + (absolute < 0.01 ? '0.01' : groupThousands(absolute.toFixed(2)));
      }
      if (value < 0.01) return '<' + symbol + '0.01';
      const truncated = Math.floor(value * 100) / 100;
      return symbol + groupThousands(truncated.toFixed(2));
    }

    function clientVersion() {
      try {
        const boot = window.__DSH_BOOT__;
        if (boot && boot.release && typeof boot.release.version === 'string' && boot.release.version) {
          return boot.release.version;
        }
      } catch (error) {
        /* fall through */
      }
      return '0.2.1-rc.2';
    }

    function uid() {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    /** The first sentence of a note, used as its default name. */
    function defaultTitle(text) {
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return '';
      const line = trimmed.split('\n')[0];
      const matched = line.match(/^[^。！？!?；;]+/);
      let sentence = (matched ? matched[0] : line).trim();
      if (!sentence) sentence = line.trim();
      if (sentence.length > 32) sentence = sentence.slice(0, 32) + '…';
      return sentence;
    }

    function displayTitle(note) {
      const custom = typeof note.title === 'string' ? note.title.trim() : '';
      return custom || defaultTitle(note.text);
    }

    function parseStoredNotes(raw) {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        return null;
      }
    }

    /**
     * 只补默认字段，保留每条记录的全部已有字段与内容。
     * 未来新增字段、超长文本、超过 MAX_NOTES 的旧记录都不会被丢弃。
     */
    function notesFromItems(items) {
      const notes = [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const text = typeof item.text === 'string' ? item.text : '';
        const createdAt = typeof item.createdAt === 'number' && isFinite(item.createdAt)
          ? item.createdAt
          : Date.now();
        notes.push(Object.assign({}, item, {
          id: typeof item.id === 'string' && item.id ? item.id : uid(),
          title: typeof item.title === 'string' && item.title.trim() ? item.title : null,
          text,
          createdAt,
          status: item.status === 'done' ? 'done' : 'open',
        }));
      }
      notes.sort((a, b) => b.createdAt - a.createdAt);
      return notes;
    }

    function loadNotes() {
      let raw = null;
      try {
        raw = window.localStorage.getItem(NOTES_KEY);
      } catch (error) {
        raw = null;
      }
      const primary = parseStoredNotes(raw);
      if (primary) return notesFromItems(primary);

      // 主键缺失或损坏：尝试备份并恢复主键，绝不返回空数组去覆盖旧数据
      let backupRaw = null;
      try {
        backupRaw = window.localStorage.getItem(NOTES_BACKUP_KEY);
      } catch (error) {
        backupRaw = null;
      }
      const backup = parseStoredNotes(backupRaw);
      if (backup) {
        const restored = notesFromItems(backup);
        try {
          window.localStorage.setItem(NOTES_KEY, JSON.stringify(restored));
        } catch (error) {
          /* recovery best effort */
        }
        return restored;
      }
      return [];
    }

    function loadImageElement(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
      });
    }

    /** 读取图片文件：缩放到最大边 1200、webp 有损压缩；太大时自动降质/缩小。 */
    function imageRecordFromFile(file) {
      return new Promise((resolve, reject) => {
        let url = '';
        try {
          url = URL.createObjectURL(file);
        } catch (error) {
          reject(error);
          return;
        }
        loadImageElement(url).then((img) => {
          let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
          let quality = IMAGE_QUALITY;
          let width = 0;
          let height = 0;
          let src = '';
          for (let attempt = 0; attempt < 6; attempt += 1) {
            width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
            height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('canvas unavailable');
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, 0, width, height);
            src = canvas.toDataURL('image/webp', quality);
            if (src.indexOf('data:image/webp') !== 0) src = canvas.toDataURL('image/jpeg', quality);
            if (src.length <= MAX_IMAGE_CHARS) break;
            quality = Math.max(0.42, quality - 0.12);
            scale *= 0.82;
          }
          URL.revokeObjectURL(url);
          if (src.length > MAX_IMAGE_CHARS) {
            resolve(null);
            return;
          }
          resolve({ id: uid(), src, w: width, h: height });
        }).catch((error) => {
          try {
            URL.revokeObjectURL(url);
          } catch (ignore) {
            /* ignore */
          }
          reject(error);
        });
      });
    }

    function persistNotes(notes) {
      if (!Array.isArray(notes)) return true;
      try {
        const serialized = JSON.stringify(notes);
        if (serialized.length > MAX_STORE_CHARS) return false;
        // 先写备份，再写主键；写入失败时旧数据保持不变
        window.localStorage.setItem(NOTES_BACKUP_KEY, serialized);
        window.localStorage.setItem(NOTES_KEY, serialized);
        return true;
      } catch (error) {
        /* keep working in memory when storage is unavailable */
        return false;
      }
    }

    function readFolded() {
      try {
        return window.localStorage.getItem(FOLD_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    function writeFolded(folded) {
      try {
        window.localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
      } catch (error) {
        /* preference only */
      }
    }

    function acquireLocale(ctx) {
      let api = null;
      try {
        const found = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : null;
        if (found && typeof found.register === 'function' && typeof found.bind === 'function') {
          api = found;
          for (const id of ['en', 'zh-CN', 'zh']) {
            try {
              ctx.effect(() => api.register(NS, id, DICTS[id]));
            } catch (error) {
              /* duplicate registration on re-apply is harmless */
            }
          }
        }
      } catch (error) {
        api = null;
      }
      return api;
    }

    function createTranslate(api) {
      let bound = null;
      if (api) {
        try {
          bound = api.bind(NS);
        } catch (error) {
          bound = null;
        }
      }
      return function translate(key, localeId) {
        if (bound) {
          try {
            const value = bound(key);
            if (typeof value === 'string' && value !== key) return value;
          } catch (error) {
            /* fall back to the built-in dictionary */
          }
        }
        const dict = DICTS[localeId] || ZH;
        return dict[key] || ZH[key] || key;
      };
    }

    function activeLocale(api) {
      try {
        const snapshot = api && typeof api.getLocale === 'function' ? api.getLocale() : null;
        if (snapshot && typeof snapshot.active === 'string') return snapshot.active;
      } catch (error) {
        /* fall back to the browser language */
      }
      try {
        return /^zh/i.test(navigator.language) ? 'zh-CN' : 'en';
      } catch (error) {
        return 'zh-CN';
      }
    }

    /* The popup state is shared by the header icon and the popup itself. */
    const popup = { open: false, anchorEl: null, anchorRect: null, usage: null, pressure: null, sessionId: null };
    const popupListeners = new Set();

    function notifyPopup() {
      for (const listener of popupListeners) {
        try {
          listener();
        } catch (error) {
          /* one listener must not break the others */
        }
      }
    }

    function patchPopup(next) {
      Object.assign(popup, next);
      notifyPopup();
    }

    function subscribePopup(listener) {
      popupListeners.add(listener);
      return () => {
        popupListeners.delete(listener);
      };
    }

    function readAnchor(element) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return null;
      try {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      } catch (error) {
        return null;
      }
    }

    function setPopupOpen(open, anchorEl) {
      if (!open) {
        patchPopup({ open: false });
        return;
      }
      const rect = readAnchor(anchorEl) || popup.anchorRect;
      patchPopup({
        open: true,
        anchorEl: anchorEl || popup.anchorEl,
        anchorRect: rect || null,
      });
    }

    function togglePopup(anchorEl) {
      if (popup.open) {
        setPopupOpen(false);
        return;
      }
      setPopupOpen(true, anchorEl);
    }

    function AnalyzeGlyph() {
      return h('svg', { width: 15, height: 15, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M7.2 1.8l.95 2.35 2.35.95-2.35.95L7.2 8.4l-.95-2.35L3.9 5.1l2.35-.95z', fill: 'currentColor' }),
        h('path', { d: 'M11.8 8.6l.62 1.55 1.55.62-1.55.62-.62 1.55-.62-1.55-1.55-.62 1.55-.62z', fill: 'currentColor', opacity: 0.7 }));
    }

    function TriggerGlyph() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', 'aria-hidden': true, focusable: 'false' },
        h('rect', { x: 2.2, y: 3.2, width: 15.6, height: 11.6, rx: 2, stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
        h('path', { d: 'M5.6 7h5.6M5.6 9.8h7.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M5.2 16.8h4.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
    }

    function ChevronRightGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M6 3.5l4.5 4.5L6 12.5', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function ChevronLeftGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M10 3.5L5.5 8l4.5 4.5', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function CloseGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
    }

    function PencilGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M3 13l.8-3.2 6.6-6.6a1.4 1.4 0 0 1 2 0l1.4 1.4a1.4 1.4 0 0 1 0 2L7.2 12.2 4 13z', stroke: 'currentColor', strokeWidth: 1.3, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function CheckGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M3.4 8.4l3.1 3.1 6.1-6.8', stroke: 'currentColor', strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function ImageGlyph(props) {
      const size = props && props.size ? props.size : 14;
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('rect', { x: 2, y: 2.8, width: 12, height: 10.4, rx: 2, stroke: 'currentColor', strokeWidth: 1.3, fill: 'none' }),
        h('circle', { cx: 5.6, cy: 6.2, r: 1.2, fill: 'currentColor' }),
        h('path', { d: 'M2.6 11.8l3.2-3.3 2.5 2.4 2-1.9 3.1 2.8', stroke: 'currentColor', strokeWidth: 1.3, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function StatusOpenGlyph() {
      return h('svg', { width: 10, height: 10, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('circle', { cx: 6, cy: 6, r: 4, stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }));
    }

    function StatusDoneGlyph() {
      return h('svg', { width: 10, height: 10, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', { d: 'M2.4 6.3l2.4 2.4 4.8-5.2', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    const STYLES = `
.dsh-bb-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0 2px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9a9a9a);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dsh-bb-trigger:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, #ececec);
}
.dsh-bb-trigger.is-active {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.1));
  color: var(--dsw-alias-label-primary, #ececec);
}
.dsh-bb-trigger:focus-visible {
  outline: 1px solid var(--dsw-alias-border-l2, #4d4d4d);
  outline-offset: 1px;
}
.dsh-bb-window {
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid #2c2c2c;
  border-radius: 10px;
  background: #1a1a1a;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  pointer-events: auto;
  animation: dsh-bb-pop 130ms ease-out;
}
@keyframes dsh-bb-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.dsh-bb-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid #262626;
}
.dsh-bb-grow { flex: 1 1 auto; }
.dsh-bb-hud {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 10px;
  border: 1px solid #2e2e2e;
  border-radius: 7px;
  background: #161616;
}
.dsh-bb-hud-cell { display: flex; align-items: baseline; gap: 5px; }
.dsh-bb-hud-label { font-size: 10px; color: #6f6f6f; letter-spacing: 0.02em; }
.dsh-bb-hud-value {
  font-size: 12px;
  font-weight: 500;
  color: #dcdcdc;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-bb-hud-value.is-dim { color: #6f6f6f; font-weight: 400; }
.dsh-bb-hud-sep { width: 1px; height: 12px; background: #2c2c2c; }
.dsh-bb-iconbtn {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #8a8a8a;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dsh-bb-iconbtn:hover { background: #262626; color: #e6e6e6; }
.dsh-bb-iconbtn:focus-visible { outline: 1px solid #4d4d4d; outline-offset: 1px; }
.dsh-bb-body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.dsh-bb-compose {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.dsh-bb-input {
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
  padding: 14px 16px 6px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: #ededed;
  font-family: inherit;
  font-size: 14.5px;
  line-height: 1.65;
  caret-color: #e6e6e6;
}
.dsh-bb-input::placeholder { color: #5c5c5c; }
.dsh-bb-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 14px;
}
.dsh-bb-images {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 14px 0;
  max-height: 96px;
  overflow-y: auto;
}
.dsh-bb-thumb {
  position: relative;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid #2c2c2c;
  border-radius: 6px;
  background: #141414;
}
.dsh-bb-thumb-img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dsh-bb-thumb-del {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.66);
  color: #e6e6e6;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.dsh-bb-thumb-del:hover { background: rgba(240, 164, 143, 0.9); color: #141414; }
.dsh-bb-storage-warn {
  flex: 0 0 auto;
  padding: 8px 14px 0;
  font-size: 11px;
  line-height: 1.5;
  color: #f0a48f;
}
.dsh-bb-row-images {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #6f6f6f;
}
.dsh-bb-row-images svg { display: block; }
.dsh-bb-iconbtn.is-busy { opacity: 0.5; }
.dsh-bb-editbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 0;
}
.dsh-bb-editbar-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #c9a24a;
}
.dsh-bb-editbar .dsh-bb-iconbtn { width: 18px; height: 18px; }
.dsh-bb-row.is-editing {
  background: rgba(201, 162, 74, 0.06);
  box-shadow: inset 2px 0 0 #c9a24a;
}
.dsh-bb-iconbtn.is-active { background: #2c2c2c; color: #e6e6e6; }
.dsh-bb-done {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #3a3a3a;
  border-radius: 7px;
  background: transparent;
  color: #dedede;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.dsh-bb-done:hover:not(:disabled) { background: #242424; border-color: #4c4c4c; }
.dsh-bb-done:focus-visible { outline: 1px solid #8a8a8a; outline-offset: 2px; }
.dsh-bb-done:disabled { opacity: 0.35; cursor: default; }
.dsh-bb-history {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  width: 236px;
  min-height: 0;
  border-left: 1px solid #262626;
  background: #1d1d1d;
}
.dsh-bb-history-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 32px;
  padding: 0 6px;
}
.dsh-bb-history-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 10px 12px;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.dsh-bb-history-list::-webkit-scrollbar { width: 6px; }
.dsh-bb-history-list::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
.dsh-bb-rail {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 34px;
  min-height: 0;
  padding-top: 6px;
  border-left: 1px solid #262626;
  background: #1d1d1d;
}
.dsh-bb-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 11.5px;
  color: #5f5f5f;
}
.dsh-bb-row {
  position: relative;
  padding: 8px 0 9px;
  border-bottom: 1px solid #242424;
}
.dsh-bb-row:last-child { border-bottom: 0; }
.dsh-bb-row-title {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 0 40px 0 0;
  border: 0;
  background: transparent;
  color: #dedede;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}
.dsh-bb-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}
.dsh-bb-row-grow { flex: 1 1 auto; }
.dsh-bb-row-time {
  font-size: 10px;
  line-height: 1.4;
  color: #6b6b6b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-bb-status {
  display: inline-flex;
  align-items: center;
  border: 1px solid #333;
  border-radius: 5px;
  overflow: hidden;
  background: #181818;
}
.dsh-bb-status-seg {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 15px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5f5f5f;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dsh-bb-status-seg + .dsh-bb-status-seg { border-left: 1px solid #2c2c2c; }
.dsh-bb-status-seg:hover { color: #cfcfcf; background: #242424; }
.dsh-bb-status-seg.is-on { color: #e6e6e6; background: #2c2c2c; }
.dsh-bb-status-seg:focus-visible { outline: 1px solid #6a6a6a; outline-offset: -1px; }
.dsh-bb-row.is-done .dsh-bb-row-title { color: #8f8f8f; }
.dsh-bb-row-actions {
  position: absolute;
  top: 5px;
  right: 0;
  display: flex;
  gap: 1px;
  opacity: 0;
  transition: opacity 120ms ease;
}
.dsh-bb-row:hover .dsh-bb-row-actions,
.dsh-bb-row:focus-within .dsh-bb-row-actions { opacity: 1; }
.dsh-bb-rename {
  box-sizing: border-box;
  width: calc(100% - 40px);
  padding: 2px 6px;
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  background: #121212;
  color: #ededed;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  outline: none;
}
.dsh-bb-rename:focus { border-color: #575757; }
@media (hover: none) {
  .dsh-bb-row-actions { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-bb-window { animation: none; }
  .dsh-bb-trigger, .dsh-bb-iconbtn, .dsh-bb-row-actions, .dsh-bb-done, .dsh-bb-status-seg { transition: none; }
}
`;

    /** 分析 buildboard 某条记录时发给模型的指令。 */
    function buildNoteAnalysisPrompt(note) {
      const title = displayTitle(note) || '未命名';
      const imageCount = Array.isArray(note.images) ? note.images.length : 0;
      const lines = [
        '请分析我 buildboard 里的一条记录。',
        '',
        '- 记录标题：' + title,
        '- 记录时间：' + formatFull(note.createdAt),
        '- 记录内容：',
        note.text || '(没有文字内容)',
      ];
      if (imageCount) lines.push('- 附带图片：' + imageCount + ' 张（无法直接查看，可忽略）');
      lines.push(
        '',
        '请同时以只读方式读取当前工作区对应的对话记录（~/.dsh/sessions/ 下与工作目录对应的目录，只读、不要修改任何文件）作为背景，然后输出：',
        '1. 这条记录在说什么',
        '2. 结合工作区对话记录，它相关的上下文与进展',
        '3. 判断：是否值得推进、风险点、建议',
        '4. 如果值得做，列出下一步清单',
        '',
        '用中文分点简洁输出。',
      );
      return lines.join('\n');
    }

    function apply(ctx) {
      const localeApi = acquireLocale(ctx);
      const translate = createTranslate(localeApi);
      try {
        window.localStorage.removeItem('dsh.buildboard.debug');
      } catch (error) {
        /* leftover diagnostics only */
      }

      /**
       * The account Remote namespace is registered under the dotted service key
       * `remote.account`; look it up directly first, then through the gateway
       * service as a fallback.
       */
      function getAccountRemote() {
        try {
          const direct = ctx && typeof ctx.get === 'function' ? ctx.get('remote.account') : undefined;
          if (direct && typeof direct.getBalance === 'function') return direct;
        } catch (error) {
          /* try the gateway fallback */
        }
        try {
          const remote = ctx && typeof ctx.get === 'function' ? ctx.get('remote') : undefined;
          const account = remote && remote.account;
          if (account && typeof account.getBalance === 'function') return account;
        } catch (error) {
          /* namespace unavailable */
        }
        return null;
      }

      function accountMetadata() {
        return {
          version: clientVersion(),
          locale: activeLocale(localeApi),
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        };
      }

      function usePopupTick() {
        const [, force] = React.useReducer((value) => value + 1, 0);
        React.useEffect(() => subscribePopup(force), []);
      }

      function useLocaleTick() {
        const [, force] = React.useReducer((value) => value + 1, 0);
        React.useEffect(() => {
          if (!localeApi || typeof localeApi.subscribe !== 'function') return undefined;
          return localeApi.subscribe(() => force());
        }, []);
      }

      function makeT() {
        const localeId = activeLocale(localeApi);
        return (key) => translate(key, localeId);
      }

      function HeaderButton(props) {
        usePopupTick();
        useLocaleTick();
        const t = makeT();
        const useProjection = props && typeof props.useProjection === 'function' ? props.useProjection : null;
        const usage = useProjection ? useProjection('tokenUsage') : undefined;
        const pressure = useProjection ? useProjection('contextPressure') : undefined;

        const activeSessionId = props && typeof props.sessionId === 'string' && props.sessionId ? props.sessionId : null;

        React.useEffect(() => {
          patchPopup({ usage: usage || null, pressure: pressure || null, sessionId: activeSessionId });
        }, [usage, pressure, activeSessionId]);

        React.useEffect(() => () => {
          patchPopup({ usage: null, pressure: null, sessionId: null });
        }, []);

        return h('button', {
          type: 'button',
          className: 'dsh-bb-trigger' + (popup.open ? ' is-active' : ''),
          title: t('open') + ' (' + SHORTCUT + ')',
          'aria-label': t('open') + ' (' + SHORTCUT + ')',
          'aria-haspopup': 'dialog',
          'aria-expanded': popup.open,
          onClick: (event) => togglePopup(event.currentTarget),
        }, h(TriggerGlyph));
      }

      function getRemoteNamespace(name) {
        try {
          const direct = ctx && typeof ctx.get === 'function' ? ctx.get('remote.' + name) : null;
          if (direct) return direct;
        } catch (error) {
          /* fall through */
        }
        try {
          const remote = ctx && typeof ctx.get === 'function' ? ctx.get('remote') : null;
          const namespace = remote && remote[name];
          if (namespace) return namespace;
        } catch (error) {
          /* namespace unavailable */
        }
        return null;
      }

      /** Remote 方法统一返回 { ok, value } / { ok, value:false, error }，这里解包并抛出失败原因。 */
      function unwrapRemote(result) {
        if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return result;
        if (!result.ok) {
          const error = result.error || {};
          const code = typeof error.code === 'string' ? error.code : '';
          const message = typeof error.message === 'string' ? error.message : '';
          throw new Error((code + ' ' + message).trim() || 'remote call failed');
        }
        return result.value;
      }

      /** 通用：在 DeepSeek 新建一个分析会话，发送指令并尝试跳转过去。 */
      async function openAnalysisSession(sessionTitle, promptText, sessionId) {
        const sessions = getRemoteNamespace('session');
        if (!sessions || typeof sessions.create !== 'function' || typeof sessions.prompt !== 'function') {
          throw new Error('session remote unavailable');
        }
        let info = null;
        if (sessionId) {
          try {
            const listed = unwrapRemote(await sessions.list({}));
            const items = listed && Array.isArray(listed.items) ? listed.items : [];
            info = items.find((item) => item && item.sessionId === sessionId) || null;
          } catch (error) {
            info = null;
          }
        }
        const cwd = info && typeof info.cwd === 'string' ? info.cwd : '';
        const created = unwrapRemote(await sessions.create(cwd ? { cwd } : {}));
        const targetId = created && created.sessionId;
        if (!targetId) throw new Error('session create returned no sessionId');
        try {
          unwrapRemote(await sessions.rename({ sessionId: targetId, title: sessionTitle }));
        } catch (error) {
          /* 标题失败不影响分析 */
        }
        unwrapRemote(await sessions.prompt({
          requestId: uid(),
          sessionId: targetId,
          mode: 'queue',
          content: [{ type: 'text', text: promptText }],
        }));
        const uiWorkspace = ctx && typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : null;
        if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
          try {
            uiWorkspace.openSession(targetId);
          } catch (error) {
            try {
              uiWorkspace.openSession({ kind: 'session', sessionId: targetId });
            } catch (ignore) {
              try {
                uiWorkspace.openSession({ sessionId: targetId });
              } catch (ignoreAgain) {
                /* 新会话会出现在侧栏，可手动点开 */
              }
            }
          }
        }
        return targetId;
      }

      function Buildboard() {
        usePopupTick();
        useLocaleTick();
        const t = makeT();

        const [notes, setNotes] = React.useState(loadNotes);
        const [draft, setDraft] = React.useState('');
        const [folded, setFolded] = React.useState(readFolded);
        const [renamingId, setRenamingId] = React.useState(null);
        const [editingId, setEditingId] = React.useState(null);
        const [renameDraft, setRenameDraft] = React.useState('');
        const [balance, setBalance] = React.useState({ status: 'idle' });
        const [images, setImages] = React.useState([]);
        const [imageBusy, setImageBusy] = React.useState(false);
        const [storageError, setStorageError] = React.useState(false);
        const [analyzingId, setAnalyzingId] = React.useState(null);

        const windowRef = React.useRef(null);
        const textareaRef = React.useRef(null);
        const historyRef = React.useRef(null);
        const renameRef = React.useRef(null);
        const skipBlurRef = React.useRef(false);
        const dirtyRef = React.useRef(false);
        const fileInputRef = React.useRef(null);
        const imagesRef = React.useRef([]);

        React.useEffect(() => {
          // 只有用户真的改动过才写回，避免加载异常时用空数组覆盖旧数据
          if (!dirtyRef.current) return;
          setStorageError(!persistNotes(notes));
        }, [notes]);

        React.useEffect(() => {
          imagesRef.current = images;
        }, [images]);

        React.useEffect(() => {
          if (!popup.open) return undefined;
          let cancelled = false;
          const load = () => {
            try {
              const account = getAccountRemote();
              if (!account) {
                if (!cancelled) setBalance({ status: 'unavailable' });
                return;
              }
              const metadata = accountMetadata();
              Promise.resolve(account.getBalance(metadata)).then((result) => {
                if (cancelled) return;
                if (result && result.ok) {
                  const value = result.value;
                  if (!value) {
                    setBalance({ status: 'signed-out' });
                  } else if (value.status === 'ready') {
                    setBalance({
                      status: 'ready',
                      wallets: Array.isArray(value.value) ? value.value : [],
                      bonuses: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
                    });
                  } else {
                    setBalance({ status: 'error' });
                  }
                } else {
                  setBalance({ status: 'error' });
                }
              }).catch(() => {
                if (!cancelled) setBalance({ status: 'error' });
              });
            } catch (error) {
              if (!cancelled) setBalance({ status: 'error' });
            }
          };
          setBalance((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
          load();
          const timer = setInterval(load, BALANCE_REFRESH_MS);
          return () => {
            cancelled = true;
            clearInterval(timer);
          };
        }, [popup.open]);

        React.useEffect(() => {
          function onKeyDown(event) {
            if (!event) return;
            const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
            const toggled = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
              (event.code === 'KeyB' || key === 'b');
            if (toggled) {
              event.preventDefault();
              togglePopup(null);
              return;
            }
            if (event.key === 'Escape' && popup.open) setPopupOpen(false);
          }
          window.addEventListener('keydown', onKeyDown);
          return () => window.removeEventListener('keydown', onKeyDown);
        }, []);

        React.useEffect(() => {
          if (!popup.open) return undefined;
          function onPointerDown(event) {
            const target = event.target;
            const win = windowRef.current;
            if (win && win.contains(target)) return;
            const anchor = popup.anchorEl;
            if (anchor && typeof anchor.contains === 'function' && anchor.contains(target)) return;
            setPopupOpen(false);
          }
          document.addEventListener('pointerdown', onPointerDown, true);
          return () => document.removeEventListener('pointerdown', onPointerDown, true);
        }, [popup.open]);

        React.useEffect(() => {
          if (!popup.open) return undefined;
          function onResize() {
            const rect = readAnchor(popup.anchorEl);
            if (rect) patchPopup({ anchorRect: rect });
          }
          window.addEventListener('resize', onResize);
          return () => window.removeEventListener('resize', onResize);
        }, [popup.open]);

        React.useEffect(() => {
          if (!popup.open) return;
          const area = textareaRef.current;
          if (area) area.focus();
        }, [popup.open]);

        React.useEffect(() => {
          if (!renamingId) return;
          const input = renameRef.current;
          if (input) {
            input.focus();
            input.select();
          }
        }, [renamingId]);

        React.useEffect(() => {
          if (!editingId) return;
          const area = textareaRef.current;
          if (area) area.focus();
        }, [editingId]);

        function updateNotes(updater) {
          dirtyRef.current = true;
          setNotes(updater);
        }

        function commitDraft() {
          const text = draft.trim().slice(0, MAX_NOTE_CHARS);
          const attachments = images.slice(0, MAX_IMAGES);
          if (!text && attachments.length === 0) return;
          if (editingId) {
            updateNotes((prev) => prev.map((note) => (
              note.id === editingId
                ? Object.assign({}, note, { text, images: attachments, title: note.title || (text ? null : t('imageNote')) })
                : note
            )));
            setEditingId(null);
            setDraft('');
            setImages([]);
            const area = textareaRef.current;
            if (area) area.focus();
            return;
          }
          const note = {
            id: uid(),
            title: text ? null : t('imageNote'),
            text,
            images: attachments,
            createdAt: Date.now(),
            status: 'open',
          };
          updateNotes((prev) => [note].concat(prev).slice(0, MAX_NOTES));
          setDraft('');
          setImages([]);
          const area = textareaRef.current;
          if (area) area.focus();
          if (historyRef.current) historyRef.current.scrollTop = 0;
        }

        function addImageFiles(fileList) {
          const files = Array.from(fileList || []).filter((file) => file && typeof file.type === 'string' && file.type.indexOf('image/') === 0);
          if (!files.length) return;
          const room = Math.max(0, MAX_IMAGES - imagesRef.current.length);
          const batch = files.slice(0, room);
          if (!batch.length) return;
          setImageBusy(true);
          (async () => {
            const added = [];
            for (const file of batch) {
              try {
                const record = await imageRecordFromFile(file);
                if (record) added.push(record);
              } catch (error) {
                /* skip unreadable image */
              }
            }
            if (added.length) {
              setImages((prev) => prev.concat(added).slice(0, MAX_IMAGES));
            }
            setImageBusy(false);
          })();
        }

        function onFilePick(event) {
          addImageFiles(event.target.files);
          try {
            event.target.value = '';
          } catch (error) {
            /* ignore */
          }
        }

        function onDraftPaste(event) {
          const data = event.clipboardData;
          if (!data || !data.items) return;
          const files = [];
          for (const item of data.items) {
            if (item && typeof item.type === 'string' && item.type.indexOf('image/') === 0) {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
          if (!files.length) return;
          event.preventDefault();
          addImageFiles(files);
        }

        function onComposerDragOver(event) {
          if (event.dataTransfer && event.dataTransfer.types && Array.from(event.dataTransfer.types).indexOf('Files') >= 0) {
            event.preventDefault();
          }
        }

        function onComposerDrop(event) {
          const data = event.dataTransfer;
          if (!data || !data.files) return;
          const files = Array.from(data.files).filter((file) => file && typeof file.type === 'string' && file.type.indexOf('image/') === 0);
          if (!files.length) return;
          event.preventDefault();
          addImageFiles(files);
        }

        function startEditContent(note) {
          setEditingId(note.id);
          setRenamingId(null);
          setDraft(note.text);
          setImages(Array.isArray(note.images) ? note.images.slice() : []);
        }

        function cancelEdit() {
          setEditingId(null);
          setDraft('');
          setImages([]);
          const area = textareaRef.current;
          if (area) area.focus();
        }

        function removeNote(id) {
          updateNotes((prev) => prev.filter((note) => note.id !== id));
          if (renamingId === id) setRenamingId(null);
          if (editingId === id) {
            setEditingId(null);
            setDraft('');
            setImages([]);
          }
        }

        function setStatus(id, status) {
          updateNotes((prev) => prev.map((note) => (note.id === id ? Object.assign({}, note, { status }) : note)));
        }

        function startRename(note) {
          skipBlurRef.current = false;
          setRenamingId(note.id);
          setRenameDraft(displayTitle(note));
        }

        function commitRename() {
          if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
          }
          const id = renamingId;
          if (!id) return;
          const nextTitle = renameDraft.trim().slice(0, MAX_TITLE_CHARS);
          updateNotes((prev) => prev.map((note) => (
            note.id === id ? Object.assign({}, note, { title: nextTitle || null }) : note
          )));
          setRenamingId(null);
        }

        function onRenameKeyDown(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            skipBlurRef.current = true;
            setRenamingId(null);
            return;
          }
          if (event.key !== 'Enter') return;
          const native = event.nativeEvent;
          if (native && (native.isComposing || native.keyCode === 229)) return;
          event.preventDefault();
          commitRename();
        }

        function insertNewline() {
          const area = textareaRef.current;
          const value = draft;
          const start = area && typeof area.selectionStart === 'number' ? area.selectionStart : value.length;
          const end = area && typeof area.selectionEnd === 'number' ? area.selectionEnd : value.length;
          setDraft(value.slice(0, start) + '\n' + value.slice(end));
          if (area) {
            requestAnimationFrame(() => {
              try {
                area.selectionStart = area.selectionEnd = start + 1;
              } catch (error) {
                /* ignore */
              }
            });
          }
        }

        function onDraftKeyDown(event) {
          const native = event.nativeEvent;
          const composing = native && (native.isComposing || native.keyCode === 229);
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (editingId) cancelEdit();
            else setPopupOpen(false);
            return;
          }
          if (event.key !== 'Enter' || composing) return;
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            insertNewline();
            return;
          }
          if (event.shiftKey) return;
          event.preventDefault();
          commitDraft();
        }

        function toggleFold() {
          const next = !folded;
          setFolded(next);
          writeFolded(next);
        }

        async function analyzeNote(note) {
          if (!note || analyzingId) return;
          setAnalyzingId(note.id);
          try {
            const title = displayTitle(note) || t('untitledSession');
            await openAnalysisSession('分析 · ' + title, buildNoteAnalysisPrompt(note), popup.sessionId);
          } catch (error) {
            const message = t('analyzeFailed') + String(error && error.message ? error.message : error);
            try {
              console.error('[buildboard] ' + message);
            } catch (ignore) {
              /* ignore */
            }
            try {
              window.alert(message);
            } catch (ignore2) {
              /* ignore */
            }
          }
          setAnalyzingId(null);
        }

        if (!popup.open) return h(React.Fragment, null, h('style', { key: 'dsh-bb-styles' }, STYLES));

        const editingNote = editingId ? notes.find((note) => note.id === editingId) || null : null;
        const usage = popup.usage;
        const pressure = popup.pressure;
        const totalTokens = usage
          ? usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
          : null;

        let balanceText = '—';
        let balanceDim = true;
        let balanceTitle = '';
        if (balance.status === 'ready') {
          const wallet = (balance.wallets && balance.wallets[0]) || (balance.bonuses && balance.bonuses[0]) || null;
          if (wallet) {
            balanceText = formatMoney(wallet.balance, wallet.currency);
            balanceDim = false;
          }
          const lines = [];
          for (const entry of balance.wallets || []) lines.push(formatMoney(entry.balance, entry.currency));
          for (const entry of balance.bonuses || []) lines.push(t('bonus') + ' ' + formatMoney(entry.balance, entry.currency));
          balanceTitle = lines.join('\n');
        } else if (balance.status === 'signed-out') {
          balanceText = t('signedOut');
        } else if (balance.status === 'loading' || balance.status === 'idle') {
          balanceText = '…';
        }

        const usageText = totalTokens === null ? '—' : formatTokens(totalTokens) + ' tok';
        const usageLines = [];
        if (usage) {
          usageLines.push(t('usageInput') + ' ' + formatTokens(usage.uncachedInputTokens));
          usageLines.push(t('usageCacheRead') + ' ' + formatTokens(usage.cacheReadTokens));
          usageLines.push(t('usageCacheWrite') + ' ' + formatTokens(usage.cacheWriteTokens));
          usageLines.push(t('usageOutput') + ' ' + formatTokens(usage.outputTokens));
        }
        if (pressure && pressure.contextWindow && pressure.projectedTokens) {
          usageLines.push(t('usageContext') + ' ' + formatTokens(pressure.projectedTokens) + ' / ' + formatTokens(pressure.contextWindow));
        }
        const usageTitle = usageLines.join('\n');

        const anchorRect = popup.anchorRect;
        const anchorTop = anchorRect ? anchorRect.bottom + 8 : 56;
        const anchorRight = anchorRect ? Math.max(12, window.innerWidth - anchorRect.right) : 16;
        const maxWindowHeight = Math.max(260, (window.innerHeight || 800) - anchorTop - 16);
        const windowStyle = {
          top: anchorTop + 'px',
          right: anchorRight + 'px',
          height: Math.min(440, maxWindowHeight) + 'px',
        };

        const rows = notes.map((note) => {
          const renaming = renamingId === note.id;
          const done = note.status === 'done';
          const editing = editingId === note.id;
          return h('div', { className: 'dsh-bb-row' + (done ? ' is-done' : '') + (editing ? ' is-editing' : ''), key: note.id },
            renaming
              ? h('input', {
                ref: renameRef,
                className: 'dsh-bb-rename',
                value: renameDraft,
                'aria-label': t('rename'),
                spellCheck: false,
                onChange: (event) => setRenameDraft(event.target.value),
                onKeyDown: onRenameKeyDown,
                onBlur: commitRename,
              })
              : h('button', {
                type: 'button',
                className: 'dsh-bb-row-title',
                title: (note.text.length > 800 ? note.text.slice(0, 800) + '…' : note.text) + '\n' + t('titleHint'),
                onDoubleClick: () => startRename(note),
              }, displayTitle(note)),
            h('div', { className: 'dsh-bb-row-meta' },
              h('span', { className: 'dsh-bb-row-time', title: formatFull(note.createdAt) }, formatRowTime(note.createdAt)),
              (note.images && note.images.length)
                ? h('span', {
                    className: 'dsh-bb-row-images',
                    title: t('imageCount').replace('{n}', String(note.images.length)),
                  }, h(ImageGlyph, { size: 11 }), h('span', null, String(note.images.length)))
                : null,
              h('span', { className: 'dsh-bb-row-grow' }),
              h('div', { className: 'dsh-bb-status', role: 'group', 'aria-label': t('status') },
                h('button', {
                  type: 'button',
                  className: 'dsh-bb-status-seg' + (done ? '' : ' is-on'),
                  title: t('statusOpen'),
                  'aria-label': t('statusOpen'),
                  'aria-pressed': !done,
                  onClick: () => setStatus(note.id, 'open'),
                }, h(StatusOpenGlyph)),
                h('button', {
                  type: 'button',
                  className: 'dsh-bb-status-seg' + (done ? ' is-on' : ''),
                  title: t('statusDone'),
                  'aria-label': t('statusDone'),
                  'aria-pressed': done,
                  onClick: () => setStatus(note.id, 'done'),
                }, h(StatusDoneGlyph)))),
            h('div', { className: 'dsh-bb-row-actions' },
              h('button', {
                type: 'button',
                className: 'dsh-bb-iconbtn' + (editing ? ' is-active' : ''),
                title: t('editContent'),
                'aria-label': t('editContent'),
                onClick: () => startEditContent(note),
              }, h(PencilGlyph)),
              h('button', {
                type: 'button',
                className: 'dsh-bb-iconbtn' + (analyzingId === note.id ? ' is-busy' : ''),
                title: analyzingId === note.id ? t('analyzing') : t('analyzeNote'),
                'aria-label': analyzingId === note.id ? t('analyzing') : t('analyzeNote'),
                disabled: analyzingId !== null,
                onClick: () => analyzeNote(note),
              }, h(AnalyzeGlyph)),
              h('button', {
                type: 'button',
                className: 'dsh-bb-iconbtn',
                title: t('deleteNote'),
                'aria-label': t('deleteNote'),
                onClick: () => removeNote(note.id),
              }, h(CloseGlyph))));
        });

        const historyPane = folded
          ? h('div', { className: 'dsh-bb-rail' },
              h('button', {
                type: 'button',
                className: 'dsh-bb-iconbtn',
                title: t('unfoldHistory'),
                'aria-label': t('unfoldHistory'),
                onClick: toggleFold,
              }, h(ChevronLeftGlyph)))
          : h('div', { className: 'dsh-bb-history' },
              h('div', { className: 'dsh-bb-history-head' },
                h('button', {
                  type: 'button',
                  className: 'dsh-bb-iconbtn',
                  title: t('foldHistory'),
                  'aria-label': t('foldHistory'),
                  onClick: toggleFold,
                }, h(ChevronRightGlyph))),
              h('div', { className: 'dsh-bb-history-list', ref: historyRef },
                notes.length ? rows : h('div', { className: 'dsh-bb-empty' }, t('emptyHistory'))));

        return h(React.Fragment, null,
          h('style', { key: 'dsh-bb-styles' }, STYLES),
          h('div', {
            className: 'dsh-bb-window',
            ref: windowRef,
            style: windowStyle,
            role: 'dialog',
            'aria-label': t('title'),
          },
            h('div', { className: 'dsh-bb-head' },
              h('div', { className: 'dsh-bb-hud' },
                h('span', { className: 'dsh-bb-hud-cell', title: balanceTitle },
                  h('span', { className: 'dsh-bb-hud-label' }, t('balance')),
                  h('span', { className: 'dsh-bb-hud-value' + (balanceDim ? ' is-dim' : '') }, balanceText)),
                h('span', { className: 'dsh-bb-hud-sep' }),
                h('span', { className: 'dsh-bb-hud-cell', title: usageTitle },
                  h('span', { className: 'dsh-bb-hud-label' }, t('usage')),
                  h('span', { className: 'dsh-bb-hud-value' + (totalTokens === null ? ' is-dim' : '') }, usageText))),
              h('span', { className: 'dsh-bb-grow' }),
              h('button', {
                type: 'button',
                className: 'dsh-bb-iconbtn',
                title: t('close') + ' (Esc)',
                'aria-label': t('close'),
                onClick: () => setPopupOpen(false),
              }, h(CloseGlyph))),
            h('div', { className: 'dsh-bb-body' },
              h('div', {
                className: 'dsh-bb-compose',
                onDragOver: onComposerDragOver,
                onDrop: onComposerDrop,
              },
                editingNote
                  ? h('div', { className: 'dsh-bb-editbar' },
                      h('span', { className: 'dsh-bb-editbar-label' },
                        t('editing') + ' · ' + displayTitle(editingNote)),
                      h('button', {
                        type: 'button',
                        className: 'dsh-bb-iconbtn',
                        title: t('cancelEdit') + ' (Esc)',
                        'aria-label': t('cancelEdit'),
                        onClick: cancelEdit,
                      }, h(CloseGlyph)))
                  : null,
                images.length
                  ? h('div', { className: 'dsh-bb-images' },
                      images.map((image) => h('div', { className: 'dsh-bb-thumb', key: image.id },
                        h('img', { className: 'dsh-bb-thumb-img', src: image.src, alt: '' }),
                        h('button', {
                          type: 'button',
                          className: 'dsh-bb-thumb-del',
                          title: t('removeImage'),
                          'aria-label': t('removeImage'),
                          onClick: () => setImages((prev) => prev.filter((item) => item.id !== image.id)),
                        }, '\u00d7'))))
                  : null,
                storageError
                  ? h('div', { className: 'dsh-bb-storage-warn' }, t('storageFull'))
                  : null,
                h('textarea', {
                  ref: textareaRef,
                  className: 'dsh-bb-input',
                  value: draft,
                  placeholder: t('placeholder'),
                  'aria-label': t('placeholder'),
                  title: t('inputHint'),
                  spellCheck: false,
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown: onDraftKeyDown,
                  onPaste: onDraftPaste,
                }),
                h('div', { className: 'dsh-bb-foot' },
                  h('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: 'image/*',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: onFilePick,
                  }),
                  h('button', {
                    type: 'button',
                    className: 'dsh-bb-iconbtn' + (imageBusy ? ' is-busy' : ''),
                    title: imageBusy ? t('editing') : t('addImage'),
                    'aria-label': t('addImage'),
                    disabled: imageBusy || images.length >= MAX_IMAGES,
                    onClick: () => {
                      const input = fileInputRef.current;
                      if (input) input.click();
                    },
                  }, h(ImageGlyph)),
                  h('span', { className: 'dsh-bb-grow' }),
                  h('button', {
                    type: 'button',
                    className: 'dsh-bb-done',
                    title: editingNote ? t('saveEdit') : t('markDone'),
                    'aria-label': editingNote ? t('saveEdit') : t('markDone'),
                    onClick: commitDraft,
                    disabled: !draft.trim() && images.length === 0,
                  }, h(CheckGlyph)))),
              historyPane)));
      }

      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: 'buildboard',
        order: 5,
      }, Buildboard));

      ctx.slots.inject(HEADER_SLOT, () => ctx.slots.register({
        name: HEADER_SLOT,
        id: 'buildboard',
        order: 100,
      }, HeaderButton));

    }

    return {
      inject: ['slots'],
      apply,
    };
  },
});
