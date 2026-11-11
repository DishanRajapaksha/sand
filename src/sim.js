import { program, texture, framebuffer, setUniforms, bindTex } from './gl.js';
import * as S from './sim-shaders.js';

export const TW = 512;
const CELL = 0.5;

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand) {
  const P = 256;
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[((y & (P - 1)) * P) + (x & (P - 1))];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  return (x, y, oct = 5) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += amp * n(x * f + o * 17.3, y * f - o * 9.1); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
}

export class SandSim {
  constructor(gl, floatBlend) {
    this.gl = gl;
    this.floatBlend = floatBlend;
    this.frame = 0;
    this.vao = gl.createVertexArray();
    this.progs = {
      splat: program(gl, S.SPLAT_VS, S.SPLAT_FS, 'splat'),
      grid: program(gl, S.QUAD_VS, S.GRID_FS, 'grid'),
      hblur: program(gl, S.QUAD_VS, S.HBLUR_FS, 'hblur'),
      grad: program(gl, S.QUAD_VS, S.GRAD_FS, 'grad'),
      step: program(gl, S.QUAD_VS, S.STEP_FS, 'step'),
      stats: program(gl, S.QUAD_VS, S.STATS_FS, 'stats'),
    };
    this.statsTex = texture(gl, 16, 16, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.statsFb = framebuffer(gl, [this.statsTex]);
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 16 * 16 * 16, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.statsBuf = new Float32Array(16 * 16 * 4);
    this.fence = null;
    this.stats = { volume: 0, flow: 0, coverage: 0 };
  }

  resize(worldW, worldH, count) {
    const gl = this.gl;
    this.world = [worldW, worldH];
    this.TH = Math.max(1, Math.ceil(count / TW));
    this.count = TW * this.TH;
    this.active = this.count;
    this.GW = Math.ceil(worldW / CELL);
    this.GH = Math.ceil(worldH / CELL);
    this.cell = [worldW / this.GW, worldH / this.GH];
    const mk = () => texture(gl, TW, this.TH, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.state = [0, 1].map(() => {
      const A = mk(), B = mk();
      return { A, B, fb: framebuffer(gl, [A, B]) };
    });
    this.cur = 0;
    const splatFmt = this.floatBlend ? gl.RGBA32F : gl.RGBA16F;
    const splatType = this.floatBlend ? gl.FLOAT : gl.HALF_FLOAT;
    this.splatTex = texture(gl, this.GW, this.GH, splatFmt, gl.RGBA, splatType, gl.NEAREST);
    this.splatFb = framebuffer(gl, [this.splatTex]);
    this.G0 = texture(gl, this.GW, this.GH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.G1 = texture(gl, this.GW, this.GH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.gridFb = framebuffer(gl, [this.G0, this.G1]);
    this.T0 = texture(gl, this.GW, this.GH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    this.T1 = texture(gl, this.GW, this.GH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    this.T0fb = framebuffer(gl, [this.T0]);
    this.T1fb = framebuffer(gl, [this.T1]);
    this.G0fb = framebuffer(gl, [this.G0]);
  }

  setPreset(p) {
    this.preset = p;
  }

  presetUniforms() {
    const p = this.preset;
    return { uPal: { type: 'v4a', v: p.palette }, uSize: p.size, uSize2: p.size2, uFric: p.fric };
  }

  pour({ seed = 1, intro = true, amount = 1 } = {}) {
    const gl = this.gl;
    const [W, H] = this.world;
    const rand = mulberry(seed * 7919 + 13);
    const noise = makeNoise(rand);
    const DW = 96, DH = Math.round(96 * H / W);
    const dens = new Float32Array(DW * DH);
    const cx = 0.5 + (rand() - 0.5) * 0.1, cy = 0.47 + (rand() - 0.5) * 0.1;
    const aspect = H / W;
    let total = 0;
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const u = (x + 0.5) / DW, v = (y + 0.5) / DH;
        const dx = (u - cx), dy = (v - cy) * aspect;
        const r = Math.sqrt(dx * dx + dy * dy * 0.42) / 0.56;
        const n = noise(u * 3.1 * W / 60, v * 3.1 * H / 60, 5);
        const fine = noise(u * 14, v * 14 * aspect, 3);
        let d = (n - 0.47) * 3.2 + (1 - r) * 1.9 - 0.25;
        d = Math.min(1, Math.max(0, d * 2.2));
        d = d * d * (3 - 2 * d) * (0.55 + 0.9 * fine);
        d = d + 0.004 + 0.03 * Math.max(0, 1 - r * 0.8);
        dens[y * DW + x] = d;
        total += d;
      }
    }
    const cdf = new Float32Array(DW * DH);
    let acc = 0;
    for (let i = 0; i < cdf.length; i++) { acc += dens[i] / total; cdf[i] = acc; }
    const n = this.count;
    const A = new Float32Array(n * 4);
    const B = new Float32Array(n * 4);
    const live = Math.floor(n * amount);
    const PS = 240, path = new Float32Array(PS * 2);
    const turns = 2.2 + rand() * 0.8, ph = rand() * 6.283;
    for (let k = 0; k < PS; k++) {
      const t = k / (PS - 1);
      const rad = 0.03 + 0.36 * Math.sqrt(t);
      const th = ph + 6.283 * turns * t;
      const wob = 1 + 0.25 * (noise(t * 6, 3.7, 2) - 0.5);
      path[k * 2] = (cx + Math.cos(th) * rad * wob) * W;
      path[k * 2 + 1] = (cy + Math.sin(th) * rad * wob * 0.62 / aspect * 1.6) * H;
    }
    const POUR = 2.3;
    for (let i = 0; i < n; i++) {
      if (i >= live) { B[i * 4 + 3] = 0; A[i * 4] = -10; continue; }
      const t = rand();
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m + 1; else hi = m; }
      const cxi = lo % DW, cyi = (lo / DW) | 0;
      const x = (cxi + rand()) / DW * W;
      const y = (cyi + rand()) / DH * H;
      A[i * 4] = Math.min(W - 0.3, Math.max(0.3, x));
      A[i * 4 + 1] = Math.min(H - 0.3, Math.max(0.3, y));
      A[i * 4 + 2] = 0;
      A[i * 4 + 3] = 0;
      if (intro) {
        let best = 0, bd = 1e9;
        for (let k = 0; k < PS; k++) {
          const ex = path[k * 2] - x, ey = path[k * 2 + 1] - y;
          const dd = ex * ex + ey * ey;
          if (dd < bd) { bd = dd; best = k; }
        }
        const z = 40 + rand() * 140;
        const vz0 = -rand() * 120;
        const tf = (vz0 + Math.sqrt(vz0 * vz0 + 2 * 9810 * z)) / 9810;
        const a = rand() * 6.283, sp = 4 + 18 * rand();
        A[i * 4 + 2] = Math.cos(a) * sp;
        A[i * 4 + 3] = Math.sin(a) * sp;
        A[i * 4] = x - A[i * 4 + 2] * tf;
        A[i * 4 + 1] = y - A[i * 4 + 3] * tf;
        const delay = 0.05 + POUR * best / (PS - 1) + 0.18 * rand() + Math.sqrt(bd) * 0.012;
        B.set([z, vz0, rand(), 1 + delay], i * 4);
      } else {
        B.set([0, 0, rand(), 1], i * 4);
      }
    }
    for (const s of this.state) {
      gl.bindTexture(gl.TEXTURE_2D, s.A);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, this.TH, gl.RGBA, gl.FLOAT, A);
      gl.bindTexture(gl.TEXTURE_2D, s.B);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, this.TH, gl.RGBA, gl.FLOAT, B);
    }
  }

  get A() { return this.state[this.cur].A; }
  get B() { return this.state[this.cur].B; }

  splat() {
    const gl = this.gl;
    const pr = this.progs.splat;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.splatFb);
    gl.viewport(0, 0, this.GW, this.GH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pr.p);
    bindTex(gl, pr, 'uA', this.A, 0);
    bindTex(gl, pr, 'uB', this.B, 1);
    setUniforms(gl, pr, { ...this.presetUniforms(), uTW: { type: 'i', v: TW }, uWorld: this.world, uGrid: [this.GW, this.GH] });
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.active);
    gl.disable(gl.BLEND);

    const gp = this.progs.grid;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFb);
    gl.useProgram(gp.p);
    bindTex(gl, gp, 'uS', this.splatTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const hb = this.progs.hblur;
    gl.useProgram(hb.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.T0fb);
    bindTex(gl, hb, 'uT', this.G0, 0);
    gl.uniform2i(hb.u.uDir, 1, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.T1fb);
    bindTex(gl, hb, 'uT', this.T0, 0);
    gl.uniform2i(hb.u.uDir, 0, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const gr = this.progs.grad;
    gl.useProgram(gr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.G0fb);
    bindTex(gl, gr, 'uT', this.T1, 0);
    setUniforms(gl, gr, { uCell: this.cell });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  step(dt, grav, fingers) {
    const gl = this.gl;
    const pr = this.progs.step;
    const next = 1 - this.cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[next].fb);
    gl.viewport(0, 0, TW, this.TH);
    gl.useProgram(pr.p);
    bindTex(gl, pr, 'uA', this.A, 0);
    bindTex(gl, pr, 'uB', this.B, 1);
    bindTex(gl, pr, 'uG0', this.G0, 2);
    bindTex(gl, pr, 'uG1', this.G1, 3);
    const FA = new Float32Array(20), FB = new Float32Array(20);
    fingers.slice(0, 5).forEach((f, i) => {
      FA.set([f.x0, f.y0, f.x1, f.y1], i * 4);
      FB.set([f.vx, f.vy, f.r, 1], i * 4);
    });
    setUniforms(gl, pr, {
      ...this.presetUniforms(),
      uTW: { type: 'i', v: TW }, uWorld: this.world, uDt: dt, uGrav: grav,
      uFA: { type: 'v4a', v: FA }, uFB: { type: 'v4a', v: FB },
      uFrame: { type: 'u', v: (this.frame++) >>> 0 },
    });
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = next;
  }

  readStats() {
    const gl = this.gl;
    if (this.fence) {
      const st = gl.clientWaitSync(this.fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return this.stats;
      gl.deleteSync(this.fence);
      this.fence = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.statsBuf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      let vol = 0, flow = 0, cov = 0;
      for (let i = 0; i < 256; i++) { vol += this.statsBuf[i * 4]; flow += this.statsBuf[i * 4 + 1]; cov += this.statsBuf[i * 4 + 2]; }
      const ca = this.cell[0] * this.cell[1];
      this.stats = { volume: vol * ca, flow: flow * ca, coverage: cov / (this.GW * this.GH) };
    }
    const pr = this.progs.stats;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.statsFb);
    gl.viewport(0, 0, 16, 16);
    gl.useProgram(pr.p);
    bindTex(gl, pr, 'uS', this.splatTex, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return this.stats;
  }
}
