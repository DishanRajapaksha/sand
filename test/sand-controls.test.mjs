import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SandSim } from '../src/sim.js';
import { Input } from '../src/input.js';
import { JSDOM } from 'jsdom';

// Capture the buffers uploaded by the real grain generator without requiring a GPU.
function pour(options, count = 1024) {
  const uploads = [];
  const sim = { world: [60, 100], count, TH: count / 512, state: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
    gl: { bindTexture() {}, texSubImage2D(...args) { uploads.push(args.at(-1)); } } };
  SandSim.prototype.pour.call(sim, options);
  return { A: uploads[0], B: uploads[1] };
}
const liveCount = ({ B }) => B.filter((_, i) => i % 4 === 3 && B[i] >= .5).length;

test('top-up preserves every live grain and recycles dead slots before leaving unused slots', () => {
  const existing = pour({ seed: 7, intro: false });
  // Holes include both early and late indices, as after a partial spill.
  for (let i = 0; i < 1024; i += 3) existing.B[i * 4 + 3] = 0;
  const target = liveCount(existing) + 100;
  const added = pour({ seed: 8, existing, intro: true, amount: target / 1536 }, 1536);
  assert.equal(liveCount(added), target);
  for (let i = 0; i < 1024; i++) if (existing.B[i * 4 + 3] >= .5) {
    assert.deepEqual(added.A.slice(i * 4, i * 4 + 4), existing.A.slice(i * 4, i * 4 + 4));
    assert.deepEqual(added.B.slice(i * 4, i * 4 + 4), existing.B.slice(i * 4, i * 4 + 4));
  }
});

test('full pit covers every tile including the edges with settled grains', () => {
  const { A, B } = pour({ seed: 7, intro: false, full: true }, 65536);
  const tiles = new Array(100).fill(0);
  for (let i = 0; i < B.length / 4; i++) {
    assert.equal(B[i * 4 + 3], 1);
    assert.equal(B[i * 4], 0);
    const x = A[i * 4], y = A[i * 4 + 1];
    assert(x >= .3 && x <= 59.701 && y >= .3 && y <= 99.701);
    tiles[Math.floor(x / 60 * 10) + 10 * Math.floor(y / 100 * 10)]++;
  }
  assert(Math.min(...tiles) > 550);
});

test('pointer strokes use the selected diameter and slider keys do not tilt sand', () => {
  const dom = new JSDOM('<canvas></canvas><input type="range">');
  const oldWindow = globalThis.window;
  globalThis.window = dom.window;
  try {
    const canvas = dom.window.document.querySelector('canvas');
    const input = new Input(canvas, .2);
    input.fingerRadius = 10;
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 40, clientY: 50 }));
    assert.equal(input.fingers(1 / 60, 3)[0].subs[0].r, 10);
    input.fingerRadius = 1;
    assert.equal(input.fingers(1 / 60, 3)[0].subs[0].r, 1);
    dom.window.document.querySelector('input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(input.keys.size, 0);
  } finally { globalThis.window = oldWindow; dom.window.close(); }
});
