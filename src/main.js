import { createContext } from './gl.js';
import { SandSim } from './sim.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { SandAudio } from './audio.js';
import { PRESETS, PRESET_ORDER } from './presets.js';
import { SCREENS, SCREEN_ORDER, drawScreen } from './screens.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SUBSTEPS = 3;

const canvas = document.getElementById('c');
const $ = (id) => document.getElementById(id);

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('sand.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sand.' + k, JSON.stringify(v)); } catch {} },
};

const coarse = matchMedia('(pointer: coarse)').matches;
const ppi = Number(params.get('ppi')) || (coarse ? 160 : 96);
const mmPerPx = 25.4 / ppi;

let gl, sim, renderer, input, audio;
let presetKey = params.get('sand') || store.get('preset', 'river');
let screenKey = params.get('screen') || store.get('screen', 'light');
let soundOn = store.get('sound', true);
let dpr = 1;
let started = false;
let introT = 0;
let lastT = 0;
let running = true;
let perf = { acc: 0, n: 0, level: 0 };
let emptyShown = false;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

function particleBudget(areaMm2) {
  const want = areaMm2 * (Number(params.get('density')) || 12);
  const minSide = Math.min(innerWidth, innerHeight);
  const cap = Number(params.get('n')) || (coarse ? (minSide > 600 ? 460000 : 300000) : 560000);
  return Math.max(65536, Math.min(cap, want));
}

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, perf.level >= 2 ? 2 : 3);
  if (perf.level >= 3) dpr = Math.min(dpr, 1.5);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  canvas.width = w; canvas.height = h;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  renderer.resize(w, h, Math.min(1, 1.2 / dpr));
  refreshScreen();
}

function refreshScreen() {
  const sc = SCREENS[screenKey];
  renderer.look.screenGain = sc.gain;
  renderer.look.shadowK = sc.shadowK;
  renderer.setScreen(drawScreen(screenKey, canvas.width, canvas.height, dpr));
  document.documentElement.style.background = screenKey === 'dark' ? '#050505' : '#111';
}

function resetWorld(intro, amount = 1) {
  const W = innerWidth * mmPerPx, H = innerHeight * mmPerPx;
  if (!sim.world || Math.abs(sim.world[0] - W) > 0.01 || Math.abs(sim.world[1] - H) > 0.01 || !sim.count) sim.resize(W, H, particleBudget(W * H));
  sim.setPreset(PRESETS[presetKey]);
  sim.pour({ seed: seed++, intro, amount });
  introT = intro ? 2.6 : 0;
  emptyShown = false;
  $('empty').classList.remove('show');
}

function init() {
  const ctx = createContext(canvas);
  gl = ctx.gl;
  sim = new SandSim(gl, ctx.floatBlend);
  renderer = new Renderer(gl);
  input = new Input(canvas, mmPerPx);
  audio = new SandAudio();
  layout();
  resetWorld(false, TEST || params.has('nopour') ? 1 : 0);
  buildMenu();
  window.addEventListener('resize', () => {
    const W = innerWidth * mmPerPx, H = innerHeight * mmPerPx;
    layout();
    if (Math.abs(W - sim.world[0]) > 2 || Math.abs(H - sim.world[1]) > 2) resetWorld(false);
  });
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { lastT = 0; audio.resume(); requestAnimationFrame(loop); acquireWakeLock(); }
    else audio.suspend();
  });
  setInterval(() => { if (screenKey === 'lock') refreshScreen(); }, 15000);
  if (!TEST) requestAnimationFrame(loop);
}

function frame(dt) {
  const grav = input.gravity(dt);
  const fingers = input.fingers(dt, SUBSTEPS);
  sim.splat();
  for (let s = 0; s < SUBSTEPS; s++) {
    if (s === 2) sim.splat();
    sim.step(dt / SUBSTEPS, grav, fingers.map((f) => f.subs[s]));
  }
  renderer.draw(sim, input.light());
  const st = sim.readStats();
  introT = Math.max(0, introT - dt);
  const flowN = st.flow / Math.max(1, sim.world[0] * sim.world[1]) * 0.9;
  const fingerSpeed = fingers.reduce((m, f) => Math.max(m, f.speed || 0), 0);
  audio.update(Math.pow(flowN, 0.6), introT > 0 ? Math.min(1, introT / 1.2) : 0);
  if (fingerSpeed > 40 && flowN > 0.05 && navigator.vibrate && store.get('haptics', true) && Math.random() < 0.15) navigator.vibrate(4);
  if (started && !emptyShown && introT === 0 && st.volume > -1 && st.coverage < 0.004) {
    emptyShown = true;
    $('empty').classList.add('show');
  }
  window.__stats = { ...st, flowN, fps: perf.fps };
}

function loop(t) {
  if (!running) return;
  const dt = lastT ? Math.min((t - lastT) / 1000, 1 / 30) : 1 / 60;
  const rawDt = lastT ? (t - lastT) / 1000 : 1 / 60;
  lastT = t;
  frame(dt);
  perf.acc += rawDt; perf.n++;
  if (perf.acc > 2) {
    perf.fps = perf.n / perf.acc;
    if (perf.fps < 42 && perf.level < 4 && started) {
      perf.level++;
      if (perf.level <= 3) layout();
      else sim.active = Math.max(TWfloor(sim.count * 0.6), 65536);
    }
    perf.acc = 0; perf.n = 0;
  }
  requestAnimationFrame(loop);
}

function TWfloor(n) { return Math.floor(n / 512) * 512; }

let wakeLock = null;
async function acquireWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
}

async function start() {
  if (started) return;
  started = true;
  $('intro').classList.add('hide');
  const motionP = input.requestMotion();
  const audioP = soundOn ? audio.start() : Promise.resolve();
  if (coarse && document.documentElement.requestFullscreen && !navigator.standalone && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  acquireWakeLock();
  const ok = await motionP;
  await audioP;
  if (!ok) toast('Motion access was declined — swipe still works. Reload to allow tilting.');
  resetWorld(true);
  setTimeout(() => { if (coarse && !input.hasMotion && ok) toast('No motion sensor data — use swipes, or open on a phone.'); }, 2500);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 4200);
}

function buildMenu() {
  const sands = $('sands');
  for (const k of PRESET_ORDER) {
    const b = document.createElement('button');
    b.className = 'swatch' + (k === presetKey ? ' on' : '');
    b.style.setProperty('--c', PRESETS[k].swatch);
    b.innerHTML = `<i></i><span>${PRESETS[k].name}</span>`;
    b.onclick = () => {
      presetKey = k; store.set('preset', k);
      [...sands.children].forEach((c) => c.classList.toggle('on', c === b));
      resetWorld(true); closeMenu();
    };
    sands.appendChild(b);
  }
  const screens = $('screens');
  for (const k of SCREEN_ORDER) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === screenKey ? ' on' : '');
    b.textContent = SCREENS[k].name;
    b.onclick = () => {
      screenKey = k; store.set('screen', k);
      [...screens.children].forEach((c) => c.classList.toggle('on', c === b));
      refreshScreen();
    };
    screens.appendChild(b);
  }
  const snd = $('sound');
  const syncSound = () => { snd.textContent = soundOn ? 'Sound on' : 'Sound off'; snd.classList.toggle('on', soundOn); };
  syncSound();
  snd.onclick = async () => {
    soundOn = !soundOn; store.set('sound', soundOn); syncSound();
    if (soundOn) await audio.start();
    audio.setEnabled(soundOn);
  };
  $('pour').onclick = () => { resetWorld(true); closeMenu(); };
  $('emptyPour').onclick = () => resetWorld(true);
  $('menuBtn').onclick = (e) => { e.stopPropagation(); $('menu').classList.toggle('open'); };
  $('menu').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('intro').addEventListener('click', start);
  canvas.addEventListener('pointerdown', () => { closeMenu(); if (!started && TEST) started = true; });
}

function closeMenu() { $('menu').classList.remove('open'); }

window.sand = {
  advance(frames = 1, dt = 1 / 60) { for (let i = 0; i < frames; i++) frame(dt); gl.finish(); },
  gravity(f) { input.override = f; },
  drag(points, frames = 30, r = 4.6) {
    const pts = points.map(([x, y]) => [x * mmPerPx, y * mmPerPx]);
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = lens[lens.length - 1];
    const at = (t) => {
      const d = t * total;
      for (let i = 1; i < pts.length; i++) if (d <= lens[i] || i === pts.length - 1) {
        const k = (d - lens[i - 1]) / Math.max(lens[i] - lens[i - 1], 1e-6);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      }
      return pts[pts.length - 1];
    };
    for (let f = 0; f < frames; f++) {
      const subs = [];
      for (let s = 0; s < SUBSTEPS; s++) {
        const a = at((f + s / SUBSTEPS) / frames), b = at((f + (s + 1) / SUBSTEPS) / frames);
        subs.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], vx: (b[0] - a[0]) * 60 * SUBSTEPS, vy: (b[1] - a[1]) * 60 * SUBSTEPS, r });
      }
      input.synthetic = [{ subs, speed: 0 }];
      frame(1 / 60);
    }
    gl.finish();
  },
  reset(intro = false, s) { if (s !== undefined) seed = s; resetWorld(intro); },
  setPreset(k) { presetKey = k; resetWorld(false); },
  setScreen(k) { screenKey = k; refreshScreen(); },
  look: () => renderer.look,
  particles() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.state[sim.cur].fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const A = new Float32Array(sim.count * 4);
    gl.readPixels(0, 0, 512, sim.TH, gl.RGBA, gl.FLOAT, A);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    const B = new Float32Array(sim.count * 4);
    gl.readPixels(0, 0, 512, sim.TH, gl.RGBA, gl.FLOAT, B);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { A, B };
  },
  speedStats() {
    const { A, B } = this.particles();
    const sp = [];
    let air = 0, dead = 0;
    for (let i = 0; i < sim.count; i++) {
      if (B[i * 4 + 3] < 0.5) { dead++; continue; }
      if (B[i * 4] > 0) air++;
      sp.push(Math.hypot(A[i * 4 + 2], A[i * 4 + 3]));
    }
    sp.sort((a, b) => a - b);
    const q = (f) => +sp[Math.floor(f * (sp.length - 1))].toFixed(2);
    return { n: sp.length, dead, air, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1), moving: sp.filter((v) => v > 0.5).length };
  },
  stats: () => window.__stats,
  info: () => ({ count: sim.count, active: sim.active, world: sim.world, grid: [sim.GW, sim.GH], dpr, mmPerPx, floatBlend: sim.floatBlend, maxPoint: renderer.maxPoint }),
};

try {
  init();
} catch (err) {
  console.error(err);
  $('intro').innerHTML = `<div class="card"><h1>Sand</h1><p>${err.message}</p></div>`;
}
