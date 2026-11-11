export const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const COMMON = `
uniform vec4 uPal[8];
uniform vec4 uSize;
uniform vec4 uSize2;
uniform vec4 uFric;
uniform vec4 uLook;

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float rnd(uint i, uint s) { return float(pcg(i * 32u + s) >> 8) / 16777215.0; }
float rnd3(uint i, uint s, uint f) { return float(pcg(pcg(i * 32u + s) + f * 1664525u) >> 8) / 16777215.0; }

struct Grain {
  float r;
  float kind;
  float mu;
  vec3 col;
  float sparkle;
  float transl;
  float aspect;
};

vec3 pickColor(float u) {
  vec3 c = uPal[7].rgb;
  for (int k = 7; k >= 0; k--) { if (u <= uPal[k].a) c = uPal[k].rgb; }
  return c;
}

Grain grain(uint i) {
  Grain g;
  float u = rnd(i, 0u);
  float gs = sqrt(-2.0 * log(max(rnd(i, 1u), 1e-6))) * cos(6.2831853 * rnd(i, 2u));
  if (u < uSize.w) {
    g.kind = 2.0;
    g.r = mix(uSize2.x, uSize2.y, pow(rnd(i, 3u), 2.2));
    g.mu = mix(0.12, 0.5, rnd(i, 4u));
  } else if (u < uSize.w + uSize.z) {
    g.kind = 1.0;
    g.r = mix(uSize2.z, uSize2.w, pow(rnd(i, 3u), 1.5));
    g.mu = mix(uFric.x, uFric.y, rnd(i, 4u)) * 0.85;
  } else {
    g.kind = 0.0;
    g.r = clamp(uSize.x * exp(uSize.y * gs), 0.045, 0.42);
    g.mu = mix(uFric.x, uFric.y, rnd(i, 4u));
  }
  float cu = rnd(i, 5u);
  vec3 c = pickColor(cu);
  float bright = 0.72 + 0.56 * rnd(i, 6u);
  vec3 tint = vec3(1.0) + (vec3(rnd(i, 7u), rnd(i, 8u), rnd(i, 9u)) - 0.5) * 0.16;
  g.col = c * bright * tint;
  float lum = dot(g.col, vec3(0.3, 0.55, 0.15));
  g.sparkle = step(0.55, rnd(i, 10u)) * smoothstep(0.08, 0.35, lum) * uFric.w;
  g.transl = smoothstep(0.12, 0.6, lum) * (g.kind == 2.0 ? 0.15 : 0.6);
  g.aspect = mix(0.7, 1.0, rnd(i, 11u));
  return g;
}
`;
