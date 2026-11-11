import { program, texture, framebuffer, setUniforms, bindTex } from './gl.js';
import * as S from './render-shaders.js';
import { TW } from './sim.js';

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.progs = {
      shadow: program(gl, S.SHADOW_VS, S.SHADOW_FS, 'shadow'),
      blur: program(gl, S.QUAD_VS, S.BLUR_FS, 'blur'),
      bg: program(gl, S.QUAD_VS, S.BG_FS, 'bg'),
      grain: program(gl, S.GRAIN_VS, S.GRAIN_FS, 'grain'),
    };
    this.maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    this.screenTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.screenTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([240, 240, 240, 255]));
    this.look = { screenGain: 1, shadowK: 0.42, aoK: 0.28, room: [0.0, 0.0, 0.0], amb: 0.9, key: 0.85, sparkle: 1, transl: 1, floor: [0.4, 1.1, 0.5] };
  }

  resize(w, h, shadowScale) {
    const gl = this.gl;
    this.w = w; this.h = h;
    this.sw = Math.max(16, Math.round(w * shadowScale));
    this.sh = Math.max(16, Math.round(h * shadowScale));
    this.shadowTex = [0, 1].map(() => texture(gl, this.sw, this.sh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR));
    this.shadowFb = this.shadowTex.map((t) => framebuffer(gl, [t]));
  }

  setScreen(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.screenTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  draw(sim, light) {
    const gl = this.gl;
    const L = light;
    const common = { ...sim.presetUniforms(), uTW: { type: 'i', v: TW }, uWorld: sim.world, uL: L };
    gl.bindVertexArray(this.vao);

    const sp = this.progs.shadow;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb[0]);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(sp.p);
    bindTex(gl, sp, 'uA', sim.A, 0);
    bindTex(gl, sp, 'uB', sim.B, 1);
    bindTex(gl, sp, 'uG0', sim.G0, 2);
    setUniforms(gl, sp, { ...common, uRes: [this.sw, this.sh] });
    gl.drawArrays(gl.POINTS, 0, sim.active);
    gl.disable(gl.BLEND);

    const bp = this.progs.blur;
    gl.useProgram(bp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb[1]);
    bindTex(gl, bp, 'uT', this.shadowTex[0], 0);
    setUniforms(gl, bp, { uDir: [1, 0] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb[0]);
    bindTex(gl, bp, 'uT', this.shadowTex[1], 0);
    setUniforms(gl, bp, { uDir: [0, 1] });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const look = this.look;
    const bgp = this.progs.bg;
    gl.useProgram(bgp.p);
    bindTex(gl, bgp, 'uScreen', this.screenTex, 0);
    bindTex(gl, bgp, 'uShadow', this.shadowTex[0], 1);
    bindTex(gl, bgp, 'uG0', sim.G0, 2);
    setUniforms(gl, bgp, {
      ...common,
      uRes: [this.w, this.h],
      uBg: [look.screenGain, look.shadowK, look.aoK, 0],
      uRoom: look.room,
      uLook: [look.amb, look.key, look.sparkle, look.transl],
      uFloor: [1.6 * sim.preset.size[0], look.floor[0], look.floor[1], look.floor[2]],
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    const gp = this.progs.grain;
    gl.useProgram(gp.p);
    bindTex(gl, gp, 'uA', sim.A, 0);
    bindTex(gl, gp, 'uB', sim.B, 1);
    bindTex(gl, gp, 'uG0', sim.G0, 2);
    bindTex(gl, gp, 'uScreen', this.screenTex, 3);
    setUniforms(gl, gp, {
      ...common,
      uRes: [this.w, this.h],
      uMaxPt: this.maxPoint,
      uLook: [look.amb, look.key, look.sparkle, look.transl],
      uScreenGain: look.screenGain,
    });
    gl.drawArrays(gl.POINTS, 0, sim.active);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.DEPTH_TEST);
  }
}
