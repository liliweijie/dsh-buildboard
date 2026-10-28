import {spawn, execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import {fiveHourUsage} from './usage.mjs';

// GUI apps use the macOS system proxy; independently spawned Rust clients
// otherwise may bypass it. Honor explicit environment settings first.
export function codexEnvironment(base = process.env) {
  const env = {...base};
  if (process.platform !== 'darwin' || env.HTTPS_PROXY || env.https_proxy) return env;
  try {
    const settings = execFileSync('/usr/sbin/scutil', ['--proxy'], {encoding: 'utf8', timeout: 2000});
    if (!/HTTPSEnable\s*:\s*1/.test(settings)) return env;
    const host = settings.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1];
    const port = Number(settings.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return env;
    const proxy = new URL(`http://${host.includes(':') ? '[' + host + ']' : host}:${port}`).href;
    env.HTTPS_PROXY = env.https_proxy = proxy;
    if (!env.HTTP_PROXY && !env.http_proxy) env.HTTP_PROXY = env.http_proxy = proxy;
  } catch { /* No system proxy available; keep the user's environment. */ }
  return env;
}

export class CodexClient extends EventEmitter {
  constructor({command = process.env.BUILDBOARD_CODEX_BIN || process.env.CODEX_APP_RUNTIME_CLI_PATH || 'codex', env = codexEnvironment()} = {}) {
    super(); this.command = command; this.env = env; this.pending = new Map(); this.sequence = 0;
  }
  async connect() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const child = this.child = spawn(this.command, ['app-server'], {stdio: ['pipe', 'pipe', 'pipe'], env: this.env});
      child.stderr.on('data', () => {}); // Never forward credentials or verbose upstream logs to the UI.
      child.stdin.on('error', () => {});
      const fail = () => {
        for (const request of this.pending.values()) request.reject(new Error('Codex 连接已断开'));
        this.pending.clear(); this.ready = null; this.child = null;
      };
      child.on('error', fail); child.on('exit', fail);
      createInterface({input: child.stdout}).on('line', line => {
        let message; try { message = JSON.parse(line); } catch { return; }
        if (message.id != null && this.pending.has(message.id)) {
          const request = this.pending.get(message.id); this.pending.delete(message.id);
          message.error ? request.reject(new Error('Codex 接口请求失败，请检查登录和网络')) : request.resolve(message.result);
        } else if (message.method && message.id != null) {
          child.stdin.write(JSON.stringify({id: message.id, error: {code: -32601, message: 'Unsupported request'}}) + '\n');
        }
      });
      await this.request('initialize', {clientInfo: {name: 'buildboard_codex', version: '1.0.0'}});
      child.stdin.write(JSON.stringify({method: 'initialized'}) + '\n');
    })();
    try { await this.ready; } catch (e) { this.close(); throw e; }
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex 请求超时')); }, 20000);
      this.pending.set(id, {resolve: value => {clearTimeout(timeout); resolve(value);}, reject: error => {clearTimeout(timeout); reject(error);}});
      this.child.stdin.write(JSON.stringify({id, method, ...(params === undefined ? {} : {params})}) + '\n');
    });
  }
  async usage() { await this.connect(); return fiveHourUsage(await this.request('account/rateLimits/read')); }
  close() { this.child?.kill(); this.ready = null; }
}
