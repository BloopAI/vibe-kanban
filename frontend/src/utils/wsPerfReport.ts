/**
 * WebSocket performance profiling helper.
 * Registered on `window.wsPerfReport` in dev mode.
 * Run `wsPerfReport()` in the DevTools console after a streaming session.
 */
function wsPerfReport() {
  const names = [
    'ws:parse',
    'ws:dedupe',
    'ws:clone',
    'ws:patch',
    'ws:notify',
    'ws:flatten',
    'ws:aggregate',
    'ws:total',
  ];

  for (const name of names) {
    const entries = performance.getEntriesByName(name, 'measure');
    if (entries.length === 0) continue;

    const durations = entries.map((e) => e.duration).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    const max = durations[durations.length - 1];

    console.log(
      `${name.padEnd(16)} n=${String(entries.length).padStart(5)} ` +
        `avg=${(sum / entries.length).toFixed(2).padStart(8)}ms ` +
        `p50=${p50!.toFixed(2).padStart(8)}ms ` +
        `p95=${p95!.toFixed(2).padStart(8)}ms ` +
        `p99=${p99!.toFixed(2).padStart(8)}ms ` +
        `max=${max!.toFixed(2).padStart(8)}ms ` +
        `total=${sum.toFixed(0).padStart(8)}ms`
    );
  }

  const totals = performance.getEntriesByName('ws:total', 'measure');
  if (totals.length >= 2) {
    const first = totals[0]!.startTime;
    const last = totals[totals.length - 1]!.startTime;
    const elapsed = (last - first) / 1000;
    console.log(
      `\nMessage rate: ${(totals.length / elapsed).toFixed(1)} msg/sec over ${elapsed.toFixed(1)}s`
    );

    const totalTime = totals.reduce((s, e) => s + e.duration, 0);
    const wallClock =
      totals[totals.length - 1]!.startTime +
      totals[totals.length - 1]!.duration -
      totals[0]!.startTime;
    if (wallClock > 0) {
      console.log(
        `Main thread budget used: ${((totalTime / wallClock) * 100).toFixed(1)}%`
      );
    }
  }
}

function wsPerfClear() {
  performance.clearMarks();
  performance.clearMeasures();
  console.log('[ws-perf] Cleared all marks and measures');
}

if (import.meta.env.DEV) {
  (window as any).wsPerfReport = wsPerfReport;
  (window as any).wsPerfClear = wsPerfClear;
  console.log(
    '[ws-perf] Profiling active. Run wsPerfReport() after streaming to see results. Run wsPerfClear() to reset.'
  );
}
