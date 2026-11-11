export class SandAudio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.enabled = true;
    this.flow = 0;
  }

  async start() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, 22050);
    unlock.connect(ctx.destination);
    unlock.start(0);
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    try {
      await ctx.audioWorklet.addModule(new URL('./sand-worklet.js', import.meta.url));
    } catch { this.ctx = null; return; }
    const node = new AudioWorkletNode(ctx, 'sand-noise', { outputChannelCount: [2] });
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 350;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking'; peak.frequency.value = 4200; peak.Q.value = 0.7; peak.gain.value = 5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 11000;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    node.connect(hp).connect(peak).connect(lp).connect(gain).connect(ctx.destination);
    this.node = node;
    this.gain = gain;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.gain) this.gain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  update(flow, patter) {
    if (!this.node) return;
    this.node.port.postMessage({ flow: Math.min(1.2, flow), patter: Math.min(1, patter) });
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
}
