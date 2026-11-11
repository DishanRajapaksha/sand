export const SCREENS = {
  light: { name: 'App', gain: 1.0, shadowK: 0.42 },
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
    drawApp(g, w, h, dpr);
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

const FONT = '-apple-system, system-ui, "SF Pro Text", "Segoe UI", Roboto, sans-serif';

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawApp(g, w, h, dpr) {
  const u = (v) => v * dpr;
  const W = w / dpr, H = h / dpr;
  const m = Math.max(16, W * 0.05);
  g.fillStyle = '#f7f7f5';
  g.fillRect(0, 0, w, h);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#e8902c';
  g.font = `400 ${u(17)}px ${FONT}`;
  g.fillText('‹ Folders', u(m - 4), u(78));
  g.fillStyle = '#1c1c1e';
  g.font = `700 ${u(33)}px ${FONT}`;
  g.fillText('Notes', u(m), u(124));
  g.fillStyle = 'rgba(118,118,128,.12)';
  rrect(g, u(m), u(140), u(W - 2 * m), u(36), u(10));
  g.fill();
  g.fillStyle = 'rgba(60,60,67,.55)';
  g.font = `400 ${u(17)}px ${FONT}`;
  g.fillText('⌕  Search', u(m + 10), u(164));
  const notes = [
    ['Beach weekend', 'Towels, sunscreen, the blue bucket, snacks for the drive'],
    ['Sand', 'A grain of quartz sand is about a third of a millimetre across'],
    ['Groceries', 'Oat milk, lemons, sourdough, coffee beans, basil'],
    ['Saturday', 'Park in the morning, pancakes, call grandma at five'],
    ['Ideas', 'A tiny app that puts real sand on the screen'],
    ['Books', 'The Overstory, Piranesi, A Psalm for the Wild-Built'],
    ['Garden', 'Water the tomatoes, move the lavender into the sun'],
    ['Packing', 'Chargers, passports, the good camera, rain jackets'],
  ];
  let y = 196;
  const cardH = Math.min(H - y - 150, notes.length * 74);
  g.fillStyle = '#ffffff';
  rrect(g, u(m), u(y), u(W - 2 * m), u(cardH), u(12));
  g.fill();
  g.save();
  rrect(g, u(m), u(y), u(W - 2 * m), u(cardH), u(12));
  g.clip();
  for (const [t, d] of notes) {
    if (y + 60 > 196 + cardH) break;
    g.fillStyle = '#1c1c1e';
    g.font = `600 ${u(17)}px ${FONT}`;
    g.fillText(t, u(m + 16), u(y + 30));
    g.fillStyle = 'rgba(60,60,67,.6)';
    g.font = `400 ${u(15)}px ${FONT}`;
    let line = d;
    while (line.length > 3 && g.measureText(line).width > u(W - 2 * m - 32)) line = line.slice(0, -2);
    if (line !== d) line = line.trimEnd() + '…';
    g.fillText(line, u(m + 16), u(y + 52));
    y += 74;
    g.fillStyle = 'rgba(60,60,67,.18)';
    g.fillRect(u(m + 16), u(y - 0.5), u(W - 2 * m - 16), u(0.5));
  }
  g.restore();
  const by = H - 96;
  const bw = (W - 2 * m - 12) / 2;
  for (const [i, label] of [[0, 'Not now'], [1, 'Continue']]) {
    g.fillStyle = '#4a86e8';
    rrect(g, u(m + i * (bw + 12)), u(by), u(bw), u(46), u(23));
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `600 ${u(16)}px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(label, u(m + i * (bw + 12) + bw / 2), u(by + 29));
  }
  g.fillStyle = 'rgba(0,0,0,.85)';
  rrect(g, u(W / 2 - 67), u(H - 13), u(134), u(5), u(2.5));
  g.fill();
}
