import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SandSim } from '../src/sim.js';
import { Input } from '../src/input.js';
import { toPitPoint } from '../src/view.js';
import { JSDOM } from 'jsdom';

// Capture the buffers uploaded by the real grain generator without requiring a GPU.
function pour(options, count = 1024, material = 0) {
  const uploads = [];
  const sim = { material, world: [60, 100], count, TH: count / 512, state: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
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
  const reducedTiles = new Array(100).fill(0);
  for (let i = 0; i < B.length / 4; i++) {
    assert.equal(B[i * 4 + 3], 1);
    assert.equal(B[i * 4], 0);
    const x = A[i * 4], y = A[i * 4 + 1];
    assert(x >= .3 && x <= 59.701 && y >= .3 && y <= 99.701);
    const tile = Math.floor(x / 60 * 10) + 10 * Math.floor(y / 100 * 10);
    tiles[tile]++;
    if (i < 65536 * .55) reducedTiles[tile]++;
  }
  assert(Math.min(...tiles) > 550);
  assert(Math.min(...reducedTiles) > 250);
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
    input.fingerRadius = .1;
    assert.equal(input.fingers(1 / 60, 3)[0].subs[0].r, .1);
    dom.window.document.querySelector('input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(input.keys.size, 0);
  } finally { globalThis.window = oldWindow; dom.window.close(); }
});


test('successive pours retain the original sand types while adding different materials', () => {
  let mixture = pour({ seed: 3, intro: false }, 1024, 0);
  for (let material = 1; material < 5; material++) {
    const previous = mixture;
    const count = 1024 + material * 512;
    mixture = pour({ seed: material + 3, existing: previous, intro: true }, count, material);
    for (let i = 0; i < previous.B.length; i++) assert.equal(mixture.B[i], previous.B[i]);
    for (let i = previous.B.length / 4; i < count; i++) {
      assert.equal(Math.floor(mixture.B[i * 4 + 2]), material);
      assert(mixture.B[i * 4 + 3] > 1);
    }
  }
  const types = new Set();
  for (let i = 2; i < mixture.B.length; i += 4) types.add(Math.floor(mixture.B[i]));
  assert.equal(types.size, 5);
});


test('zoom keeps drawing aligned with the magnified pit, including rotated phones', () => {
  const view = { vw: 400, vh: 800, w: 400, h: 800, angle: 0 };
  assert.deepEqual(toPitPoint(200, 400, view, 8), [200, 400]);
  assert.deepEqual(toPitPoint(400, 800, view, 1), [400, 800]);
  assert.deepEqual(toPitPoint(400, 800, view, 8), [225, 450]);
  const rotated = { ...view, w: 800, h: 400, angle: 90 };
  const point = toPitPoint(400, 400, rotated, 4);
  assert(Math.abs(point[0] - 400) < 1e-8);
  assert(Math.abs(point[1] - 250) < 1e-8);
});
