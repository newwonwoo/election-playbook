// 게임 오브젝트: 도주 표적(빨간 망토 라이더), 투척 바위, 유도탄
import * as THREE from 'three';
import { heightAt, pathX, SEA } from './world.js';
import { buildRider } from './player.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const groundAt = (x, z) => Math.max(heightAt(x, z), SEA);

// ---------- 도주 표적 ----------
export class Target {
  constructor(scene) {
    this.scene = scene;
    this.obj = buildRider();
    this.obj.scale.setScalar(2);
    this.obj.visible = false;
    scene.add(this.obj);
    this.mats = [];
    this.obj.traverse((o) => { if (o.isMesh && o.material.emissive) this.mats.push(o.material); });
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3();
    this.state = 'none'; this.alive = false;
  }

  spawn(fromZ, wave) {
    this.wave = wave;
    this.z = fromZ;
    this.t = Math.random() * 10;
    this.lat = 0; this.jink = 0; this.jinkV = 0;
    this.max = this.hp = 20 + wave * 6;
    this.base = 92 + wave * 5;
    this.dropT = 2.5;
    this.flash = 0; this.wob = 0;
    this.spin = 0;
    this.state = 'flee'; this.alive = true;
    const x = pathX(fromZ);
    this.y = groundAt(x, fromZ) + 8;
    this.pos.set(x, this.y, fromZ); this.prev.copy(this.pos);
    this.obj.visible = true;
    this.obj.rotation.set(0, 0, 0);
  }

  // 반환 이벤트: 'escaped' | 'crashed' | null
  update(dt, player, rocks, locked) {
    if (this.state === 'none' || this.state === 'dead') return null;
    this.t += dt;
    this.prev.copy(this.pos);
    let ev = null;

    if (this.state === 'flee') {
      const gap = player.pos.z - this.z; // 진행방향(-z) 기준 앞선 거리
      let spd = this.base - clamp((gap - 90) * 0.6, 0, 45);
      if (gap < 35) spd = Math.max(spd, player.speed + 25);
      this.z -= spd * dt;
      // 회피 기동: 락온되면 급선회 빈도↑
      if (Math.random() < dt * (locked ? 1.4 : 0.35)) this.jinkV = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 18);
      this.jinkV = damp(this.jinkV, 0, 1.2, dt);
      this.jink = clamp(this.jink + this.jinkV * dt, -18, 18);
      this.jink = damp(this.jink, 0, 0.4, dt);
      const lat = Math.sin(this.t * 0.7) * 9 + Math.sin(this.t * 1.9) * 3 + this.jink;
      const x = pathX(this.z) + lat;
      const gy = Math.max(groundAt(x, this.z), groundAt(x, this.z - 25), groundAt(x, this.z - 50) - 4);
      this.y = damp(this.y, gy + 7 + Math.sin(this.t * 0.6) * 3.5, 3, dt);
      this.pos.set(x, this.y, this.z);
      if (dt > 0) this.vel.subVectors(this.pos, this.prev).divideScalar(dt);

      // 바위 투척
      this.dropT -= dt;
      if (this.dropT <= 0 && gap > 25) {
        this.dropT = Math.max(0.7, 2.4 - this.wave * 0.2) * (0.6 + Math.random() * 0.8);
        const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.wave * 0.5));
        for (let i = 0; i < n; i++) {
          _v.copy(this.vel).multiplyScalar(0.35).add(_w.set((Math.random() - 0.5) * 24, 4 + Math.random() * 8, (Math.random() - 0.5) * 8));
          rocks.spawn(this.pos.clone().add(_w.set(0, 1, 3)), _v, 1.2 + Math.random() * 1.6);
        }
      }
      if (gap > 460) { ev = 'escaped'; this.hide(); }
    } else if (this.state === 'down') {
      this.vel.y -= 32 * dt;
      this.vel.multiplyScalar(Math.exp(-0.4 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.spin += dt * 9;
      if (this.pos.y < groundAt(this.pos.x, this.pos.z) + 1) { ev = 'crashed'; this.hide(); }
    }

    // 모델 자세
    if (this.obj.visible) {
      this.obj.position.copy(this.pos);
      const sp = this.vel.length() || 1;
      const yaw = Math.atan2(-this.vel.x, -this.vel.z);
      const pitch = Math.asin(clamp(this.vel.y / sp, -1, 1));
      const roll = this.state === 'down' ? this.spin : clamp(-this.vel.x * 0.02, -0.7, 0.7) - this.jinkV * 0.01;
      this.obj.rotation.set(pitch + Math.sin(this.wob * 40) * this.wob * 0.5, yaw, roll + Math.cos(this.wob * 33) * this.wob * 0.6, 'YXZ');
      this.flash = Math.max(0, this.flash - dt * 10);
      this.wob = Math.max(0, this.wob - dt * 4);
      for (const m of this.mats) m.emissive.setRGB(this.flash, this.flash * 0.9, this.flash * 0.6);
      const { cape, glow } = this.obj.userData;
      const arr = cape.geometry.attributes.position.array, base = cape.userData.base;
      for (let i = 0; i < arr.length; i += 3) {
        const d = -base[i + 1];
        arr[i + 2] = base[i + 2] + Math.sin(this.t * 22 + d * 4 + base[i] * 2) * 0.16 * d;
      }
      cape.geometry.attributes.position.needsUpdate = true;
      glow.scale.setScalar(1 + Math.random() * 0.4);
    }
    return ev;
  }

  down(player) {
    this.state = 'down'; this.alive = false;
    this.vel.copy(this.vel.lengthSq() > 1 ? this.vel : player.fwd).multiplyScalar(0.55);
    this.vel.y = 12;
  }
  knock(dir, amt) { this.z += dir.z * amt; this.jink += dir.x * amt; this.y += dir.y * amt; }
  hide() { this.state = 'dead'; this.alive = false; this.obj.visible = false; }
  get tail() { return this.obj.localToWorld(_v.set(0, 0, 2.6)).clone(); }
}

// ---------- 투척 바위 ----------
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
export class Rocks {
  constructor(scene) { this.scene = scene; this.list = []; this.pool = []; }
  spawn(pos, vel, size) {
    const m = this.pool.pop() || new THREE.Mesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c44, flatShading: true }));
    m.material.color.setHSL(0.07, 0.3, 0.26 + Math.random() * 0.1);
    m.position.copy(pos); m.scale.set(size * 1.2, size, size * 1.1);
    m.visible = true; this.scene.add(m);
    this.list.push({ m, p: m.position, v: vel.clone(), r: size, w: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), life: 7 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.life -= dt;
      k.v.y -= 7 * dt; k.v.multiplyScalar(Math.exp(-0.5 * dt));
      k.p.addScaledVector(k.v, dt);
      k.m.rotation.x += k.w.x * dt; k.m.rotation.y += k.w.y * dt; k.m.rotation.z += k.w.z * dt;
      const g = groundAt(k.p.x, k.p.z) + k.r * 0.6;
      if (k.p.y < g) { k.p.y = g; k.v.y = Math.abs(k.v.y) * 0.3; k.v.x *= 0.7; k.v.z *= 0.7; }
      if (k.life <= 0) this.remove(i);
    }
  }
  remove(i) { const k = this.list[i]; this.scene.remove(k.m); this.pool.push(k.m); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}

// ---------- 투사체 ----------
export class Projectiles {
  constructor(scene, color, geo, glowScale) {
    this.scene = scene; this.list = [];
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.geo = geo; this.glowScale = glowScale;
  }
  fire(pos, vel, target = null) {
    const m = new THREE.Mesh(this.geo, this.mat);
    const glow = new THREE.Mesh(this.geo, this.glowMat); glow.scale.setScalar(this.glowScale); m.add(glow);
    m.position.copy(pos); this.scene.add(m);
    this.list.push({ m, p: m.position, v: vel.clone(), target, life: 2.5, prev: pos.clone() });
  }
  update(dt, homing = 0) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      if (b.target && b.target.alive && homing > 0) {
        const sp = b.v.length();
        _v.subVectors(b.target.pos, b.p).normalize().multiplyScalar(sp);
        b.v.lerp(_v, 1 - Math.exp(-homing * dt)).setLength(sp);
      }
      b.prev.copy(b.p);
      b.p.addScaledVector(b.v, dt);
      if (b.life <= 0 || b.p.y < groundAt(b.p.x, b.p.z)) this.remove(i);
    }
  }
  remove(i) { this.scene.remove(this.list[i].m); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}
export const makeBolts = (scene) => new Projectiles(scene, 0xffc93c, new THREE.SphereGeometry(0.45, 8, 6), 2.4);

// 선분-점 최근접 거리 (고속 투사체 관통 방지)
export function segDist(a, b, c) {
  _v.subVectors(b, a); _w.subVectors(c, a);
  const l = _v.lengthSq();
  const t = l > 0 ? Math.max(0, Math.min(1, _w.dot(_v) / l)) : 0;
  return _w.addScaledVector(_v, -t).length();
}
