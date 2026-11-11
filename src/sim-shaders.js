import { HEADER, COMMON } from './glsl-common.js';

export const QUAD_VS = HEADER + `
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

export const SPLAT_VS = HEADER + COMMON + `
uniform sampler2D uA;
uniform sampler2D uB;
uniform int uTW;
uniform vec2 uWorld;
uniform vec2 uGrid;
out vec4 vData;
out vec2 vCenter;
out float vRk;
void main() {
  int id = gl_VertexID;
  ivec2 pc = ivec2(id % uTW, id / uTW);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  Grain g = grain(uint(id));
  if (B.w < 0.5 || B.w > 1.5 || B.x > g.r) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec2 cell = uWorld / uGrid;
  vec2 gc = A.xy / cell;
  float rk = max(1.0, g.r * 1.3 / cell.x);
  gl_PointSize = 2.0 * ceil(rk) + 1.0;
  gl_Position = vec4(gc / uGrid * 2.0 - 1.0, 0.0, 1.0);
  float V = 4.18879 * g.r * g.r * g.r;
  float hc = V / (0.6 * cell.x * cell.y);
  vData = vec4(hc, hc * A.z, hc * A.w, hc * length(A.zw));
  vCenter = gc;
  vRk = rk;
}
`;

export const SPLAT_FS = HEADER + `
in vec4 vData;
in vec2 vCenter;
in float vRk;
out vec4 o;
void main() {
  vec2 d = abs(gl_FragCoord.xy - vCenter) / vRk;
  float w = max(0.0, 1.0 - d.x) * max(0.0, 1.0 - d.y) / (vRk * vRk);
  o = vData * w;
}
`;

export const GRID_FS = HEADER + `
uniform sampler2D uS;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 mx = textureSize(uS, 0) - 1;
  vec4 b = vec4(0.0);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      b += w * texelFetch(uS, clamp(c + ivec2(x, y), ivec2(0), mx), 0);
    }
  b /= 16.0;
  vec2 vel = b.yz / max(b.x, 1e-4);
  o0 = vec4(b.x, b.x, 0.0, 0.0);
  o1 = vec4(vel, b.w / max(b.x, 1e-4), 0.0);
}
`;

export const HBLUR_FS = HEADER + `
uniform sampler2D uT;
uniform ivec2 uDir;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 mx = textureSize(uT, 0) - 1;
  vec4 base = texelFetch(uT, c, 0);
  float s = 0.0;
  float W[5] = float[5](0.2270, 0.1945, 0.1216, 0.0540, 0.0162);
  for (int k = -4; k <= 4; k++) {
    ivec2 q = c + uDir * k;
    ivec2 e = clamp(q, ivec2(0), mx);
    float v = texelFetch(uT, e, 0).y;
    if (q != e) v = max(2.0 * v - texelFetch(uT, clamp(2 * e - q, ivec2(0), mx), 0).y, 0.0);
    s += W[abs(k)] * v;
  }
  o = vec4(base.x, s, base.zw);
}
`;

export const GRAD_FS = HEADER + `
uniform sampler2D uT;
uniform vec2 uCell;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 mx = textureSize(uT, 0) - 1;
  float l = texelFetch(uT, clamp(c - ivec2(1, 0), ivec2(0), mx), 0).y;
  float r = texelFetch(uT, clamp(c + ivec2(1, 0), ivec2(0), mx), 0).y;
  float d = texelFetch(uT, clamp(c - ivec2(0, 1), ivec2(0), mx), 0).y;
  float u = texelFetch(uT, clamp(c + ivec2(0, 1), ivec2(0), mx), 0).y;
  vec4 base = texelFetch(uT, c, 0);
  vec2 k = vec2(c.x > 0 && c.x < mx.x ? 2.0 : 1.0, c.y > 0 && c.y < mx.y ? 2.0 : 1.0);
  o = vec4(base.x, (r - l) / (k.x * uCell.x), (u - d) / (k.y * uCell.y), base.y);
}
`;

export const STEP_FS = HEADER + COMMON + `
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uG0;
uniform sampler2D uG1;
uniform int uTW;
uniform vec2 uWorld;
uniform float uDt;
uniform vec4 uGrav;
uniform vec4 uFA[5];
uniform vec4 uFB[5];
uniform uint uFrame;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;

vec2 rdir(uint i, uint s) {
  float a = 6.2831853 * rnd3(i, s, uFrame);
  return vec2(cos(a), sin(a));
}

void main() {
  ivec2 pc = ivec2(gl_FragCoord.xy);
  uint idx = uint(pc.y * uTW + pc.x);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  oA = A; oB = B;
  if (B.w < 0.5) return;
  if (B.w > 1.0) { oB.w = max(1.0, B.w - uDt); return; }
  Grain g = grain(idx);
  vec2 p = A.xy;
  vec2 v = A.zw;
  float zAir = B.x;
  float vz = B.y;
  float layer = B.z;
  float N = uGrav.z;
  vec2 gt = uGrav.xy;
  vec2 uv = p / uWorld;
  vec4 G0 = texture(uG0, uv);
  vec4 G1 = texture(uG1, uv);
  float h = G0.x;
  vec2 grad = G0.yz;
  vec2 vg = G1.xy;
  float dt = uDt;

  vec2 cs = uWorld / vec2(textureSize(uG0, 0));
  float rk = max(1.0, g.r * 1.3 / cs.x);
  float selfH = 4.18879 * g.r * g.r * g.r / (0.6 * cs.x * cs.y * rk * rk) * (0.172 + 0.85 * (rk - 1.0) / (rk + 0.9));
  float contact = smoothstep(0.2, 0.8, max(h - selfH, 0.0) / max(2.0 * uSize.x, 0.05));
  bool peb = g.kind == 2.0;
  float glue = g.kind == 0.0 ? min(pow(0.1 / g.r, 3.0), 6.0) * (1.0 - smoothstep(0.12, 0.17, g.r)) * (rnd(idx, 22u) < 0.45 ? 1.0 : 1.0 - contact) : 0.0;
  float adh = 9810.0 * glue;

  float shake = smoothstep(1.5, 8.0, uGrav.w);
  bool hang = zAir <= 0.0 && N + adh < -600.0;
  if (hang && (shake > 0.85 || rnd3(idx, 26u, uFrame) < 1.0 - exp(-dt * mix(18.0, 5.0, contact)))) { zAir = 1e-3; vz = 0.0; hang = false; }
  bool gb = zAir <= 0.0;

  if (!gb) {
    vz += -N * dt;
    zAir += vz * dt;
    v *= exp(-dt * 0.4);
    v += gt * dt;
    p += v * dt;
    if (zAir <= 0.0) {
      float impact = max(-vz, 0.0);
      zAir = 0.0;
      vz = 0.0;
      v = v * mix(mix(0.35, 0.75, rnd3(idx, 12u, uFrame)), 0.15, contact) + rdir(idx, 13u) * impact * (peb ? 0.04 : mix(0.1, 0.015, contact)) * rnd3(idx, 14u, uFrame);
      layer = 0.75 + 0.25 * rnd(idx, 15u);
    }
    if (zAir > 120.0 && vz > 0.0) { oB = vec4(zAir, vz, layer, 0.0); oA = vec4(p, v); return; }
  } else {
    float Ns = max(N, 5900.0);
    float sp0 = length(v);
    float mu = mix(g.mu, uFric.z * 0.85, contact * (peb ? 0.2 : 1.0));
    if (sp0 < 0.8) mu *= 1.18;
    vec2 gr = grad * (peb ? 1.4 : 1.0);
    float gl = length(gr);
    float marg = uFric.z * 0.38 * contact;
    float se = max(gl - marg * (1.0 - shake), 0.0);
    vec2 drive = gt - (gl > 1e-5 ? gr / gl : vec2(0.0)) * Ns * se * contact;
    float pic = 1.0 - exp(-dt * 70.0 * contact * (peb ? 0.25 : 1.0) * (1.0 - 0.8 * shake));
    v = mix(v, vg, pic);
    v += drive * dt + rdir(idx, 28u) * uGrav.w * 1800.0 * shake * contact * rnd3(idx, 29u, uFrame) * dt;
    v *= exp(-dt * 45.0 * contact * min(max(gl - marg, 0.0), 8.0));
    float sp = length(v);
    float Nf = max(N, contact * 0.6 * length(gt) * (1.0 - smoothstep(2900.0, 6900.0, N)));
    float fr = mu * max(Nf + adh, 0.0) * dt;
    if (sp <= fr) v = vec2(0.0);
    else v -= v / sp * fr;
    sp = length(v);
    if (sp > 1.0) {
      v += rdir(idx, 16u) * sp * (0.05 + 0.08 * contact) * rnd3(idx, 17u, uFrame);
      float target = peb ? 1.0 : 0.55 + 0.45 * rnd3(idx, 18u, uFrame);
      layer = mix(layer, target, clamp(sp * dt * 0.8, 0.0, 0.25));
    }
    float vmax = 2500.0;
    sp = length(v);
    if (sp > vmax) v *= vmax / sp;
    if (hang) v = vec2(0.0);
  }

  bool ignoreFinger = (g.kind == 0.0 && rnd(idx, 19u) < 0.012 && g.r < 0.22);
  vec2 q = p + (gb ? v * dt : vec2(0.0));
  if (zAir < 3.0) {
    float zg = clamp(max(h, G0.w), 0.0, 4.0) * (0.35 + 0.65 * layer);
    for (int f = 0; f < 5; f++) {
      vec4 fb = uFB[f];
      if (fb.w < 0.5) continue;
      vec4 fa = uFA[f];
      vec2 a = fa.xy, b = fa.zw;
      vec2 ab = b - a;
      vec2 U = fb.xy;
      float us = length(U);
      float R = min(sqrt(fb.z * fb.z + 18.0 * zg), fb.z + 4.5) + g.r * 0.6;
      vec2 c = a + ab * clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dist = length(q - c);
      if (gb && us < 8.0 && dist < R + 0.3) {
        v = U;
        q = p + U * dt;
        c = a + ab * clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        dist = length(q - c);
      }
      if (dist < R - (us < 8.0 ? 0.6 : 0.0) && !ignoreFinger) {
        vec2 n = dist > 1e-4 ? (q - c) / dist : rdir(idx, 20u);
        float pen = R - dist;
        q = c + n * (R + (pen > 0.15 ? 1.6 * rnd3(idx, 23u, uFrame) : 0.0));
        float vn = dot(v - U, n);
        if (vn < 0.0) v -= vn * (1.0 + 0.6 * smoothstep(250.0, 2500.0, us)) * n;
        vec2 tng = vec2(-n.y, n.x);
        v -= dot(v - U, tng) * tng * 0.25;
        v += n * us * 0.08 * rnd3(idx, 21u, uFrame);
        if (us >= 8.0) layer = mix(layer, 1.0, 0.2);
        if (us > 250.0 && pen > 0.05 && !peb) {
          float k = rnd3(idx, 27u, uFrame);
          zAir = 0.02;
          vz = us * 0.2 * k * k;
        } else if (zAir > 0.0) { zAir = 0.0; vz = 0.0; }
      }
    }
  }
  p = q;

  float r = g.r;
  float rest = g.kind == 2.0 ? 0.35 : 0.08;
  if (p.x < r) { p.x = r; if (v.x < 0.0) v.x = -v.x * rest; }
  if (p.x > uWorld.x - r) { p.x = uWorld.x - r; if (v.x > 0.0) v.x = -v.x * rest; }
  if (p.y < r) { p.y = r; if (v.y < 0.0) v.y = -v.y * rest; }
  if (p.y > uWorld.y - r) { p.y = uWorld.y - r; if (v.y > 0.0) v.y = -v.y * rest; }

  oA = vec4(p, v);
  oB = vec4(zAir, vz, clamp(layer, 0.0, 1.0), 1.0);
}
`;

export const STATS_FS = HEADER + `
uniform sampler2D uS;
out vec4 o;
void main() {
  ivec2 ts = textureSize(uS, 0);
  ivec2 blk = (ts + 15) / 16;
  ivec2 base = ivec2(gl_FragCoord.xy) * blk;
  vec4 acc = vec4(0.0);
  for (int y = 0; y < 64; y++) {
    if (y >= blk.y) break;
    for (int x = 0; x < 64; x++) {
      if (x >= blk.x) break;
      ivec2 c = base + ivec2(x, y);
      if (c.x >= ts.x || c.y >= ts.y) continue;
      vec4 s = texelFetch(uS, c, 0);
      acc += vec4(s.x, s.w, step(0.05, s.x), 0.0);
    }
  }
  o = acc;
}
`;
