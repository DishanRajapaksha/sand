const G = 9810;

export class Input {
  constructor(el, mmPerPx) {
    this.el = el;
    this.mmPerPx = mmPerPx;
    this.pointers = new Map();
    this.motion = null;
    this.sign = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? -1 : 1;
    this.toLocal = (x, y) => [x, y];
    this.lastMotionTime = 0;
    this.keyTilt = [0, 0];
    this.keys = new Set();
    this.override = null;
    this.up = [0, -0.35, 0.94];
    this.slow = null;
    this.shakeE = 0;
    this.onTouchStart = null;
    this.bindPointers();
    this.bindKeys();
  }

  bindPointers() {
    const el = this.el;
    const pos = (e) => this.toLocal(e.clientX, e.clientY).map((c) => c * this.mmPerPx);
    const radius = (e) => {
      const w = Math.max(e.width || 0, e.height || 0);
      if (e.pointerType === 'touch' && w * this.mmPerPx > 3) return Math.min(7.5, Math.max(4.5, w * 0.5 * this.mmPerPx));
      return 4.75;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const p = pos(e);
      this.pointers.set(e.pointerId, { path: [p], last: p, r: radius(e), v: [0, 0], fresh: true });
      this.onTouchStart?.(e);
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ce of (evs.length ? evs : [e])) ptr.path.push(pos(ce));
      ptr.r = ptr.r * 0.8 + radius(e) * 0.2;
    }, { passive: false });
    const end = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      if (e.type === 'pointerup') ptr.path.push(pos(e));
      ptr.ended = true;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
  }

  async requestMotion() {
    const DM = window.DeviceMotionEvent;
    if (DM && typeof DM.requestPermission === 'function') {
      try {
        const res = await DM.requestPermission();
        if (res !== 'granted') return false;
      } catch { return false; }
    }
    if (!this.listening) {
      this.listening = true;
      window.addEventListener('devicemotion', (e) => this.onMotion(e));
    }
    return true;
  }

  onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.x === undefined) return;
    const f = [a.x * this.sign, -a.y * this.sign, a.z * this.sign];
    if (!this.motion) this.motion = f;
    else for (let i = 0; i < 3; i++) this.motion[i] = this.motion[i] * 0.35 + f[i] * 0.65;
    this.lastMotionTime = performance.now();
  }

  get hasMotion() { return !!this.motion && performance.now() - this.lastMotionTime < 1000; }

  gravity(dt) {
    let f;
    if (this.override) f = this.override.slice();
    else if (this.hasMotion) f = this.motion.slice();
    else {
      const k = this.keys;
      const rate = 1.2 * dt;
      if (k.has('ArrowLeft') || k.has('a')) this.keyTilt[0] -= rate;
      if (k.has('ArrowRight') || k.has('d')) this.keyTilt[0] += rate;
      if (k.has('ArrowUp') || k.has('w')) this.keyTilt[1] -= rate;
      if (k.has('ArrowDown') || k.has('s')) this.keyTilt[1] += rate;
      if (!(k.has('ArrowLeft') || k.has('ArrowRight') || k.has('a') || k.has('d'))) this.keyTilt[0] *= Math.exp(-dt * 1.5);
      if (!(k.has('ArrowUp') || k.has('ArrowDown') || k.has('w') || k.has('s'))) this.keyTilt[1] *= Math.exp(-dt * 1.5);
      this.keyTilt = this.keyTilt.map((t) => Math.max(-1.4, Math.min(1.4, t)));
      const [tx, ty] = this.keyTilt;
      f = [-Math.sin(tx) * 9.81, -Math.sin(ty) * Math.cos(tx) * 9.81, Math.cos(tx) * Math.cos(ty) * 9.81];
      if (k.has(' ')) {
        f[0] += (Math.random() - 0.5) * 60;
        f[1] += (Math.random() - 0.5) * 60;
        f[2] += (Math.random() - 0.5) * 30;
      }
    }
    const n = Math.hypot(f[0], f[1], f[2]) || 1;
    const a = 1 - Math.exp(-dt * 3);
    for (let i = 0; i < 3; i++) this.up[i] += (f[i] / n - this.up[i]) * a;
    if (!this.slow) this.slow = f.slice();
    const ks = 1 - Math.exp(-dt / 0.1);
    let d2 = 0;
    for (let i = 0; i < 3; i++) { this.slow[i] += (f[i] - this.slow[i]) * ks; d2 += (f[i] - this.slow[i]) ** 2; }
    this.shakeE += (d2 - this.shakeE) * (1 - Math.exp(-dt / 0.6));
    return [-f[0] * 1000, -f[1] * 1000, f[2] * 1000, Math.sqrt(this.shakeE)];
  }

  light() {
    const u = this.up;
    const off = [-0.3, -0.42, 0];
    const l = [u[0] * 0.85 + off[0], u[1] * 0.85 + off[1], Math.max(u[2], 0.15) + 0.35];
    const n = Math.hypot(...l);
    return l.map((c) => c / n);
  }

  fingers(dt, substeps) {
    const out = [];
    for (const [id, p] of this.pointers) {
      const path = p.path;
      const cur = path[path.length - 1];
      const prevEnd = p.last;
      const pts = [prevEnd, ...path.slice(p.fresh ? 0 : 0)];
      const segLen = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segLen.push(l); total += l;
      }
      const at = (t) => {
        if (total < 1e-6) return cur;
        let d = t * total;
        for (let i = 0; i < segLen.length; i++) {
          if (d <= segLen[i] || i === segLen.length - 1) {
            const k = segLen[i] > 0 ? Math.min(1, d / segLen[i]) : 1;
            return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
          }
          d -= segLen[i];
        }
        return cur;
      };
      const vx = (cur[0] - prevEnd[0]) / Math.max(dt, 1e-3);
      const vy = (cur[1] - prevEnd[1]) / Math.max(dt, 1e-3);
      p.v = [p.v[0] * 0.4 + vx * 0.6, p.v[1] * 0.4 + vy * 0.6];
      const subs = [];
      for (let s = 0; s < substeps; s++) {
        const a = at(s / substeps), b = at((s + 1) / substeps);
        subs.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], vx: p.v[0], vy: p.v[1], r: p.r });
      }
      out.push({ id, subs, speed: Math.hypot(...p.v) });
      p.last = cur;
      p.path = [cur];
      p.fresh = false;
      if (p.ended) this.pointers.delete(id);
    }
    if (this.synthetic) {
      for (const f of this.synthetic) out.push(f);
      this.synthetic = null;
    }
    return out;
  }
}
