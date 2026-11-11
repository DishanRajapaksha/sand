import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Renderer } from '../src/render.js';
import { PRESETS } from '../src/presets.js';

function draw(preset, materialCounts) {
  const uniforms = {};
  const gl = new Proxy({
    uniform3fv(name, value) { uniforms[name] = value; },
    uniform4fv(name, value) { uniforms[name] = value; },
  }, { get(target, key) { return target[key] || (() => {}); } });
  const prog = { u: { uPm: 'uPm', uMix: 'uMix' } };
  const renderer = {
    gl, progs: { shadow: prog, blur: prog, bg: prog, grain: prog },
    shadowFb: [null, null], shadowTex: [null, null],
    w: 390, h: 844, sw: 390, sh: 844,
    paletteMean: Renderer.prototype.paletteMean,
    look: { floor: [.3, .85, .5] },
  };
  Renderer.prototype.draw.call(renderer, {
    preset, materialCounts, presetUniforms: () => ({}), world: [60, 100],
  }, [0, 0, 1]);
  return uniforms;
}

test('an empty startup frame keeps a non-zero finite palette for every preset', () => {
  for (const preset of Object.values(PRESETS)) {
    for (const counts of [undefined, [0, 0, 0, 0, 0]]) {
      const u = draw(preset, counts);
      assert(u.uPm.every(Number.isFinite));
      assert(Math.max(...u.uPm) > 0);
      assert.equal(u.uMix[16], 1);
    }
  }
});

test('a mixed pit keeps the weighted colours of its existing sand', () => {
  const u = draw(PRESETS.coral, [100, 0, 0, 100, 0]);
  const mean = Renderer.prototype.paletteMean;
  const expected = mean(PRESETS.river.palette).map((v, i) => (v + mean(PRESETS.volcanic.palette)[i]) / 2);
  assert.deepEqual(u.uPm, expected);
  assert.equal(u.uMix[0], .5);
  assert.equal(u.uMix[12], 1);
});
