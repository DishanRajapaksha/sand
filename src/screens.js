export const SCREENS = {
  light: { name: 'Light', gain: 1.0, shadowK: 0.42 },
  lock: { name: 'Lock screen', gain: 1.0, shadowK: 0.38 },
  dark: { name: 'Screen off', gain: 1.0, shadowK: 0.0 },
};
export const SCREEN_ORDER = ['light', 'lock', 'dark'];

export function drawScreen(kind, w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const u = (v) => v * dpr;
  if (kind === 'light') {
    g.fillStyle = '#f2f1ee';
    g.fillRect(0, 0, w, h);
  } else if (kind === 'dark') {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#0b0b0c');
    gr.addColorStop(0.55, '#060606');
    gr.addColorStop(1, '#0a0a0b');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  } else {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1d2b4f');
    gr.addColorStop(0.42, '#55628f');
    gr.addColorStop(0.72, '#c98d8a');
    gr.addColorStop(1, '#f2c39b');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.7, h * 0.82, 0, w * 0.7, h * 0.82, w * 0.9);
    glow.addColorStop(0, 'rgba(255,214,170,0.55)');
    glow.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
    const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const cssW = w / dpr;
    g.font = `500 ${u(Math.round(cssW * 0.05))}px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`;
    g.fillText(date, w / 2, u(cssW * 0.36));
    g.font = `600 ${u(Math.round(cssW * 0.27))}px -apple-system, system-ui, "SF Pro Display", "Segoe UI", Roboto, sans-serif`;
    g.fillText(time, w / 2, u(cssW * 0.62));
  }
  return c;
}
