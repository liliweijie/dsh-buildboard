import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const UI_URI = 'ui://buildboard/codex.html';
export const UI_MIME = 'text/html;profile=mcp-app';
export function entrypointMetadata() {
  return {
    ui: {resourceUri: UI_URI},
    'openai/outputTemplate': UI_URI,
    'openai/ui': {entrypoints: [{type: 'global'}, {type: 'thread'}]},
  };
}
export async function uiResource(root) {
  const [html, css, script, bridge] = await Promise.all(['index.html', 'style.css', 'app.js', 'native-bridge.js'].map(file => readFile(join(root, 'public', file), 'utf8')));
  // Both modes use the same UI. Bundle scripts/styles so the native iframe
  // does not need access to loopback ports or external servers.
  const text = html.replace('<link rel="stylesheet" href="/style.css">', () => `<style>${css}</style>`)
    .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">${bridge}\n${script}</script>`);
  return {uri: UI_URI, mimeType: UI_MIME, text, _meta: {
    ui: {csp: {connectDomains: [], resourceDomains: []}},
    'openai/widgetDescription': 'Codex 便签板，右上角显示当前 5 小时剩余额度。',
  }};
}
