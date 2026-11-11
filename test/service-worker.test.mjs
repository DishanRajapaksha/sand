import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function worker(failDownload = false) {
  const handlers = {}, calls = [];
  runInNewContext(source, {
    self: { addEventListener(name, handler) { handlers[name] = handler; }, skipWaiting() { calls.push('activate'); } },
    Request: class extends Request { constructor(url, options) { super(new URL(url, 'https://example.test/sand/'), options); } },
    caches: { async open() { return { async addAll(requests) {
      calls.push('download');
      assert(requests.every((r) => r.cache === 'reload'));
      assert(requests.some((r) => r.url.endsWith('/src/view.js')));
      if (failDownload) throw new Error('Download failed');
      calls.push('complete');
    } }; } },
  });
  return { async install() { let promise; handlers.install({ waitUntil(p) { promise = p; } }); await promise; }, calls };
}

test('an app update activates only after all files download without stale HTTP cache', async () => {
  const w = worker(); await w.install();
  assert.deepEqual(w.calls, ['download', 'complete', 'activate']);
});
test('a failed app download cannot activate a partial release', async () => {
  const w = worker(true); await assert.rejects(w.install(), /Download failed/);
  assert.deepEqual(w.calls, ['download']);
});
