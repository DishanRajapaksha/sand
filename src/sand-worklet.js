const FINE = 48;
const HEAVY = 10;

class Bank {
  constructor(n) {
    this.n = n;
    this.y1 = new Float64Array(n);
    this.y2 = new Float64Array(n);
    this.b1 = new Float64Array(n);
    this.b2 = new Float64Array(n);
    this.gl = new Float64Array(n);
    this.gr = new Float64Array(n);
    this.live = new Uint8Array(n);
    this.next = 0;
  }

  hit(f, q, amp, pan, sr) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr;
    const r = Math.exp(-Math.PI * f / (q * sr));
    this.b1[i] = 2 * r * Math.cos(w);
    this.b2[i] = r * r;
    this.y1[i] = amp * Math.sin(w);
    this.y2[i] = 0;
    this.gl[i] = Math.cos(pan * Math.PI * 0.5);
    this.gr[i] = Math.sin(pan * Math.PI * 0.5);
    this.live[i] = 1;
  }

  run(L, R, k) {
    let l = 0, rr = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.live[i]) continue;
      const y = this.b1[i] * this.y1[i] - this.b2[i] * this.y2[i];
      this.y2[i] = this.y1[i];
      this.y1[i] = y;
      l += y * this.gl[i];
      rr += y * this.gr[i];
      if (y < 1e-7 && y > -1e-7 && this.y2[i] < 1e-7 && this.y2[i] > -1e-7) this.live[i] = 0;
    }
    L[k] += l;
    R[k] += rr;
  }
}

class SandNoise extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tFlow = 0;
    this.tPour = 0;
    this.tone = 1;
    this.flow = 0;
    this.pour = 0;
    this.seed = 22222;
    this.fine = new Bank(FINE);
    this.heavy = new Bank(HEAVY);
    this.hpL = 0;
    this.hpR = 0;
    this.lpL = 0;
    this.lpR = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.flow !== undefined) this.tFlow = d.flow;
      if (d.pour !== undefined) this.tPour = d.pour;
      if (d.tone !== undefined) this.tone = d.tone;
    };
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  process(_, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const sr = sampleRate;
    L.fill(0);
    if (R !== L) R.fill(0);
    const up = 1 - Math.exp(-1 / (sr * 0.006));
    const down = 1 - Math.exp(-1 / (sr * 0.05));
    const tone = this.tone;
    for (let k = 0; k < n; k++) {
      this.flow += (this.tFlow - this.flow) * (this.tFlow > this.flow ? up : down);
      this.pour += (this.tPour - this.pour) * (this.tPour > this.pour ? up : down);
      const f = this.flow < 1e-4 ? 0 : this.flow;
      const p = this.pour < 1e-4 ? 0 : this.pour;
      const fineRate = 26000 * Math.pow(f, 1.1);
      const pebRate = f > 0.04 ? 40 * f : 0;
      const pourRate = 9000 * p;
      const clumpRate = 70 * p;
      if (fineRate > 0 && this.rand() * sr < fineRate) {
        const a = Math.pow(this.rand(), 2.4) * Math.pow(f, 0.25) * 0.45;
        this.fine.hit(tone * 2300 * Math.pow(3.9, this.rand()), 1.1 + this.rand() * 2.2, a, 0.15 + this.rand() * 0.7, sr);
      }
      if (pebRate > 0 && this.rand() * sr < pebRate) {
        const a = (0.25 + 0.75 * this.rand()) * Math.pow(f, 0.3) * 0.35;
        this.heavy.hit(tone * 1100 * Math.pow(2.4, this.rand()), 2.5 + this.rand() * 3, a, 0.2 + this.rand() * 0.6, sr);
      }
      if (pourRate > 0 && this.rand() * sr < pourRate) {
        const a = Math.pow(this.rand(), 2) * Math.pow(p, 0.5) * 0.36;
        this.fine.hit(tone * 3000 * Math.pow(3.4, this.rand()), 2 + this.rand() * 4, a, 0.25 + this.rand() * 0.5, sr);
      }
      if (clumpRate > 0 && this.rand() * sr < clumpRate) {
        const a = (0.3 + 0.7 * this.rand()) * p * 0.4;
        this.heavy.hit(tone * 1700 * Math.pow(2.2, this.rand()), 3 + this.rand() * 4, a, 0.3 + this.rand() * 0.4, sr);
      }
      this.fine.run(L, R, k);
      this.heavy.run(L, R, k);
    }
    const hk = 1 - Math.exp(-2 * Math.PI * 900 / sr);
    const lk = 1 - Math.exp(-2 * Math.PI * 11000 / sr);
    for (let k = 0; k < n; k++) {
      let l = L[k], r = R === L ? l : R[k];
      this.lpL += (l - this.lpL) * lk;
      this.lpR += (r - this.lpR) * lk;
      this.hpL += (this.lpL - this.hpL) * hk;
      this.hpR += (this.lpR - this.hpR) * hk;
      l = this.lpL - this.hpL;
      r = this.lpR - this.hpR;
      L[k] = l * (27 + l * l) / (27 + 9 * l * l);
      if (R !== L) R[k] = r * (27 + r * r) / (27 + 9 * r * r);
    }
    for (let c = 2; c < out.length; c++) out[c].set(L);
    return true;
  }
}

registerProcessor('sand-noise', SandNoise);
