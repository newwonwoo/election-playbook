// 무한 지형(청크 스트리밍) + 하늘/구름/비행선/물 + 장식물(나무·바위·아치·크리스탈·부유섬)
import * as THREE from 'three';
import { createNoise2D, mulberry32, hash2 } from './noise.js';

export const CHUNK = 180;
const SEG = 30;
const VIEW = 4;
export const SEA = 0;

const nA = createNoise2D(1337), nB = createNoise2D(4242), nC = createNoise2D(777), nD = createNoise2D(31);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function pathX(z) { return Math.sin(z * 0.0019) * 150 + Math.sin(z * 0.00061 + 1.3) * 340; }
export function pathDX(z) { return Math.cos(z * 0.0019) * 150 * 0.0019 + Math.cos(z * 0.00061 + 1.3) * 340 * 0.00061; }

function fbm(x, z) {
  let a = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { a += nA(x * f, z * f) * amp; amp *= 0.5; f *= 2.07; }
  return a;
}

const S = { h: 0, m: 0, pf: 0 };
// 지형 샘플: 높이 + 육지마스크(m) + 길(pf)
export function sample(x, z, out = S) {
  const px = pathX(z);
  const dp = Math.abs(x - px);
  const c = nB(x * 0.0012, z * 0.0012) * 0.75 + nB(x * 0.005 + 50, z * 0.005) * 0.25 + Math.max(0, 1 - dp / 320) * 0.7 - 0.12;
  const m = smooth(0.0, 0.035, c);
  const hills = fbm(x * 0.004, z * 0.004);
  let mount = Math.max(0, nC(x * 0.0017, z * 0.0017) - 0.15);
  mount *= smooth(50, 180, dp);
  let land = 12 + hills * 20 + mount * mount * 150;
  const flat = smooth(80, 16, dp);
  const pathH = 11 + fbm(px * 0.004, z * 0.004) * 9;
  land = land * (1 - flat) + pathH * flat;
  const rugged = nD(x * 0.05, z * 0.05) * 4 * (1 - Math.abs(m * 2 - 1));
  out.h = -30 * (1 - m) + land * m + rugged;
  out.m = m;
  out.pf = smooth(15, 6, dp) * m;
  return out.h;
}
export const heightAt = (x, z) => sample(x, z, S);

// ---------- 공용 지오메트리/머티리얼 ----------
const trunkGeo = new THREE.CylinderGeometry(0.3, 0.55, 1, 5).translate(0, 0.5, 0);
const leafGeo = new THREE.IcosahedronGeometry(1, 1);
const pineGeo = new THREE.ConeGeometry(1, 2.4, 6).translate(0, 1.2, 0);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const grassGeo = new THREE.ConeGeometry(0.22, 1.3, 3).translate(0, 0.65, 0);
const crystalGeo = new THREE.OctahedronGeometry(1, 0);
const stoneGeo = new THREE.BoxGeometry(1, 1, 1);
const archTopGeo = new THREE.TorusGeometry(11, 1.1, 6, 14, Math.PI);
const islandRockGeo = new THREE.ConeGeometry(1, 1.7, 7, 2).rotateX(Math.PI).translate(0, -0.85, 0);
const islandTopGeo = new THREE.CylinderGeometry(1.03, 1, 0.12, 7);

const lambertWhite = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5236, flatShading: true });
const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0xeee6d2, flatShading: true });
const islandRockMat = new THREE.MeshLambertMaterial({ color: 0x8a7258, flatShading: true });
const islandTopMat = new THREE.MeshLambertMaterial({ color: 0x6fd13a, flatShading: true });
const crystalMat = new THREE.MeshBasicMaterial({ color: 0x7ffcff });
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function setInst(mesh, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
}

class Chunk {
  constructor(cx, cz, scene) {
    this.cx = cx; this.cz = cz; this.scene = scene;
    this.group = new THREE.Group();
    this.colliders = [];
    this.crystals = [];
    this.gates = [];
    this.buildTerrain();
    this.buildDecor();
    scene.add(this.group);
  }

  buildTerrain() {
    const step = CHUNK / SEG, G = SEG + 1, W = G + 2;
    const x0 = this.cx * CHUNK, z0 = this.cz * CHUNK;
    const hs = new Float32Array(W * W), ms = new Float32Array(W * W), pfs = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      hs[k] = sample(x0 + (i - 1) * step, z0 + (j - 1) * step, S);
      ms[k] = S.m; pfs[k] = S.pf;
    }
    const pos = new Float32Array(G * G * 3), nor = new Float32Array(G * G * 3), col = new Float32Array(G * G * 3);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = (j + 1) * W + (i + 1), v = (j * G + i) * 3;
      const x = x0 + i * step, z = z0 + j * step, h = hs[k];
      pos[v] = x; pos[v + 1] = h; pos[v + 2] = z;
      let nx = hs[k - 1] - hs[k + 1], ny = 2 * step, nz = hs[k - W] - hs[k + W];
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz;
      // 색상: 풀/흙길/절벽/모래
      const g = nA(x * 0.02, z * 0.02) * 0.5 + 0.5;
      let r = 0.33 + g * 0.18, gg = 0.74 + g * 0.14, b = 0.16 + g * 0.08;
      const pf = pfs[k];
      r += (0.9 - r) * pf; gg += (0.8 - gg) * pf; b += (0.56 - b) * pf;
      const rock = Math.max(smooth(0.8, 0.55, ny), 1 - smooth(0.2, 0.9, ms[k]));
      r += (0.52 - r) * rock; gg += (0.43 - gg) * rock; b += (0.34 - b) * rock;
      if (h < 2.5 && h > -3) { const sd = smooth(2.5, 0.5, h) * (1 - rock); r += (0.93 - r) * sd; gg += (0.87 - gg) * sd; b += (0.64 - b) * sd; }
      col[v] = r; col[v + 1] = gg; col[v + 2] = b;
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let t = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * G + i, b2 = a + 1, c = a + G, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b2;
      idx[t++] = b2; idx[t++] = c; idx[t++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.terrain = new THREE.Mesh(geo, terrainMat);
    this.group.add(this.terrain);
    this.centerM = ms[Math.floor(W / 2) * W + Math.floor(W / 2)];
  }

  buildDecor() {
    const rnd = mulberry32(hash2(this.cx, this.cz, 7));
    const x0 = this.cx * CHUNK, z0 = this.cz * CHUNK;
    const s = { h: 0, m: 0, pf: 0 };

    // 나무
    const trees = [];
    for (let n = 0; n < 34; n++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = sample(x, z, s);
      if (s.m < 0.97 || h < 3 || Math.abs(x - pathX(z)) < 14) continue;
      const kind = rnd();
      trees.push({ x, z, h, kind, H: 5 + rnd() * 6, R: 3 + rnd() * 2.5, rot: rnd() * 6.28 });
    }
    if (trees.length) {
      const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
      const lm = new THREE.InstancedMesh(leafGeo, lambertWhite, trees.length);
      trees.forEach((t, i) => {
        setInst(tm, i, t.x, t.h - 0.5, t.z, 1, t.H * 0.6, 1, t.rot);
        const fy = t.h + t.H * 0.6 + t.R * 0.5;
        if (t.kind < 0.15) { // 보라꽃나무
          setInst(lm, i, t.x, fy, t.z, t.R, t.R * 0.9, t.R, t.rot);
          _c.setHSL(0.8 + rnd() * 0.05, 0.55, 0.62);
        } else if (t.kind < 0.3) { // 뾰족 침엽수 느낌
          setInst(lm, i, t.x, fy + t.R * 0.4, t.z, t.R * 0.75, t.R * 1.6, t.R * 0.75, t.rot);
          _c.setHSL(0.36, 0.5, 0.33);
        } else {
          setInst(lm, i, t.x, fy, t.z, t.R, t.R * 1.1, t.R, t.rot);
          _c.setHSL(0.27 + rnd() * 0.06, 0.55, 0.38 + rnd() * 0.1);
        }
        lm.setColorAt(i, _c);
        this.colliders.push({ x: t.x, z: t.z, r: t.R * 0.75, y0: t.h, y1: fy + t.R, kind: 'tree', meshes: [tm, lm], i, alive: true, color: _c.getHex() });
      });
      tm.computeBoundingSphere(); lm.computeBoundingSphere();
      this.group.add(tm, lm);
    }

    // 바위
    const rocks = [];
    for (let n = 0; n < 12; n++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = sample(x, z, s);
      if (s.m < 0.6 || Math.abs(x - pathX(z)) < 9) continue;
      rocks.push({ x, z, h, sc: 1.2 + rnd() * 3.2, r: rnd() * 6 });
    }
    if (rocks.length) {
      const rm = new THREE.InstancedMesh(rockGeo, lambertWhite, rocks.length);
      rocks.forEach((r, i) => {
        setInst(rm, i, r.x, r.h + r.sc * 0.3, r.z, r.sc * 1.3, r.sc, r.sc * 1.1, r.r, r.r * 0.5);
        _c.setHSL(0.07, 0.25, 0.3 + rnd() * 0.12); rm.setColorAt(i, _c);
        this.colliders.push({ x: r.x, z: r.z, r: r.sc * 1.1, y0: r.h - 2, y1: r.h + r.sc * 1.2, kind: 'rock', meshes: [rm], i, alive: true, color: _c.getHex() });
      });
      rm.computeBoundingSphere();
      this.group.add(rm);
    }

    // 풀/꽃 (저공비행 속도감용)
    const gc = 140;
    const gm = new THREE.InstancedMesh(grassGeo, grassMat, gc);
    let gi = 0;
    for (let n = 0; n < gc; n++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const h = sample(x, z, s);
      if (s.m < 0.97 || s.pf > 0.5 || h < 2) continue;
      const sc = 0.8 + rnd() * 1.4;
      setInst(gm, gi, x, h - 0.1, z, sc, sc * (0.8 + rnd()), sc, rnd() * 6, (rnd() - 0.5) * 0.4);
      const f = rnd();
      if (f < 0.08) _c.setHex(0xff9ad5); else if (f < 0.14) _c.setHex(0xfff27a); else if (f < 0.18) _c.setHex(0xffffff);
      else _c.setHSL(0.25 + rnd() * 0.07, 0.6, 0.35 + rnd() * 0.15);
      gm.setColorAt(gi++, _c);
    }
    gm.count = gi;
    if (gi) { gm.computeBoundingSphere(); this.group.add(gm); }

    // 길 위 아치 (통과 보너스)
    if (rnd() < 0.4) {
      const z = z0 + CHUNK * (0.2 + rnd() * 0.6), x = pathX(z);
      if (x > x0 && x < x0 + CHUNK) {
        const h = sample(x, z, s);
        if (s.m > 0.95) this.addArch(x, h, z, rnd);
      }
    }

    // 크리스탈 (부스트 에너지)
    const crys = [];
    for (let n = 0; n < 6; n++) {
      const z = z0 + rnd() * CHUNK;
      const x = rnd() < 0.6 ? pathX(z) + (rnd() - 0.5) * 30 : x0 + rnd() * CHUNK;
      if (x < x0 || x > x0 + CHUNK) continue;
      const h = Math.max(sample(x, z, s), SEA);
      crys.push({ x, y: h + 3 + rnd() * (rnd() < 0.3 ? 30 : 5), z, taken: false, ph: rnd() * 6 });
    }
    if (crys.length) {
      this.crystalMesh = new THREE.InstancedMesh(crystalGeo, crystalMat, crys.length);
      this.crystals = crys;
      crys.forEach((c, i) => setInst(this.crystalMesh, i, c.x, c.y, c.z, 0.7, 1.3, 0.7));
      this.crystalMesh.computeBoundingSphere();
      this.crystalMesh.frustumCulled = false;
      this.group.add(this.crystalMesh);
    }

    // 바다 위 부유섬
    if (this.centerM < 0.3 && rnd() < 0.6) {
      const R = 10 + rnd() * 16;
      const x = x0 + CHUNK * (0.25 + rnd() * 0.5), z = z0 + CHUNK * (0.25 + rnd() * 0.5), y = 25 + rnd() * 60;
      const rock = new THREE.Mesh(islandRockGeo, islandRockMat); rock.position.set(x, y, z); rock.scale.set(R, R, R); rock.rotation.y = rnd() * 6;
      const top = new THREE.Mesh(islandTopGeo, islandTopMat); top.position.set(x, y + 0.06 * R, z); top.scale.set(R, R, R); top.rotation.y = rock.rotation.y;
      this.group.add(rock, top);
      this.colliders.push({ x, z, r: R * 0.85, y0: y - R * 1.2, y1: y + 1, kind: 'island', alive: true, solid: true });
      const tree = new THREE.Mesh(leafGeo, islandTopMat); tree.position.set(x + R * 0.3, y + 5, z); tree.scale.setScalar(3.5);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.set(x + R * 0.3, y, z); trunk.scale.set(1, 4, 1);
      this.group.add(tree, trunk);
    }
  }

  addArch(x, h, z, rnd) {
    const ang = Math.atan(pathDX(z));
    const g = new THREE.Group();
    const PH = 14;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(stoneGeo, stoneMat);
        b.scale.set(3.2 - k * 0.15, PH / 4 - 0.2, 3.2 - k * 0.15);
        b.position.set(side * 11, (k + 0.5) * (PH / 4), 0);
        b.rotation.y = (rnd() - 0.5) * 0.4;
        g.add(b);
      }
    }
    const top = new THREE.Mesh(archTopGeo, stoneMat); top.position.y = PH; g.add(top);
    g.position.set(x, h - 0.5, z); g.rotation.y = ang;
    this.group.add(g);
    const A = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const D = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    for (const side of [-1, 1]) {
      this.colliders.push({ x: x + A.x * 11 * side, z: z + A.z * 11 * side, r: 2, y0: h - 1, y1: h + PH + 2, kind: 'pillar', alive: true, solid: true });
    }
    this.gates.push({ c: new THREE.Vector3(x, h, z), A, D, halfW: 9, top: PH + 8, done: false, prev: null });
  }

  dispose() {
    this.scene.remove(this.group);
    this.terrain.geometry.dispose();
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }
}

// ---------- 하늘 ----------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fe0) }, mid: { value: new THREE.Color(0x7cc0ff) }, bot: { value: new THREE.Color(0xd8efff) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = mix(bot, mid, smoothstep(-0.02, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.75, y)); gl_FragColor = vec4(c,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = mulberry32(5);
  for (let i = 0; i < 22; i++) {
    const x = 50 + r() * 156, y = 90 + r() * 80, rad = 25 + r() * 45;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeAirship(rnd) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xc9a86a, flatShading: true });
  const gold = new THREE.MeshLambertMaterial({ color: 0xe9d38a, flatShading: true });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 30), wood); g.add(hull);
  const keel = new THREE.Mesh(new THREE.ConeGeometry(5, 8, 4).rotateX(Math.PI).rotateY(Math.PI / 4), wood); keel.position.y = -5; keel.scale.z = 3; g.add(keel);
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10 + rnd() * 8, 6), gold);
    p.position.set((rnd() - 0.5) * 7, 6, -12 + (i / (n - 1)) * 24); g.add(p);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 7), gold); wing.position.y = 1; g.add(wing);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 14), gold); deck.position.set(0, 12, 0); g.add(deck);
  g.scale.setScalar(1.4 + rnd());
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.sky = makeSky(); scene.add(this.sky);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x57d6de, emissive: 0x2a8a95, emissiveIntensity: 0.35 }));
    water.position.y = SEA; this.water = water; scene.add(water);

    const tex = cloudTexture();
    this.clouds = [];
    const rnd = mulberry32(11);
    for (let i = 0; i < 70; i++) {
      const low = i < 14;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: low ? 0.75 : 0.95 }));
      const sc = low ? 50 + rnd() * 50 : 120 + rnd() * 220;
      sp.scale.set(sc, sc * 0.5, 1);
      sp.userData = { low, a: rnd() * 6.28, d: 100 + rnd() * 900, y: low ? 45 + rnd() * 50 : 170 + rnd() * 260 };
      this.clouds.push(sp); scene.add(sp);
    }
    this.ships = [];
    for (let i = 0; i < 6; i++) {
      const s = makeAirship(rnd);
      s.userData = { a: rnd() * 6.28, d: 250 + rnd() * 600, y: 110 + rnd() * 150, v: 6 + rnd() * 10, bob: rnd() * 6 };
      this.ships.push(s); scene.add(s);
    }
    this.cloudsInit = false;
  }

  chunkKey(cx, cz) { return cx + ',' + cz; }

  update(dt, pos, fwd, instant = false) {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    // 필요 청크 큐잉 (가까운 순)
    const need = new Set();
    const list = [];
    for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) {
      const cx = pcx + dx, cz = pcz + dz, k = this.chunkKey(cx, cz);
      need.add(k);
      if (!this.chunks.has(k)) {
        const cxw = (cx + 0.5) * CHUNK - pos.x, czw = (cz + 0.5) * CHUNK - pos.z;
        const ahead = cxw * fwd.x + czw * fwd.z;
        list.push({ cx, cz, k, p: Math.hypot(cxw, czw) - ahead * 0.5 });
      }
    }
    for (const [k, c] of this.chunks) if (!need.has(k)) { c.dispose(); this.chunks.delete(k); }
    list.sort((a, b) => a.p - b.p);
    const budget = instant ? list.length : 2;
    for (let i = 0; i < Math.min(budget, list.length); i++) {
      const it = list[i]; this.chunks.set(it.k, new Chunk(it.cx, it.cz, this.scene));
    }

    this.sky.position.copy(pos);
    this.water.position.x = Math.round(pos.x / 50) * 50; this.water.position.z = Math.round(pos.z / 50) * 50;

    // 구름: 플레이어 주변 링으로 재배치
    for (const c of this.clouds) {
      const u = c.userData;
      if (!this.cloudsInit) { c.position.set(pos.x + Math.cos(u.a) * u.d, u.y, pos.z + Math.sin(u.a) * u.d); }
      const dx = c.position.x - pos.x, dz = c.position.z - pos.z;
      if (dx * dx + dz * dz > 1100 * 1100) {
        const a = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 1.8, d = 700 + Math.random() * 350;
        c.position.set(pos.x + Math.cos(a) * d, u.low ? Math.max(heightAt(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d), 0) + 25 + Math.random() * 40 : u.y, pos.z + Math.sin(a) * d);
      }
    }
    for (const s of this.ships) {
      const u = s.userData;
      if (!this.cloudsInit) s.position.set(pos.x + Math.cos(u.a) * u.d, u.y, pos.z + Math.sin(u.a) * u.d);
      u.bob += dt;
      s.position.z -= u.v * dt;
      s.position.y = u.y + Math.sin(u.bob * 0.7) * 3;
      s.rotation.z = Math.sin(u.bob * 0.5) * 0.04;
      const dx = s.position.x - pos.x, dz = s.position.z - pos.z;
      if (dx * dx + dz * dz > 1300 * 1300) {
        const a = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 1.6, d = 800 + Math.random() * 400;
        s.position.set(pos.x + Math.cos(a) * d, u.y, pos.z + Math.sin(a) * d);
      }
    }
    this.cloudsInit = true;
  }

  animate(t) {
    for (const c of this.chunks.values()) {
      if (!c.crystalMesh) continue;
      c.crystals.forEach((k, i) => {
        if (k.taken) setInst(c.crystalMesh, i, 0, -999, 0, 0, 0, 0);
        else setInst(c.crystalMesh, i, k.x, k.y + Math.sin(t * 2 + k.ph) * 0.6, k.z, 0.7, 1.3, 0.7, t * 2 + k.ph);
      });
      c.crystalMesh.instanceMatrix.needsUpdate = true;
    }
  }

  nearChunks(pos) {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get(this.chunkKey(pcx + dx, pcz + dz)); if (c) out.push(c);
    }
    return out;
  }

  // 수직 캡슐 충돌
  collide(pos, pr) {
    for (const c of this.nearChunks(pos)) for (const k of c.colliders) {
      if (!k.alive) continue;
      if (pos.y < k.y0 - pr || pos.y > k.y1 + pr) continue;
      const dx = pos.x - k.x, dz = pos.z - k.z, rr = k.r + pr;
      if (dx * dx + dz * dz < rr * rr) return k;
    }
    return null;
  }

  destroy(k) {
    k.alive = false;
    for (const m of k.meshes || []) { setInst(m, k.i, 0, -999, 0, 0, 0, 0); m.instanceMatrix.needsUpdate = true; }
  }

  reset() {
    for (const c of this.chunks.values()) c.dispose();
    this.chunks.clear();
    this.cloudsInit = false;
  }
}
