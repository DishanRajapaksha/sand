export const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const COMMON = `
uniform vec4 uPal[40];
uniform vec4 uSizes[5];
uniform vec4 uSize2s[5];
uniform vec4 uFrics[5];
uniform vec4 uLook;
uniform float uZoom;

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

vec3 pickColor(float u, int material) {
  vec3 c = uPal[material * 8 + 7].rgb;
  for (int k = 7; k >= 0; k--) { if (u <= uPal[material * 8 + k].a) c = uPal[material * 8 + k].rgb; }
  return c;
}

// The integer part of B.z is the immutable sand type; the fraction is depth.
Grain grain(uint i, float materialLayer) {
  int material = clamp(int(floor(materialLayer)), 0, 4);
  vec4 size = uSizes[material];
  vec4 size2 = uSize2s[material];
  vec4 fric = uFrics[material];
  Grain g;
  float u = rnd(i, 0u);
  float gs = sqrt(-2.0 * log(max(rnd(i, 1u), 1e-6))) * cos(6.2831853 * rnd(i, 2u));
  if (u < size.w) {
    g.kind = 2.0;
    g.r = mix(size2.x, size2.y, pow(rnd(i, 3u), 2.2));
    g.mu = rnd(i, 23u) < 0.6 ? mix(0.1, 0.22, rnd(i, 4u)) : mix(0.3, 0.5, rnd(i, 4u));
  } else if (u < size.w + size.z) {
    g.kind = 1.0;
    g.r = mix(size2.z, size2.w, pow(rnd(i, 3u), 1.5));
    g.mu = rnd(i, 23u) < 0.35 ? mix(fric.x * 0.6, fric.x * 1.2, rnd(i, 4u)) : mix(fric.x * 1.6, fric.y, rnd(i, 4u)) * 0.85;
  } else {
    g.kind = 0.0;
    g.r = clamp(size.x * exp(size.y * gs), 0.045, 0.42);
    g.mu = rnd(i, 23u) < 0.25 ? mix(fric.x * 0.6, fric.x * 1.2, rnd(i, 4u)) : mix(fric.x * 1.6, fric.y, rnd(i, 4u));
  }
  float cu = rnd(i, 5u);
  vec3 c = pickColor(cu, material);
  float bright = 0.78 + 0.44 * rnd(i, 6u);
  vec3 tint = vec3(1.0) + (vec3(rnd(i, 7u), rnd(i, 8u), rnd(i, 9u)) - 0.5) * 0.1;
  g.col = c * bright * tint;
  if (g.kind == 2.0) {
    float sk = rnd(i, 12u);
    vec3 st = sk < 0.3 ? vec3(0.27, 0.26, 0.245) : sk < 0.45 ? vec3(0.055, 0.055, 0.058) : sk < 0.6 ? vec3(0.42, 0.35, 0.26) : sk < 0.7 ? vec3(0.28, 0.16, 0.09) : sk < 0.8 ? vec3(0.58, 0.56, 0.52) : sk < 0.9 ? vec3(0.15, 0.18, 0.145) : vec3(0.14, 0.155, 0.18);
    g.col = mix(st * bright, g.col * 0.8, 0.3);
  }
  float lum = dot(g.col, vec3(0.3, 0.55, 0.15));
  g.sparkle = step(0.7, rnd(i, 10u)) * smoothstep(0.08, 0.35, lum) * fric.w;
  g.transl = smoothstep(0.12, 0.6, lum) * (g.kind == 2.0 ? 0.15 : 0.6);
  g.aspect = mix(0.7, 1.0, rnd(i, 11u));
  return g;
}
`;
