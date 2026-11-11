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
  float layer = B.z;
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
void main() {
  int id = gl_VertexID;
  ivec2 pc = ivec2(id % uTW, id / uTW);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  if (B.w < 0.5 || B.w > 1.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  Grain g = grain(uint(id));
  float h = texture(uG0, A.xy / uWorld).x;
  float zTop;
  float zc = grainHeight(g, B, h, zTop);
  vec2 off = -uL.xy / max(uL.z, 0.25) * zc;
  vec2 sp = A.xy + off;
  float soft = 0.12 * zc + 0.05;
  float pxmm = uRes.x / uWorld.x;
  float size = (2.0 * g.r + 2.0 * soft) * pxmm + 1.5;
  gl_PointSize = size;
  vSoft = clamp(2.0 * soft / (2.0 * g.r + 2.0 * soft), 0.1, 0.95);
  float spread = (2.0 * g.r) / (2.0 * g.r + 2.0 * soft);
  vA = (g.kind == 2.0 ? 0.85 : 0.7) * mix(1.0, spread * spread, 0.6) * (B.x > 0.0 ? 0.8 : 1.0);
  gl_Position = vec4(sp / uWorld * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SHADOW_FS = HEADER + `
in float vA;
in float vSoft;
out vec4 o;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float a = vA * (1.0 - smoothstep(1.0 - vSoft, 1.0, d));
  o = vec4(a);
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

export const BG_FS = HEADER + `
uniform sampler2D uScreen;
uniform sampler2D uShadow;
uniform sampler2D uG0;
uniform vec2 uRes;
uniform vec4 uBg;
uniform vec3 uRoom;
out vec4 o;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  vec3 scr = toLin(texture(uScreen, uv).rgb) * uBg.x;
  float occ = texture(uShadow, uv).r;
  float hb = texture(uG0, uv).x;
  float ao = 1.0 - uBg.z * smoothstep(0.15, 2.2, hb);
  vec3 col = scr * (1.0 - occ * uBg.y) * ao + uRoom * (1.0 - occ * 0.9) * ao;
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;

export const GRAIN_VS = HEADER + COMMON + GRAIN_SHARED + `
uniform vec2 uRes;
uniform float uMaxPt;
uniform float uTime;
out vec3 vAlb;
out vec4 vSeed;
out vec4 vLit;
out vec3 vMacro;
out vec4 vShape;
out vec2 vScreenUv;
void main() {
  int id = gl_VertexID;
  uint uid = uint(id);
  ivec2 pc = ivec2(id % uTW, id / uTW);
  vec4 A = texelFetch(uA, pc, 0);
  vec4 B = texelFetch(uB, pc, 0);
  if (B.w < 0.5 || B.w > 1.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  Grain g = grain(uid);
  vec2 uv = A.xy / uWorld;
  vec4 G0 = texture(uG0, uv);
  float h = G0.x;
  float zTop;
  float z = grainHeight(g, B, h, zTop);
  float persp = 1.0 / (1.0 - min(B.x, 200.0) / 320.0);
  vec2 cpos = (A.xy / uWorld * 2.0 - 1.0) * vec2(1.0, -1.0);
  float pxmm = uRes.x / uWorld.x;
  float rpx = g.r * pxmm * persp;
  float blur = B.x * 0.015 * pxmm;
  float size = min(2.0 * rpx * 1.2 + 2.0 + blur * 2.0, uMaxPt);
  gl_PointSize = size;
  gl_Position = vec4(cpos, clamp(1.0 - z / 40.0, -1.0, 1.0), 1.0);

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
  float ao = exp(-below * 1.1) * (B.x > 0.0 ? 1.0 : mix(0.82, 1.0, clamp(z / max(h, 0.01), 0.0, 1.0)));
  float macroW = smoothstep(0.3, 1.2, h);
  vMacro = normalize(vec3(-G0.yz * macroW, 1.0));
  vAlb = g.col;
  float spin = (A.x * 0.37 - A.y * 0.29) / max(g.r, 0.05);
  vSeed = vec4(rnd(uid, 22u), rnd(uid, 23u), rnd(uid, 24u), rnd(uid, 25u) * 6.2831853 + spin * 0.15);
  vLit = vec4(1.0 - sh * 0.7, ao, g.transl, g.sparkle);
  vShape = vec4(size / (2.0 * rpx), g.kind, g.aspect, blur / max(rpx, 0.5));
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
  float kind = vShape.y;
  float ang = atan(q.y, q.x);
  float angular = kind == 2.0 ? 0.05 : 0.11;
  float R = 1.0
    + angular * sin(2.0 * ang + vSeed.x * 6.28) * (0.5 + vSeed.y)
    + angular * 0.7 * sin(3.0 * ang + vSeed.y * 6.28)
    + angular * 0.45 * sin(5.0 * ang + vSeed.z * 6.28);
  R *= 1.0 / (1.0 + angular * 0.9);
  float rho = length(q) / R;
  float aa = max(fwidth(rho) * 1.2, 0.02) + vShape.w * 0.6;
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa * 0.5, rho);
  if (alpha < 0.02) discard;

  vec2 nq = q / R;
  float r2 = min(dot(nq, nq), 0.98);
  float flat_ = kind == 2.0 ? 0.75 : 0.85;
  vec3 n = normalize(vec3(nq * 1.15, sqrt(1.0 - r2) * flat_));
  vec2 np = q * (kind == 2.0 ? 4.0 : 2.4) + vSeed.xy * 37.0;
  float n1 = vnoise(np), n2 = vnoise(np * 2.3 + 11.0);
  n.xy += (vec2(vnoise(np + 5.3), vnoise(np - 7.1)) - 0.5) * (kind == 2.0 ? 0.5 : 0.8);
  n = normalize(n);
  n = normalize(n + (vMacro - vec3(0.0, 0.0, 1.0)) * 0.9);

  vec3 alb = vAlb;
  float mott = kind == 2.0 ? 0.55 : 0.28;
  alb *= 1.0 + (n1 - 0.5) * mott + (n2 - 0.5) * mott * 0.6;
  if (kind == 2.0) {
    float sp = smoothstep(0.72, 0.8, vnoise(q * 9.0 + vSeed.zx * 51.0));
    float dk = smoothstep(0.7, 0.78, vnoise(q * 7.0 - vSeed.yx * 23.0));
    alb = mix(alb, vec3(0.7, 0.68, 0.64), sp * 0.6 * vSeed.y);
    alb = mix(alb, vec3(0.03), dk * 0.7 * vSeed.z);
  }
  alb = max(alb, 0.0);

  vec3 L = normalize(uL);
  float nl = dot(n, L);
  float diff = max(nl, 0.0) * 0.8 + 0.2 * max(n.z, 0.0);
  diff *= vLit.x;
  float amb = mix(0.28, 1.0, n.z * 0.5 + 0.5);
  float rimOcc = mix(0.55, 1.0, smoothstep(0.0, 0.6, n.z));
  vec3 col = alb * (amb * uLook.x * rimOcc + diff * uLook.y) * vLit.y;

  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), kind == 2.0 ? 40.0 : 24.0) * (kind == 2.0 ? 0.07 : 0.04) * vLit.x;
  vec3 facet = normalize(vec3((vSeed.yz - 0.5) * 0.9, 1.0));
  float glintA = pow(max(dot(reflect(-L, facet), vec3(0.0, 0.0, 1.0)), 0.0), 220.0);
  vec2 gpos = (vSeed.zy - 0.5) * 0.9;
  float spot = exp(-dot(nq - gpos, nq - gpos) * 9.0);
  float glint = glintA * spot * vLit.w * uLook.z * vLit.x;
  col += vec3(spec) + vec3(1.0, 0.97, 0.92) * glint;

  vec3 scr = pow(texture(uScreen, vScreenUv).rgb, vec3(2.2)) * uScreenGain;
  float edge = smoothstep(0.35, 1.0, rho);
  col += scr * vAlb * vLit.z * edge * 0.55 * uLook.w;

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  o = vec4(col, alpha);
}
`;
