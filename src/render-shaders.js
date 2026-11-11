import { HEADER, COMMON } from './glsl-common.js';
export { QUAD_VS } from './sim-shaders.js';

const GRAIN_SHARED = `
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uG0;
uniform int uTW;
uniform vec2 uWorld;
uniform vec3 uL;

float grainHeight(Grain g, vec4 B, float h, out float zTop) {
  float layer = fract(B.z);
  float zc = g.r + layer * max(h - 2.0 * g.r, 0.0);
  if (g.kind == 2.0) zc = max(zc, g.r * 0.8 + h * 0.6);
  zTop = zc + g.r;
  return zc + B.x;
}
`;

export const SHADOW_VS = HEADER + COMMON + GRAIN_SHARED + `
uniform vec2 uRes;
out float vA;
out float vSoft;
out vec2 vPeb;
out vec4 vGeo;
void main() {
  int id = gl_VertexID;
  ivec2 pc = ivec2(id % uTW, id / uTW);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  if (B.w < 0.5 || B.w > 1.0001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  Grain g = grain(uint(id), B.z);
  float h = texture(uG0, A.xy / uWorld).x;
  float zTop;
  float zc = grainHeight(g, B, h, zTop);
  vec2 off = -uL.xy / max(uL.z, 0.25) * zc;
  vec2 sp = A.xy + off;
  float soft0 = g.kind == 2.0 ? 0.3 * zc + 0.15 : 0.12 * zc + 0.05;
  float soft = min(soft0, 1.2);
  float pxmm = uRes.x / uWorld.x;
  float rm = g.kind == 2.0 && B.x <= 0.0 ? g.r * 1.3 + 0.45 : 0.0;
  float half_ = max(g.r + soft, length(off) + rm);
  gl_PointSize = 2.0 * half_ * pxmm + 1.5;
  vPeb = vec2(rm > 0.0 ? 4.13 * g.r * (1.3 * g.r) * (1.3 * g.r) / (rm * rm) / 16.0 : 0.0, g.r * 0.92 * g.aspect / half_);
  vGeo = vec4((g.r + soft) / half_, vec2(-off.x, off.y) / half_, rm / half_);
  vSoft = clamp(2.0 * soft / (2.0 * g.r + 2.0 * soft), 0.1, 0.95);
  float spread = (2.0 * g.r) / (2.0 * g.r + 2.0 * soft);
  float spread0 = (g.r + soft) / (g.r + soft0);
  vA = min((g.kind == 2.0 ? 1.0 : 0.7) * mix(1.0, spread * spread, 0.6) * exp(-max(B.x, 0.0) / 12.0) * spread0 * spread0, 1.0);
  if (vA < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  gl_Position = vec4(sp / uWorld * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SHADOW_FS = HEADER + `
in float vA;
in float vSoft;
in vec2 vPeb;
in vec4 vGeo;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = vA * (1.0 - smoothstep(1.0 - vSoft, 1.0, length(p) / vGeo.x));
  vec2 t = vGeo.w > 0.0 ? abs(p - vGeo.yz) / vGeo.w : vec2(1.0);
  float m = vPeb.x * max(1.0 - t.x, 0.0) * max(1.0 - t.y, 0.0);
  float c = vGeo.w > 0.0 ? 1.0 - smoothstep(0.75, 1.1, length(p - vGeo.yz) / vPeb.y) : 0.0;
  o = vec4(a, m, c, a);
}
`;

export const BLUR_FS = HEADER + `
uniform sampler2D uT;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 ts = vec2(textureSize(uT, 0));
  vec2 uv = gl_FragCoord.xy / ts;
  vec2 d = uDir / ts;
  vec4 s = texture(uT, uv) * 0.2270270270;
  s += (texture(uT, uv + d * 1.3846153846) + texture(uT, uv - d * 1.3846153846)) * 0.3162162162;
  s += (texture(uT, uv + d * 3.2307692308) + texture(uT, uv - d * 3.2307692308)) * 0.0702702703;
  o = s;
}
`;

export const BG_FS = HEADER + COMMON + `
uniform sampler2D uScreen;
uniform sampler2D uShadow;
uniform sampler2D uG0;
uniform vec2 uRes;
uniform vec2 uWorld;
uniform vec3 uL;
uniform vec4 uBg;
uniform vec3 uRoom;
uniform vec4 uFloor;
uniform vec3 uPm;
uniform vec4 uMix[5];
out vec4 o;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 sandFloor(vec2 wp, vec3 n, float h) {
  vec2 p = wp / uFloor.x;
  vec2 b = floor(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 c1 = vec2(0.0);
  vec2 dv = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = b + vec2(i, j);
      vec2 f = c + vec2(hash12(c), hash12(c + 71.3));
      float d = length(p - f);
      if (d < d1) { d2 = d1; d1 = d; c1 = c; dv = p - f; } else if (d < d2) d2 = d;
    }
  uint id = uint(int(c1.x) + 8192) + uint(int(c1.y) + 8192) * 16384u + 2654435769u;
  int material = 4;
  for (int k = 4; k >= 0; k--) if (rnd(id, 24u) <= uMix[k].x) material = k;
  vec3 alb = pickColor(rnd(id, 5u), material) * (0.72 + 0.56 * rnd(id, 6u));
  float t = mix(uFloor.y, uFloor.z, rnd(id, 7u));
  float sc = uFloor.x / 0.304;
  float rad = mix(0.45, 1.3, smoothstep(t + 0.1 * sc, t + 0.9 * sc, h));
  float px = fwidth(d1);
  float m = (1.0 - smoothstep(rad - px, rad + px, d1)) * smoothstep(t - 0.02, t + 0.02, h);
  float crev = smoothstep(0.0, 0.3, d2 - d1);
  vec2 dn = dv / rad;
  vec3 gn = normalize(n + vec3(dn * 0.9, 0.0));
  float diff = max(dot(gn, uL), 0.0);
  float dome = 1.0 - 0.3 * smoothstep(0.3, 0.9, length(dn));
  float deep = mix(1.0, mix(uFloor.w, 0.85, smoothstep(0.1, 0.6, dot(alb, vec3(0.3, 0.55, 0.15)))), smoothstep(t + 0.1 * sc, t + 1.5 * sc, h));
  return vec4(alb * (uLook.x * 0.7 + uLook.y * diff) * mix(0.5, 1.0, crev) * dome * deep, m);
}
void main() {
  vec2 uv = (vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y) - 0.5) / uZoom + 0.5;
  vec3 scr = toLin(texture(uScreen, uv).rgb) * uBg.x;
  vec3 sh = texture(uShadow, uv).rgb;
  float occ = sh.x;
  vec4 G = texture(uG0, uv);
  float hb = G.x;
  float ao = 1.0 - uBg.z * smoothstep(0.15, 2.2, hb);
  vec2 rc = (uv - vec2(0.3, 0.12) - uL.xy * vec2(0.6, 0.4)) * vec2(1.0, uRes.y / uRes.x * 0.55);
  float refl = 0.3 + 0.7 * exp(-dot(rc, rc) * 2.2) + 0.25 * smoothstep(0.06, 0.0, abs(dot(uv - vec2(0.75, 0.5), vec2(0.8, 0.6)) - 0.05 * uL.x));
  vec3 filt = mix(vec3(1.0), uPm / max(uPm.r, max(uPm.g, uPm.b)), smoothstep(uFloor.y, uFloor.z, hb) * 0.75);
  vec3 col = (scr * filt * (1.0 - occ * uBg.y) * ao + uRoom * refl * (1.0 - occ * 0.85) * ao) * (1.0 - sh.z * 0.6);
  if (hb > uFloor.y - 0.05) {
    vec2 gs = G.yz / max(1.0, length(G.yz));
    float hs = hb - sh.y * 16.0;
    if (sh.y > 0.004) {
      vec2 o = 3.0 / uWorld;
      float ar = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 u2 = uv + o * vec2(k == 0 ? 1.0 : k == 1 ? -1.0 : 0.0, k == 2 ? 1.0 : k == 3 ? -1.0 : 0.0);
        ar += texture(uG0, u2).x - texture(uShadow, u2).g * 16.0;
      }
      hs = mix(hs, max(hs, ar * 0.25), smoothstep(0.004, 0.04, sh.y));
    }
    vec4 f = sandFloor(uv * uWorld, normalize(vec3(-gs, 1.0)), hs);
    col = mix(col, f.rgb * (1.0 - occ * 0.5), f.a);
  }
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;

export const GRAIN_VS = HEADER + COMMON + GRAIN_SHARED + `
uniform vec2 uRes;
uniform float uMaxPt;
uniform float uCull;
uniform float uSq;
uniform sampler2D uShadow;
uniform float uTime;
out vec3 vAlb;
out vec4 vSeed;
out vec4 vLit;
out vec3 vMacro;
out vec4 vShape;
out vec2 vScreenUv;
out vec3 vDepth;
void main() {
  int id = gl_VertexID;
  uint uid = uint(id);
  ivec2 pc = ivec2(id % uTW, id / uTW);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  if (B.w < 0.5 || B.w > 1.0001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  Grain g = grain(uid, B.z);
  vec2 uv = A.xy / uWorld;
  vec4 G0 = texture(uG0, uv);
  float h = G0.x;
  if (g.kind != 2.0) h = max(h - texture(uShadow, uv).g * 16.0, 0.0);
  float zTop;
  float z = grainHeight(g, B, h, zTop);
  float persp = 1.0 / (1.0 - min(B.x, 200.0) / 320.0);
  vec2 cpos = (A.xy / uWorld * 2.0 - 1.0) * vec2(1.0, -1.0) * persp * uZoom;
  float pxmm = uRes.x / uWorld.x * uZoom;
  float rpx = g.r * pxmm * persp;
  float size = min(2.0 * rpx * 1.2 + 2.0, uMaxPt);
  gl_PointSize = size;
  if (B.x <= 0.0 && g.kind != 2.0 && h - zTop > uCull) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float zd = B.x > 0.0 ? z : h - (h - z) * (g.kind == 2.0 ? 1.0 : uSq);
  gl_Position = vec4(cpos, clamp(1.0 - zd / 40.0, -1.0, 1.0), 1.0);
  vDepth = vec3(zd, g.r * persp, B.x > 0.0 ? 0.0 : 1.0 - smoothstep(0.2, 1.0, h));

  vec3 L = uL;
  float lxy = max(length(L.xy), 1e-3);
  vec2 dir = L.xy / lxy;
  float rise = L.z / lxy;
  float sh = 0.0;
  if (B.x <= 0.0) {
    for (int k = 1; k <= 7; k++) {
      float t = float(k) * 0.45;
      float hq = texture(uG0, (A.xy + dir * t) / uWorld).x;
      sh = max(sh, clamp((hq - (zTop - g.r * 0.5 + t * rise)) / 0.5, 0.0, 1.0));
    }
  }
  float below = max(h - zTop, 0.0);
  float ao = (0.55 + 0.45 * exp(-below * 1.2)) * (B.x > 0.0 ? 1.0 : mix(0.82, 1.0, clamp(z / max(h, 0.01), 0.0, 1.0)));
  float macroW = smoothstep(0.3, 1.2, h);
  vMacro = normalize(vec3(-G0.yz / max(1.0, length(G0.yz)) * macroW, 1.0));
  vAlb = g.col;
  float spin = (A.x * 0.37 - A.y * 0.29) / max(g.r, 0.05);
  vSeed = vec4(rnd(uid, 22u), rnd(uid, 23u), rnd(uid, 24u), rnd(uid, 25u) * 6.2831853 + spin * 0.15);
  float bounce = smoothstep(0.1, 0.6, dot(g.col, vec3(0.3, 0.55, 0.15)));
  vLit = vec4(1.0 - sh * 0.7, mix(ao, 1.0, bounce * 0.5), g.transl * (1.0 - smoothstep(0.25, 0.8, h)) * step(B.x, 0.0), g.sparkle);
  vShape = vec4(size / (2.0 * rpx), g.kind, g.aspect, 0.0);
  vScreenUv = vec2(uv.x, uv.y);
}
`;

export const GRAIN_FS = HEADER + `
uniform sampler2D uScreen;
uniform vec3 uL;
uniform vec4 uLook;
uniform float uScreenGain;
in vec3 vAlb;
in vec4 vSeed;
in vec4 vLit;
in vec3 vMacro;
in vec4 vShape;
in vec2 vScreenUv;
in vec3 vDepth;
out vec4 o;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 q = (gl_PointCoord * 2.0 - 1.0) * vShape.x;
  float ca = cos(vSeed.w), sa = sin(vSeed.w);
  q = mat2(ca, -sa, sa, ca) * q;
  q.x /= vShape.z;
  bool peb = vShape.y == 2.0;
  float ang = atan(q.y, q.x);
  float angular = peb ? 0.03 + 0.15 * vSeed.x * vSeed.x : 0.11;
  float R = 1.0
    + angular * sin(2.0 * ang + vSeed.x * 6.28) * (0.5 + vSeed.y)
    + angular * 0.7 * sin(3.0 * ang + vSeed.y * 6.28)
    + angular * 0.45 * sin(5.0 * ang + vSeed.z * 6.28);
  R *= 1.0 / (1.0 + angular * 0.9);
  float k = 5.0 + floor(vSeed.x * 3.0);
  float su = (ang / 6.2831853 + vSeed.z) * k;
  float sector = floor(su);
  if (!peb) {
    float poly = cos(3.14159 / k) / cos((fract(su) - 0.5) * 6.2831853 / k);
    R *= mix(1.0, poly * (1.0 + 0.12 * (hash12(vec2(sector, vSeed.y * 71.0)) - 0.5)) / 0.93, 0.7);
  }
  float rho = length(q) / R;
  float aa = max(fwidth(rho), 0.02);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa * 0.25, rho);
  if (alpha < 0.02) discard;

  vec2 nq = q / R;
  float r2 = min(dot(nq, nq), 0.995);
  gl_FragDepth = clamp(1.0 - (vDepth.x + vDepth.y * sqrt(1.0 - r2)) / 40.0, 0.0, 1.0);
  vec3 L = normalize(uL);
  vec3 alb = vAlb;
  vec3 n;
  float glint = 0.0;
  float spec;
  if (peb) {
    float rr = sqrt(r2);
    float slope = min(rr * rr * pow(max(1.0 - rr * rr * rr, 1e-3), -0.6667), 4.0);
    n = normalize(vec3(nq / max(rr, 1e-3) * slope * (0.45 + 0.3 * vSeed.z), 1.0));
    vec2 np = nq * 1.7 + vSeed.xy * 31.0;
    n.xy += (vec2(vnoise(np + 3.1), vnoise(np - 5.7)) - 0.5) * 0.22;
    n = normalize(n);
    float big = vnoise(nq * 1.6 + vSeed.zx * 17.0);
    float fine = vnoise(nq * 11.0 + vSeed.yz * 41.0);
    float grit = hash12(floor(gl_FragCoord.xy * 0.5) + vSeed.xy * 97.0);
    float fine2 = vnoise(nq * 23.0 - vSeed.zx * 29.0);
    alb *= 0.7 + 0.4 * big + 0.3 * (fine - 0.5) + 0.25 * (fine2 - 0.5) + 0.12 * (grit - 0.5);
    vec2 vd = vec2(cos(vSeed.z * 9.0), sin(vSeed.z * 9.0));
    float vline = dot(nq, vd) + (vSeed.x - 0.5) * 0.9 + (vnoise(nq * 3.0 + vSeed.yx * 13.0) - 0.5) * 0.25;
    float vein = (1.0 - smoothstep(0.008, 0.03, abs(vline))) * step(0.68, vSeed.y);
    alb = mix(alb, alb * 1.4 + 0.05, vein * 0.45);
    float dk = smoothstep(0.78, 0.86, vnoise(nq * 9.0 - vSeed.yx * 23.0)) * step(0.5, vSeed.z);
    alb = mix(alb, alb * 0.35, dk * 0.6);
    spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 18.0) * 0.06;
  } else {
    float ac = ((sector + 0.5) / k - vSeed.z) * 6.2831853;
    float sh = hash12(vec2(sector, vSeed.y * 113.0));
    vec3 nf = normalize(vec3(vec2(cos(ac), sin(ac)) * (0.7 + 0.9 * sh), 1.0));
    vec3 nt = normalize(vec3((vSeed.xy - 0.5) * 0.5, 1.0));
    float dA = length(nq - (vSeed.yx - 0.5) * 0.5);
    vec3 nd = normalize(vec3(nq * 0.85, sqrt(1.0 - r2) + 0.25));
    n = normalize(mix(mix(nt, nf, smoothstep(0.05, 0.7, dA)), nd, 0.35));
    alb *= 0.88 + 0.24 * vnoise(q * 1.7 + vSeed.zy * 19.0);
    spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 30.0) * 0.05;
    vec3 facet = normalize(vec3((vSeed.yz - 0.5) * 0.9, 1.0));
    float glintA = pow(max(dot(reflect(-L, facet), vec3(0.0, 0.0, 1.0)), 0.0), 220.0);
    vec2 gpos = (vSeed.zy - 0.5) * 0.9;
    glint = glintA * exp(-dot(nq - gpos, nq - gpos) * 9.0) * vLit.w * uLook.z;
  }
  n = normalize(n + (vMacro - vec3(0.0, 0.0, 1.0)) * 0.9);
  alb = max(alb, 0.0);

  float diff = max(dot(n, L), 0.0) * vLit.x;
  float hemi = 0.5 + 0.5 * n.z;
  float rimOcc = mix(0.7, 1.0, smoothstep(0.05, 0.6, n.z));
  if (peb) rimOcc *= 0.55 + 0.45 * clamp(dot(n, L), 0.0, 1.0);
  float ms = clamp(dot(vMacro, L) / max(L.z, 0.3), 0.62, 1.45);
  float bl = smoothstep(0.1, 0.6, dot(vAlb, vec3(0.3, 0.55, 0.15)));
  ms = ms < 1.0 ? mix(ms, 1.0, bl * 0.6) : ms;
  diff = mix(diff, max(dot(n, L), 0.0), bl * 0.5);
  vec3 col = alb * (uLook.x * hemi * rimOcc + uLook.y * diff) * vLit.y * ms;
  col += vec3(spec * vLit.x * vLit.y) + vec3(1.0, 0.97, 0.92) * glint * vLit.x;

  vec3 scr = pow(texture(uScreen, vScreenUv).rgb, vec3(2.2)) * uScreenGain;
  col += scr * vAlb * (vLit.z * (1.0 - smoothstep(0.35, 0.95, rho)) * 0.25 + vDepth.z * 0.1) * uLook.w;

  col = max(col, 0.0);
  col /= 1.0 + 0.9 * max(max(col.r, max(col.g, col.b)) - 0.55, 0.0);
  col = pow(col, vec3(1.0 / 2.2));
  o = vec4(col, alpha);
}
`;
