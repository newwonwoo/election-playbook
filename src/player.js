// 빗자루 라이더 모델 + 아케이드 비행 물리
import * as THREE from 'three';
import { heightAt, SEA } from './world.js';

const _q = new THREE.Quaternion(), _eu = new THREE.Euler();
const damp =(a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function buildRider() {
  const g = new THREE.Group();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6).rotateX(Math.PI / 2), L(0x8a5a2b));
  stick.position.set(0, 0, -0.3); g.add(stick);
  const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 8).rotateX(-Math.PI / 2), L(0xf2c14e));
  bristle.position.set(0, 0, 1.9); g.add(bristle);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 8).rotateX(Math.PI / 2), L(0xc0392b));
  band.position.set(0, 0, 1.25); g.add(band);

  const rider = new THREE.Group(); rider.position.set(0, 0.35, 0.2); g.add(rider);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 7), L(0xe8452c)); body.position.y = 0.45; body.rotation.x = -0.35; rider.add(body);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), L(0x2b5f8a)); legs.position.set(0, -0.05, -0.15); rider.add(legs);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), L(0xffd9b3)); head.position.set(0, 1.08, -0.18); rider.add(head);
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), L(0x3b2a20)); hair.position.set(0, 1.14, -0.1); hair.scale.set(1, 0.8, 1); rider.add(hair);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 7), L(0xf28c28)); hat.position.set(0, 1.55, 0.05); hat.rotation.x = 0.45; rider.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10), L(0xf28c28)); brim.position.set(0, 1.28, -0.08); brim.rotation.x = 0.2; rider.add(brim);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.16), L(0xe8452c)); arm.position.set(0, 0.55, -0.55); rider.add(arm);

  // 휘날리는 망토 (정점 애니메이션)
  const capeGeo = new THREE.PlaneGeometry(0.9, 1.6, 4, 8);
  capeGeo.translate(0, -0.8, 0);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshLambertMaterial({ color: 0xd62f2f, side: THREE.DoubleSide }));
  cape.position.set(0, 0.95, 0.12); cape.rotation.x = -1.2; rider.add(cape);
  cape.userData.base = capeGeo.attributes.position.array.slice();

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 0, 2.5); g.add(glow);

  g.userData = { cape, glow, rider };
  return g;
}

export class Player {
  constructor(scene) {
    this.obj = new THREE.Group();
    this.model = buildRider();
    this.obj.add(this.model);
    scene.add(this.obj);
    // 그림자 블롭
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const sg = sc.getContext('2d'); const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    scene.add(this.shadow);
    this.fwd = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, 30, 0);
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.yawVel = 0;
    this.speed = 80; this.burst = 0;
    this.energy = 100; this.hp = 100;
    this.boosting = false; this.invuln = 0; this.blink = 0;
    this.groundDist = 99; this.t = 0;
    this.updateFwd();
  }

  updateFwd() {
    const cp = Math.cos(this.pitch);
    this.fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // 반환: 지면 충돌 이벤트 강도(0이면 없음)
  update(dt, input) {
    this.t += dt;
    const sx = input.x, sy = input.y;
    this.yawVel = damp(this.yawVel, -sx * 1.7, 5, dt);
    this.yaw += this.yawVel * dt;
    this.pitch = damp(this.pitch, sy * 0.85, sy === 0 ? 2 : 3.2, dt);
    this.roll = damp(this.roll, this.yawVel * 0.55 + -sx * 0.25, 7, dt);

    const wantBoost = input.boost && this.energy > 2;
    this.boostStarted = wantBoost && !this.boosting;
    this.boosting = wantBoost;
    if (this.boosting) this.energy = Math.max(0, this.energy - 26 * dt);
    else this.energy = Math.min(100, this.energy + 6 * dt);

    this.burst = damp(this.burst, 0, 1.5, dt);
    const target = 80 + (this.boosting ? 85 : 0) + this.burst - this.pitch * 28;
    this.speed = damp(this.speed, target, this.boosting ? 2.6 : 1.2, dt);

    this.updateFwd();
    this.pos.addScaledVector(this.fwd, this.speed * dt);

    let impact = 0;
    const gh = Math.max(heightAt(this.pos.x, this.pos.z), SEA);
    this.groundDist = this.pos.y - gh;
    const minY = gh + 1.6;
    if (this.pos.y < minY) {
      impact = Math.max(0.2, -this.fwd.y);
      this.pos.y = minY + 0.5;
      this.pitch = Math.max(this.pitch, 0.4);
    }
    if (this.pos.y > 300) { this.pos.y = 300; this.pitch = Math.min(this.pitch, 0); }
    this.invuln = Math.max(0, this.invuln - dt);
    return impact;
  }

  syncVisual(dt) {
    this.obj.position.copy(this.pos);
    this.obj.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    // 기체 떨림 (속도 비례)
    const j = Math.min(1, (this.speed - 70) / 100) * 0.06;
    this.model.position.set((Math.random() - 0.5) * j, Math.sin(this.t * 3) * 0.12 + (Math.random() - 0.5) * j, 0);
    const { cape, glow } = this.model.userData;
    const arr = cape.geometry.attributes.position.array, base = cape.userData.base;
    const sp = 6 + this.speed * 0.12;
    for (let i = 0; i < arr.length; i += 3) {
      const d = -base[i + 1];
      arr[i + 2] = base[i + 2] + Math.sin(this.t * sp + d * 4 + base[i] * 2) * 0.14 * d;
      arr[i] = base[i] + Math.sin(this.t * sp * 0.7 + d * 3) * 0.05 * d;
    }
    cape.geometry.attributes.position.needsUpdate = true;
    glow.scale.setScalar(this.boosting ? 1.5 + Math.random() * 0.4 : 1 + Math.random() * 0.2);
    glow.material.color.setHex(this.boosting ? 0x9ffcff : 0xfff1a8);
    this.blink = this.invuln > 0 ? this.blink + dt : 0;
    this.model.visible = this.invuln <= 0 || Math.floor(this.blink * 20) % 2 === 0;

    const gh = Math.max(heightAt(this.pos.x, this.pos.z), SEA);
    this.shadow.position.set(this.pos.x, gh + 0.25, this.pos.z);
    const s = Math.max(0.3, 1.6 - this.groundDist * 0.03);
    this.shadow.scale.setScalar(s);
    this.shadow.material.opacity = Math.max(0, 1 - this.groundDist / 45);
  }

  // 현재 프레임 자세 기준 로컬→월드 (obj 행렬은 렌더 때 갱신되므로 직접 계산)
  localPoint(x, y, z, out = new THREE.Vector3()) {
    _q.setFromEuler(_eu.set(this.pitch, this.yaw, this.roll, 'YXZ'));
    return out.set(x, y, z).applyQuaternion(_q).add(this.pos);
  }
  get tail() { return this.localPoint(0, 0, 2.6); }
}
