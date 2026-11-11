const lin = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2));
};

function palette(entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  const out = new Float32Array(32);
  let acc = 0;
  for (let i = 0; i < 8; i++) {
    const e = entries[Math.min(i, entries.length - 1)];
    if (i < entries.length) acc += e[1] / total;
    const c = lin(e[0]);
    out.set([c[0], c[1], c[2], i < entries.length ? acc : 1], i * 4);
  }
  out[(entries.length - 1) * 4 + 3] = 1;
  return out;
}

export const PRESETS = {
  river: {
    name: 'River',
    swatch: '#8a7d6b',
    palette: palette([
      ['#a39a8c', 26], ['#8c7a62', 18], ['#5c564f', 16], ['#2a2826', 11],
      ['#d9d4c8', 8], ['#7a5a40', 9], ['#b59a86', 7], ['#6b6d68', 5],
    ]),
    size: [0.19, 0.36, 0.02, 0.00025],
    size2: [0.7, 2.6, 0.32, 0.7],
    fric: [0.22, 0.75, 0.58, 1.0],
  },
  beach: {
    name: 'Beach',
    swatch: '#d8bf8f',
    palette: palette([
      ['#e3cfa4', 30], ['#cdb183', 24], ['#b8935f', 14], ['#f2e8d4', 12],
      ['#8f7454', 8], ['#3b342c', 5], ['#c98f6e', 4], ['#e9ddc7', 3],
    ]),
    size: [0.17, 0.3, 0.012, 0.00012],
    size2: [0.6, 1.8, 0.3, 0.6],
    fric: [0.2, 0.7, 0.55, 1.2],
  },
  desert: {
    name: 'Desert',
    swatch: '#c77d45',
    palette: palette([
      ['#d08a4e', 30], ['#c07440', 24], ['#e0a26a', 18], ['#a35e33', 12],
      ['#e8c08e', 8], ['#7d4526', 5], ['#f0d2a8', 3],
    ]),
    size: [0.13, 0.22, 0.0, 0.0],
    size2: [0.6, 1.0, 0.3, 0.5],
    fric: [0.25, 0.7, 0.56, 0.5],
  },
  volcanic: {
    name: 'Volcanic',
    swatch: '#2b2a2a',
    palette: palette([
      ['#2b2a29', 34], ['#1a1919', 24], ['#45423f', 16], ['#5a5048', 8],
      ['#4b5a3a', 7], ['#0d0d0d', 7], ['#7d756c', 4],
    ]),
    size: [0.2, 0.34, 0.02, 0.0003],
    size2: [0.7, 2.4, 0.32, 0.7],
    fric: [0.25, 0.75, 0.6, 1.6],
  },
  coral: {
    name: 'Coral',
    swatch: '#efe4d6',
    palette: palette([
      ['#f2ebe0', 34], ['#e8dccb', 24], ['#f5d9cf', 12], ['#d9c7ad', 12],
      ['#fffaf2', 10], ['#c9a99a', 5], ['#9c8f80', 3],
    ]),
    size: [0.22, 0.4, 0.03, 0.00025],
    size2: [0.6, 2.2, 0.35, 0.8],
    fric: [0.25, 0.75, 0.6, 0.8],
  },
};

export const PRESET_ORDER = ['river', 'beach', 'desert', 'volcanic', 'coral'];
