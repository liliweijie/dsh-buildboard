// MCP Apps transport: interactions go to this plugin directly, without a model
// turn, localhost fetch, browser token, or chat message.
function createBuildboardBridge() {
  let sequence = 0, hostOrigin;
  const pending = new Map();
  window.addEventListener('message', event => {
    if (event.source !== window.parent || (hostOrigin && event.origin !== hostOrigin)) return;
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || !pending.has(message.id)) return;
    const request = pending.get(message.id); pending.delete(message.id);
    hostOrigin = event.origin; clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message || 'Codex 面板连接失败'));
    else request.resolve(message.result);
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Codex 面板请求超时，请关闭面板后重试')); }, method === 'tools/call' ? 195000 : 15000);
      pending.set(id, {resolve, reject, timeout});
      window.parent.postMessage({jsonrpc: '2.0', id, method, params}, hostOrigin && hostOrigin !== 'null' ? hostOrigin : '*');
    });
  }
  const ready = request('ui/initialize', {
    protocolVersion: '2026-01-26', appInfo: {name: 'buildboard-codex', version: '1.1.0'}, appCapabilities: {},
  }).then(() => window.parent.postMessage({jsonrpc: '2.0', method: 'ui/notifications/initialized'}, hostOrigin && hostOrigin !== 'null' ? hostOrigin : '*'));
  return {
    async call(action, data) {
      await ready;
      const result = await request('tools/call', {name: 'buildboard_ui', arguments: {action, ...(data === undefined ? {} : {data})}});
      if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || '操作失败');
      if (result.structuredContent) return result.structuredContent;
      return JSON.parse(result.content.find(item => item.type === 'text').text);
    },
  };
}
const buildboardNative = createBuildboardBridge();
