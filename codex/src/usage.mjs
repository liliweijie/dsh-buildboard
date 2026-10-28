// A short primary window is not necessarily a five-hour window.
export function fiveHourUsage(response, now = Date.now()) {
  const map = response?.rateLimitsByLimitId;
  const buckets = map && Object.keys(map).length ? Object.entries(map) : [['codex', response?.rateLimits]];
  buckets.sort(([a], [b]) => (a === 'codex' ? -1 : b === 'codex' ? 1 : a.localeCompare(b)));
  const windows = buckets.flatMap(([id, b]) => ['primary', 'secondary'].map(key => ({id, b, w: b?.[key]})))
    .filter(({w}) => w?.windowDurationMins === 300 && typeof w.usedPercent === 'number' && Number.isFinite(w.usedPercent));
  return {
    checkedAt: now,
    windows: windows.map(({id, b, w}) => ({
      limitId: id, label: b.limitName || id,
      remainingPercent: Math.max(0, Math.min(100, 100 - w.usedPercent)),
      resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt : null,
    })),
    status: windows.length ? 'available' : 'unavailable',
    message: windows.length ? null : '账户未返回 5 小时额度（请检查 Codex 登录方式）',
  };
}
