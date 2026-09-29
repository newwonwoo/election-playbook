// 타격감/속도감 이펙트: 파티클, 파편, 충격파, 스피드라인, 후처리(방사블러·색수차·플래시), 카메라 셰이크, 팝업 텍스트
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { heightAt } from './world.js';

// ---------- 파티클 ----------
export class Particles {
  constructor(scene, cap = 3000, additive = true) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.c = new Float32Array(cap * 3); this.s = new Float32Array(cap); this.a = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.size0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=color; vA=alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*uScale/max(0.5,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d); if(r>0.5) discard; float f = smoothstep(0.5,0.0,r); gl_FragColor = vec4(vC*(0.6+f), vA*f); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, color, size, life, drag = 1, grav = 0) {
    let i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    const c = typeof color === 'number' ? _col.setHex(color) : color;
    this.c[k] = c.r; this.c[k + 1] = c.g; this.c[k + 2] = c.b;
    this.size0[i] = size; this.life[i] = life; this.max[i] = life; this.drag[i] = drag; this.grav[i] = grav;
  }
  burst(pos, count, speed, color, size, life, opts = {}) {
    const { spread = 1, dir = null, drag = 2.5, grav = 0, jitter = 0.4 } = opts;
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (dir) _v.multiplyScalar(spread).add(dir).normalize();
      const s = speed * (1 - jitter + Math.random() * jitter * 2);
      const col = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
      this.emit(pos.x, pos.y, pos.z, _v.x * s, _v.y * s, _v.z * s, col, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), drag, grav);
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap-remove
        const j = --this.n;
        if (i !== j) this.copy(j, i);
        continue;
      }
      const k = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.v[k] *= dr; this.v[k + 1] = this.v[k + 1] * dr - this.grav[i] * dt; this.v[k + 2] *= dr;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = this.life[i] / this.max[i];
      this.a[i] = Math.min(1, t * 2);
      this.s[i] = this.size0[i] * (0.4 + 0.6 * t);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
  }
  copy(from, to) {
    const f = from * 3, t = to * 3;
    for (let q = 0; q < 3; q++) { this.p[t + q] = this.p[f + q]; this.v[t + q] = this.v[f + q]; this.c[t + q] = this.c[f + q]; }
    this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.size0[to] = this.size0[from];
    this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from]; this.a[to] = this.a[from]; this.s[to] = this.s[from];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}
const _v = new THREE.Vector3(), _col = new THREE.Color();

// ---------- 물리 파편 ----------
export class Debris {
  constructor(scene, cap = 260) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), cap);
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < cap; i++) { this.items.push({ life: 0 }); this.mesh.setColorAt(i, _col.setHex(0xffffff)); }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cursor = 0; this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  spawn(pos, count, speed, colors, size = 1, inherit = null) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor = (this.cursor + 1) % this.cap;
      const it = this.items[i];
      _v.set(Math.random() * 2 - 1, Math.random() * 1.6 - 0.3, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      it.p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
      it.v = _v.clone(); if (inherit) it.v.addScaledVector(inherit, 0.5);
      it.r = new THREE.Euler(Math.random() * 6, Math.random() * 6, 0); it.w = new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      it.s = size * (0.35 + Math.random() * 0.9); it.life = 2 + Math.random() * 1.5;
      this.mesh.setColorAt(i, _col.setHex(colors[Math.floor(Math.random() * colors.length)]));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const d = this.dummy;
    for (let i = 0; i < this.cap; i++) {
      const it = this.items[i];
      if (it.life <= 0) { d.scale.setScalar(0); d.position.set(0, -9999, 0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); continue; }
      it.life -= dt;
      it.v.y -= 38 * dt; it.v.multiplyScalar(Math.exp(-0.6 * dt));
      it.p.addScaledVector(it.v, dt);
      const gh = Math.max(heightAt(it.p.x, it.p.z), 0);
      if (it.p.y < gh + it.s * 0.5) { it.p.y = gh + it.s * 0.5; it.v.y = Math.abs(it.v.y) * 0.35; it.v.x *= 0.6; it.v.z *= 0.6; it.w.multiplyScalar(0.6); }
      it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
      d.position.copy(it.p); d.rotation.copy(it.r); d.scale.setScalar(it.s * Math.min(1, it.life * 2)); d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const it of this.items) it.life = 0; }
}

// ---------- 충격파 링 ----------
export class Shockwaves {
  constructor(scene) {
    this.scene = scene; this.pool = [];
    this.geo = new THREE.RingGeometry(0.85, 1, 48);
  }
  spawn(pos, color, maxScale, life = 0.45, camera = null, normal = null) {
    let s = this.pool.find((x) => x.t >= x.life);
    if (!s) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      s = { mesh, t: 0, life: 1 }; this.pool.push(s); this.scene.add(mesh);
    }
    s.t = 0; s.life = life; s.max = maxScale; s.mesh.visible = true;
    s.mesh.material.color.setHex(color);
    s.mesh.position.copy(pos);
    s.cam = camera; s.normal = normal ? normal.clone() : null;
    if (s.normal) s.mesh.lookAt(pos.clone().add(s.normal));
  }
  update(dt, camera) {
    for (const s of this.pool) {
      if (s.t >= s.life) { s.mesh.visible = false; continue; }
      s.t += dt;
      const k = Math.min(1, s.t / s.life), e = 1 - Math.pow(1 - k, 3);
      s.mesh.scale.setScalar(0.5 + e * s.max);
      s.mesh.material.opacity = (1 - k) * 0.9;
      if (!s.normal) s.mesh.quaternion.copy(camera.quaternion);
    }
  }
}

// ---------- 스피드 라인 (카메라 로컬 공간) ----------
export class SpeedLines {
  constructor(camera, count = 170) {
    this.count = count;
    this.data = [];
    const pos = new Float32Array(count * 6), col = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.data.push(this.rand({}, true));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    camera.add(this.lines);
  }
  rand(d, init = false) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.pow(Math.random(), 0.6) * 26;
    d.x = Math.cos(a) * r; d.y = Math.sin(a) * r * 0.75; d.z = init ? -Math.random() * 170 : -150 - Math.random() * 30;
    d.b = 0.4 + Math.random() * 0.6;
    return d;
  }
  update(dt, speed, intensity) {
    const P = this.lines.geometry.attributes.position.array, C = this.lines.geometry.attributes.color.array;
    const len = 3 + speed * 0.09 * (0.5 + intensity);
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      d.z += speed * dt * 1.6;
      if (d.z > 1) this.rand(d);
      const k = i * 6, fade = Math.min(1, (d.z + 170) / 60) * intensity * d.b * 0.55;
      P[k] = d.x; P[k + 1] = d.y; P[k + 2] = d.z;
      P[k + 3] = d.x; P[k + 4] = d.y; P[k + 5] = d.z - len;
      C[k] = C[k + 1] = C[k + 2] = fade;
      C[k + 3] = C[k + 4] = C[k + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.lines.visible = intensity > 0.01;
  }
}

// ---------- 후처리 ----------
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null }, uBlur: { value: 0 }, uAberr: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uFlash: { value: new THREE.Color(1, 1, 1) }, uFlashAmt: { value: 0 }, uVig: { value: 0.35 }, uVigColor: { value: new THREE.Color(0, 0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur; uniform float uAberr; uniform vec2 uCenter; uniform vec3 uFlash; uniform float uFlashAmt; uniform float uVig; uniform vec3 uVigColor; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - uCenter; float d = length(dir);
      float amt = uBlur * smoothstep(0.1, 0.75, d);
      vec2 ab = dir * uAberr;
      vec3 col = vec3(0.);
      for(int i=0;i<10;i++){
        float t = float(i)/9.0;
        vec2 uv = vUv - dir*amt*t;
        col.r += texture2D(tDiffuse, uv - ab).r;
        col.g += texture2D(tDiffuse, uv).g;
        col.b += texture2D(tDiffuse, uv + ab).b;
      }
      col /= 10.0;
      float v = smoothstep(0.35, 0.95, d);
      col = mix(col, uVigColor, v * uVig);
      col = mix(col, uFlash, uFlashAmt);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(SpeedShader);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
    this.u = this.pass.uniforms;
    this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1); this.hurt = 0;
  }
  doFlash(hex, amt) { this.flashColor.setHex(hex); this.flash = Math.max(this.flash, amt); }
  update(dt, speedK, boost) {
    this.u.uBlur.value += ((0.02 + speedK * 0.11 + boost * 0.09) - this.u.uBlur.value) * (1 - Math.exp(-6 * dt));
    this.u.uAberr.value = 0.002 + boost * 0.006 + this.flash * 0.02;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.u.uFlashAmt.value = this.flash;
    this.u.uFlash.value.copy(this.flashColor);
    this.u.uVig.value = 0.3 + this.hurt * 0.6;
    this.u.uVigColor.value.setRGB(this.hurt * 0.8, 0, 0);
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  render() { this.composer.render(); }
}

// ---------- 카메라 셰이크 (트라우마 방식) ----------
export class Shake {
  constructor() { this.trauma = 0; this.t = 0; this.off = new THREE.Vector3(); this.rot = 0; }
  add(a) { this.trauma = Math.min(1, this.trauma + a); }
  update(dt) {
    this.t += dt * 60;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    const n = (o) => Math.sin(this.t * 1.13 + o) * 0.6 + Math.sin(this.t * 2.71 + o * 3.1) * 0.4;
    this.off.set(n(1) * s * 1.6, n(7) * s * 1.3, n(13) * s * 0.6);
    this.rot = n(21) * s * 0.08;
  }
}

// ---------- 팝업 텍스트 ----------
export class Popups {
  constructor(root) { this.root = root; this.items = []; }
  spawn(worldPos, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls; el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, p: worldPos.clone(), t: 0 });
  }
  update(dt, camera, w, h) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (it.t > 0.9) { it.el.remove(); this.items.splice(i, 1); continue; }
      _v.copy(it.p).project(camera);
      if (_v.z > 1) { it.el.style.opacity = 0; continue; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h - it.t * 70;
      const sc = it.t < 0.12 ? 0.6 + (it.t / 0.12) * 0.9 : 1.5 - Math.min(0.5, (it.t - 0.12) * 2);
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${sc})`;
      it.el.style.opacity = it.t > 0.6 ? (0.9 - it.t) / 0.3 : 1;
    }
  }
  clear() { for (const it of this.items) it.el.remove(); this.items = []; }
}
