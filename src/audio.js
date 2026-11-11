export class SandAudio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.enabled = true;
    this.sent = { flow: -1, pour: -1, tone: -1 };
    this.loading = null;
  }

  start() {
    if (this.ctx) { this.kick(); return this.loading || Promise.resolve(); }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, 22050);
    unlock.connect(ctx.destination);
    unlock.start(0);
    this.kick();
    this.loading = this.build().finally(() => { this.loading = null; });
    return this.loading;
  }

  async build() {
    const ctx = this.ctx;
    if (!ctx.audioWorklet) return;
    try {
      await ctx.audioWorklet.addModule(new URL('./sand-worklet.js', import.meta.url));
    } catch { return; }
    const node = new AudioWorkletNode(ctx, 'sand-noise', { numberOfInputs: 0, outputChannelCount: [2] });
    const gain = ctx.createGain();
    gain.gain.value = this.enabled ? 1 : 0;
    node.connect(gain).connect(ctx.destination);
    this.node = node;
    this.gain = gain;
    this.sent = { flow: -1, pour: -1, tone: -1 };
  }

  kick() {
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running' && this.enabled && !document.hidden) ctx.resume().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.gain) this.gain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    if (on) this.kick();
    else setTimeout(() => { if (!this.enabled) this.suspend(); }, 300);
  }

  update(flow, pour, tone) {
    if (!this.node) return;
    const m = { flow: Math.min(1, flow), pour: Math.min(1, pour), tone };
    const s = this.sent;
    if (Math.abs(m.flow - s.flow) < 0.002 && Math.abs(m.pour - s.pour) < 0.002 && m.tone === s.tone) return;
    this.sent = m;
    this.node.port.postMessage(m);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { this.kick(); }
}
