// 게임 오브젝트: 링, 적(바위 파수꾼), 플레이어 마법탄, 적 탄
import * as THREE from 'three';
import { heightAt, SEA } from './world.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ringGeo = new THREE.TorusGeometry(7, 0.45, 8, 40);
const ringGlowGeo = new THREE.TorusGeometry(7, 1.3, 8, 40);
const coreGeo = new THREE.IcosahedronGeometry(2.2, 0);
const shardGeo = new THREE.DodecahedronGeometry(1.4, 0);
const boltGeo = new THREE.SphereGeometry(0.7, 8, 6);
const orbGeo = new THREE.IcosahedronGeometry(1.1, 1);

// ---------- 링 ----------
export class Rings {
  constructor(scene) { this.scene = scene; this.list = []; this.chainIdx = 0; }
  spawnChain(player, dist = 420 + Math.random() * 120) {
    const f = _v.set(player.fwd.x, 0, player.fwd.z).normalize();
    let yaw = Math.atan2(-f.x, -f.z) + (Math.random() - 0.5) * 0.5;
    const start = player.pos.clone().addScaledVector(f, dist);
    start.addScaledVector(_w.set(-f.z, 0, f.x), (Math.random() - 0.5) * Math.min(120, dist * 0.25));
    let y = Math.max(heightAt(start.x, start.z), SEA) + 14 + Math.random() * 30;
    const p = start.clone();
    const n = 5 + Math.floor(Math.random() * 3);
    const curve = (Math.random() - 0.5) * 0.25, climb = (Math.random() - 0.5) * 10;
    for (let i = 0; i < n; i++) {
      const gh = Math.max(heightAt(p.x, p.z), SEA);
      y = Math.max(gh + 9, Math.min(gh + 70, y + climb));
      const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const gold = i === n - 1;
      this.add(new THREE.Vector3(p.x, y, p.z), dir, gold);
      yaw += curve;
      p.addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 75);
    }
    this.chainIdx++;
  }
  add(pos, dir, gold) {
    const g = new THREE.Group();
    const color = gold ? 0xffd34d : 0x8ffcff;
    const core = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: gold ? 0xfff2b0 : 0xeaffff }));
    const glow = new THREE.Mesh(ringGlowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core, glow);
    g.position.copy(pos);
    g.lookAt(pos.clone().add(dir));
    if (gold) g.scale.setScalar(1.25);
    this.scene.add(g);
    this.list.push({ g, pos, dir, gold, r: gold ? 8.7 : 7, prev: null, done: false, t: 0, pop: 0, chain: this.chainIdx });
  }
  // 반환: [{ring, hit:true|false}]
  update(dt, player) {
    const events = [];
    let ahead = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      if (r.done) {
        r.pop += dt;
        const k = r.pop / 0.35;
        r.g.scale.setScalar((r.gold ? 1.25 : 1) * (1 + k * 1.6));
        r.g.children.forEach((c) => { c.material.transparent = true; c.material.opacity = Math.max(0, 1 - k); });
        if (k >= 1) { this.remove(i); }
        continue;
      }
      r.g.children[1].material.opacity = 0.3 + Math.sin(r.t * 6) * 0.12;
      _v.subVectors(player.pos, r.pos);
      const side = _v.dot(r.dir);
      if (r.prev !== null && r.prev < 0 && side >= 0) {
        _w.copy(_v).addScaledVector(r.dir, -side);
        const hit = _w.length() < r.r + 0.6;
        r.done = hit; events.push({ ring: r, hit });
        if (!hit) { this.remove(i); continue; }
      }
      r.prev = side;
      if (side < 0) ahead++;
      if (side > 250 || _v.lengthSq() > 1400 * 1400) this.remove(i);
    }
    if (ahead < 5) this.spawnChain(player);
    return events;
  }
  remove(i) {
    const r = this.list[i]; this.scene.remove(r.g);
    r.g.children.forEach((c) => c.material.dispose());
    this.list.splice(i, 1);
  }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}

// ---------- 적 ----------
export class Enemies {
  constructor(scene) { this.scene = scene; this.list = []; this.spawnT = 2; }
  spawn(player, difficulty) {
    const f = _v.set(player.fwd.x, 0, player.fwd.z).normalize();
    const pos = player.pos.clone().addScaledVector(f, 450 + Math.random() * 200);
    pos.addScaledVector(_w.set(-f.z, 0, f.x), (Math.random() - 0.5) * 160);
    pos.y = Math.max(heightAt(pos.x, pos.z), SEA) + 16 + Math.random() * 40;
    const g = new THREE.Group();
    const coreMat = new THREE.MeshLambertMaterial({ color: 0xff3fa4, emissive: 0xff2d8a, emissiveIntensity: 0.9, flatShading: true });
    const core = new THREE.Mesh(coreGeo, coreMat); g.add(core);
    const shardMat = new THREE.MeshLambertMaterial({ color: 0x7d6650, emissive: 0x000000, flatShading: true });
    const shards = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(shardGeo, shardMat); s.userData.a = (i / 6) * Math.PI * 2; s.userData.tilt = (Math.random() - 0.5) * 1.2;
      g.add(s); shards.push(s);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); eye.position.z = 1.9; core.add(eye);
    g.position.copy(pos);
    this.scene.add(g);
    this.list.push({ g, core, shards, coreMat, shardMat, pos, hp: 3, flash: 0, punch: 0, t: Math.random() * 6, shootT: 1.5 + Math.random() * 2, base: pos.y, alive: true, drift: new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12), fireRate: Math.max(1.1, 2.8 - difficulty * 0.25) });
  }
  update(dt, player, difficulty, shots) {
    this.spawnT -= dt;
    const maxN = Math.min(9, 3 + Math.floor(difficulty));
    if (this.spawnT <= 0 && this.list.length < maxN) { this.spawn(player, difficulty); this.spawnT = Math.max(0.6, 2.2 - difficulty * 0.2); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      e.pos.addScaledVector(e.drift, dt);
      e.pos.y = e.base + Math.sin(e.t * 1.3) * 3;
      e.g.position.copy(e.pos);
      e.g.lookAt(player.pos);
      e.core.rotation.z += dt * 2;
      e.shards.forEach((s, k) => {
        const a = s.userData.a + e.t * 1.6;
        s.position.set(Math.cos(a) * 4.2, Math.sin(a) * 4.2 * Math.cos(s.userData.tilt), Math.sin(a) * 4.2 * Math.sin(s.userData.tilt));
        s.rotation.set(e.t * 2 + k, e.t * 1.3, 0);
      });
      e.flash = Math.max(0, e.flash - dt * 9);
      e.punch = Math.max(0, e.punch - dt * 6);
      e.coreMat.emissive.setHex(e.flash > 0 ? 0xffffff : 0xff2d8a);
      e.shardMat.emissive.setRGB(e.flash, e.flash, e.flash);
      const sc = 1 + e.punch * 0.35;
      e.g.scale.set(sc * (1 + e.punch * 0.15), sc * (1 - e.punch * 0.1), sc);
      // 공격
      _v.subVectors(player.pos, e.pos);
      const d = _v.length();
      const inFront = -_v.dot(player.fwd) > 0;
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 380 && d > 40 && inFront) {
        e.shootT = e.fireRate * (0.7 + Math.random() * 0.6);
        // 예측 사격
        const tHit = d / 120;
        const aim = player.pos.clone().addScaledVector(player.fwd, player.speed * tHit * 0.8);
        shots.fire(e.pos, aim.sub(e.pos).normalize().multiplyScalar(120));
      }
      if (-_v.dot(player.fwd) < -250 || d > 1500) this.remove(i);
    }
  }
  remove(i) {
    const e = this.list[i]; this.scene.remove(e.g);
    e.coreMat.dispose(); e.shardMat.dispose();
    this.list.splice(i, 1);
  }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}

// ---------- 투사체 ----------
export class Projectiles {
  constructor(scene, color, geo, glowScale) {
    this.scene = scene; this.list = [];
    this.mat = new THREE.MeshBasicMaterial({ color });
    this.glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    this.geo = geo; this.glowScale = glowScale;
  }
  fire(pos, vel, target = null) {
    const m = new THREE.Mesh(this.geo, this.mat);
    const glow = new THREE.Mesh(this.geo, this.glowMat); glow.scale.setScalar(this.glowScale); m.add(glow);
    m.position.copy(pos); this.scene.add(m);
    this.list.push({ m, p: m.position, v: vel.clone(), target, life: 3, prev: pos.clone() });
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
      if (b.life <= 0 || b.p.y < Math.max(heightAt(b.p.x, b.p.z), SEA)) { b.dead = true; }
      if (b.dead) this.remove(i);
    }
  }
  remove(i) { this.scene.remove(this.list[i].m); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}
export const makeBolts = (scene) => new Projectiles(scene, 0xbff8ff, boltGeo, 2.2);
export const makeOrbs = (scene) => new Projectiles(scene, 0xff4d6d, orbGeo, 2.0);

// 선분-구 최근접 거리 (고속 투사체 관통 방지)
export function segDist(a, b, c) {
  _v.subVectors(b, a); _w.subVectors(c, a);
  const l = _v.lengthSq();
  const t = l > 0 ? Math.max(0, Math.min(1, _w.dot(_v) / l)) : 0;
  return _w.addScaledVector(_v, -t).length();
}
