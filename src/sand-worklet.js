class SandNoise extends AudioWorkletProcessor {
  constructor() {
    super();
    this.flow = 0;
    this.patter = 0;
    this.tFlow = 0;
    this.tPatter = 0;
    this.env = 0;
    this.env2 = 0;
    this.lp = 0;
    this.hp = 0;
    this.bed = 0;
    this.seed = 22222;
    this.port.onmessage = (e) => {
      this.tFlow = e.data.flow;
      this.tPatter = e.data.patter;
    };
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  process(_, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    const n = ch0.length;
    const sr = sampleRate;
    const dk = Math.exp(-1 / (sr * 0.00035));
    const dk2 = Math.exp(-1 / (sr * 0.0011));
    for (let i = 0; i < n; i++) {
      this.flow += (this.tFlow - this.flow) * 0.0008;
      this.patter += (this.tPatter - this.patter) * 0.002;
      const rate = 60 + this.flow * 5200;
      if (this.rand() < rate / sr) {
        const a = Math.pow(this.rand(), 2.6);
        this.env += a * (0.25 + this.flow * 0.6);
      }
      if (this.rand() < (this.patter * 900) / sr) {
        this.env2 += Math.pow(this.rand(), 1.8) * 0.5;
      }
      this.env *= dk;
      this.env2 *= dk2;
      const w = this.rand() * 2 - 1;
      this.bed += (w - this.bed) * 0.35;
      let s = w * this.env + this.bed * this.flow * 0.05 + (this.rand() * 2 - 1) * this.env2;
      this.lp += (s - this.lp) * 0.55;
      s = this.lp;
      this.hp += (s - this.hp) * 0.04;
      s = (s - this.hp) * Math.min(1, this.flow * 3 + this.patter * 2);
      ch0[i] = s;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}

registerProcessor('sand-noise', SandNoise);
