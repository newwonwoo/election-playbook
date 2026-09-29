// SKY RUSH — 1인칭 비행 추격 슈팅 (자동 타겟팅)
import * as THREE from 'three';
import { World, heightAt, pathX, pathDX, SEA } from './world.js';
import { Player } from './player.js';
import { Particles, Debris, Shockwaves, SpeedLines, Post, Shake, Popups } from './fx.js';
import { Target, Rocks, makeBolts, segDist } from './entities.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const groundAt = (x, z) => Math.max(heightAt(x, z), SEA);

// ---------- 렌더러/씬 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0xd8efff;
scene.fog = new THREE.Fog(FOG, 230, 700);
scene.background = new THREE.Color(FOG);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.3, 3200);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x6b8f3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4); sun.position.set(0.6, 1, 0.35); scene.add(sun);

const world = new World(scene);
const player = new Player();
const sparks = new Particles(scene, 4000, true);
const dust = new Particles(scene, 1500, false);
const debris = new Debris(scene);
const shocks = new Shockwaves(scene);
const lines = new SpeedLines(camera);
const post = new Post(renderer, scene, camera);
const shake = new Shake();
const popups = new Popups($('popups'));
const target = new Target(scene);
const rocks = new Rocks(scene);
const bolts = makeBolts(scene);
const sfx = new Sfx();
const input = new Input(renderer.domElement);

// 표적 그림자
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const tShadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
scene.add(tShadow);

let best = 0;
try { best = +localStorage.getItem('skyrush-best') || 0; } catch (e) { /* 저장소 불가 */ }

const START_TIME = 60;
const G = {
  state: 'title', score: 0, combo: 0, comboT: 0, time: 0, left: START_TIME, dist: 0, kills: 0, hits: 0, arches: 0, smashes: 0,
  wave: 1, hitstop: 0, slow: 0, ts: 1, fovKick: 0, lockP: 0, locked: false, fireT: 0, side: 1, overT: 0, maxCombo: 0, t: 0,
  respawnT: 0, bob: 0, tDist: 0,
};
const mult = () => 1 + Math.min(4, Math.floor(G.combo / 5) * 0.5);

function placeOnPath(z) {
  const x = pathX(z);
  player.pos.set(x, groundAt(x, z) + 10, z);
  player.yaw = Math.atan2(pathDX(z), 1);
  player.pitch = 0; player.updateFwd();
}
player.reset(); placeOnPath(0);
target.spawn(-120, 1);
world.update(0, player.pos, player.fwd, true);

// ---------- 타격감 헬퍼 ----------
function impact({ stop = 0, trauma = 0, flash = 0, flashColor = 0xffffff, fov = 0, slow = 0 }) {
  G.hitstop = Math.max(G.hitstop, stop);
  shake.add(trauma);
  if (flash) post.doFlash(flashColor, flash);
  G.fovKick += fov;
  G.slow = Math.max(G.slow, slow);
}
function addScore(base, pos, text, cls) {
  const pts = Math.round(base * mult());
  G.score += pts;
  if (pos) popups.spawn(pos, text ? `${text} +${pts}` : `+${pts}`, cls);
  return pts;
}
function bumpCombo() {
  G.combo++; G.comboT = 3; G.maxCombo = Math.max(G.maxCombo, G.combo);
  const el = $('combo'); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 90);
}
function hurt(dmg, color = 0xff3344) {
  if (player.invuln > 0 || G.state !== 'play') return false;
  player.hp -= dmg; player.invuln = 0.9;
  post.hurt = 1; post.doFlash(color, 0.25);
  G.combo = Math.floor(G.combo / 2);
  sfx.hurt();
  if (player.hp <= 0) gameOver('격추당했다!');
  return true;
}
const ahead = (d) => player.pos.clone().addScaledVector(player.fwd, d);

// ---------- 충돌 이벤트 ----------
function onGround(power) {
  const p = player.pos;
  const overSea = heightAt(p.x, p.z) < SEA;
  const at = ahead(4); at.y = groundAt(at.x, at.z) + 0.5;
  sparks.burst(at, 30, 35, overSea ? [0xbff8ff, 0xffffff] : [0xfff1c0, 0xffffff], 1.2, 0.5, { dir: new THREE.Vector3(0, 1, 0), spread: 1.2, grav: 30 });
  dust.burst(at, 26, 22, overSea ? [0xd8fbff] : [0xb99b6b, 0x8fcf5a], 3.5, 1.1, { dir: new THREE.Vector3(0, 1, 0), spread: 1.5, drag: 2, grav: 4 });
  if (!overSea) debris.spawn(ahead(8), 10, 22, [0x8b6a45, 0x5fae3a], 0.6, player.fwd.clone().multiplyScalar(player.speed * 0.6));
  player.speed *= 0.65;
  sfx.crash(power > 0.4);
  impact({ stop: 0.07 + power * 0.06, trauma: 0.55 + power * 0.4, fov: -6 });
  hurt(Math.round(8 + power * 18));
}

function onObstacle(k) {
  const p = player.pos;
  const hitPos = new THREE.Vector3(k.x, clamp(p.y, k.y0, k.y1), k.z);
  if (!k.solid && player.boosting) {
    world.destroy(k);
    const cols = k.kind === 'tree' ? [k.color, 0x7a5236, 0x9fe06a] : [k.color, 0x6b5a48];
    debris.spawn(ahead(6), 18, 40, cols, k.kind === 'tree' ? 0.9 : 1.1, player.fwd.clone().multiplyScalar(player.speed * 0.9));
    sparks.burst(ahead(5), 26, 50, [0xffffff, 0xfff1a8], 1.1, 0.35);
    sfx.smash();
    impact({ stop: 0.05, trauma: 0.35, fov: 4 });
    G.smashes++; bumpCombo(); addScore(40, ahead(12), 'SMASH', 'smash');
    return;
  }
  const dx = p.x - k.x, dz = p.z - k.z, l = Math.hypot(dx, dz) || 1;
  p.x = k.x + (dx / l) * (k.r + 2.5); p.z = k.z + (dz / l) * (k.r + 2.5);
  player.yaw += (Math.random() < 0.5 ? -1 : 1) * 0.25;
  player.speed *= 0.5;
  if (!k.solid) world.destroy(k);
  debris.spawn(hitPos, 14, 30, k.color ? [k.color, 0x7a5236] : [0xeee6d2, 0x8a7258], 1);
  sfx.crash(true);
  impact({ stop: 0.11, trauma: 0.9, fov: -8 });
  hurt(k.solid ? 22 : 14);
}

// ---------- 표적 타격 ----------
function hitTarget(pos, dir) {
  const crit = Math.random() < 0.15;
  const dmg = crit ? 3 : 1;
  target.hp -= dmg; target.flash = 1; target.wob = crit ? 0.5 : 0.25;
  target.knock(dir, crit ? 1.5 : 0.4);
  G.hits++;
  sparks.burst(pos, crit ? 34 : 14, crit ? 55 : 35, [0xffe066, 0xfff6c8, 0xffb13b], crit ? 2.4 : 1.6, 0.35, { drag: 3 });
  shocks.spawn(pos, crit ? 0xffe066 : 0xffffff, crit ? 9 : 4, 0.2);
  sfx.hit(crit);
  impact({ stop: crit ? 0.06 : 0.018, trauma: crit ? 0.2 : 0.06, fov: crit ? 2.5 : 0.6 });
  addScore(crit ? 45 : 12, crit ? pos : null, crit ? 'CRIT' : '', 'gold');
  if (!crit && Math.random() < 0.5) popups.spawn(pos, '-1', 'dmg');
  if (target.hp <= 0) killTarget();
}

function killTarget() {
  const p = target.pos.clone();
  target.down(player);
  sparks.burst(p, 120, 90, [0xffe066, 0xff7a3c, 0xffffff, 0xe8452c], 2.6, 0.8, { drag: 2.2 });
  sparks.burst(p, 40, 25, [0xffffff], 4, 0.25);
  dust.burst(p, 20, 16, [0x8a7a6a, 0xb0a090], 6, 1.4, { drag: 1.5, grav: -2 });
  debris.spawn(p, 22, 45, [0x8a5a2b, 0xf2c14e, 0xe8452c, 0xd62f2f], 0.9, target.vel.clone());
  shocks.spawn(p, 0xffffff, 34, 0.45);
  shocks.spawn(p, 0xffc93c, 22, 0.6);
  sfx.kill();
  impact({ stop: 0.14, trauma: 0.6, flash: 0.35, fov: 12, slow: 0.5 });
  G.kills++; bumpCombo();
  const bonus = 12;
  G.left += bonus;
  addScore(1000 * G.wave, p, 'TARGET DOWN', 'kill');
  popups.spawn(p.clone().add(new THREE.Vector3(0, -5, 0)), `+${bonus}초`, 'time');
  banner(`WAVE ${G.wave} CLEAR`);
  G.wave++;
  G.lockP = 0; G.locked = false;
  bolts.list.forEach((b) => { b.target = null; });
}

function onTargetCrash() {
  const p = target.pos.clone(); p.y = groundAt(p.x, p.z) + 1;
  sparks.burst(p, 70, 60, [0xffe066, 0xff7a3c, 0xffffff], 2.2, 0.7, { dir: new THREE.Vector3(0, 1, 0), spread: 1.4 });
  dust.burst(p, 30, 26, [0x9b8b78, 0xb99b6b], 7, 1.6, { dir: new THREE.Vector3(0, 1, 0), spread: 1.6, drag: 1.4, grav: -1 });
  debris.spawn(p, 16, 35, [0x8b6a45, 0x5fae3a], 1);
  shocks.spawn(p, 0xffffff, 26, 0.5, null, new THREE.Vector3(0, 1, 0));
  const d = p.distanceTo(player.pos);
  sfx.crash(true);
  impact({ trauma: clamp(0.6 - d / 500, 0.1, 0.6) });
  G.respawnT = 1.2;
}

function spawnNextTarget() {
  target.spawn(player.pos.z - 230, G.wave);
  if (G.state === 'play') banner(`WAVE ${G.wave} — 표적 출현!`);
}

function onRock(i, k, byBolt) {
  const p = k.p.clone();
  const r = k.r;
  rocks.remove(i);
  debris.spawn(p, byBolt ? 10 : 14, 30, [0x7a5c44, 0x5e4b3a, 0x9b8b78], r * 0.6, byBolt ? null : player.fwd.clone().multiplyScalar(player.speed * 0.8));
  dust.burst(p, 10, 14, [0x9b8b78], 4, 0.8, { grav: 3 });
  sparks.burst(p, 16, 40, [0xffffff, 0xffe066], 1.2, 0.3);
  if (byBolt) { sfx.smash(); impact({ stop: 0.03, trauma: 0.12 }); bumpCombo(); addScore(50, p, 'BREAK', 'smash'); return; }
  if (player.boosting) { sfx.smash(); impact({ stop: 0.06, trauma: 0.4, fov: 5 }); bumpCombo(); G.smashes++; addScore(80, ahead(14), 'SMASH', 'smash'); return; }
  sfx.crash(true);
  impact({ stop: 0.1, trauma: 0.85, fov: -7 });
  player.speed *= 0.7;
  hurt(14);
}

// ---------- 흐름 ----------
let bannerTimer = 0;
function banner(text) {
  const el = $('banner'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function gameOver(reason) {
  G.state = 'over'; G.overT = 0; G.reason = reason;
  const p = ahead(3);
  sparks.burst(p, 90, 60, [0xff5e3a, 0xffd34d, 0xffffff], 1.4, 0.9, {});
  sfx.kill();
  impact({ stop: 0.25, trauma: 1, flash: 0.45, slow: 1.2 });
  if (G.score > best) { best = G.score; try { localStorage.setItem('skyrush-best', String(best)); } catch (e) { /* 무시 */ } }
  $('lock').style.display = 'none'; $('lockTxt').style.display = 'none'; $('arrow').style.display = 'none';
}

function startGame() {
  sfx.init();
  const z = player.pos.z;
  player.reset(); placeOnPath(z);
  Object.assign(G, { state: 'play', score: 0, combo: 0, comboT: 0, time: 0, left: START_TIME, dist: 0, kills: 0, hits: 0, arches: 0, smashes: 0, maxCombo: 0, wave: 1, lockP: 0, locked: false, hitstop: 0, slow: 0, respawnT: 0 });
  rocks.clear(); bolts.clear(); popups.clear();
  target.spawn(z - 150, 1);
  $('titleScr').classList.add('hidden'); $('overScr').classList.add('hidden'); $('hud').classList.remove('hidden');
  post.doFlash(0xffffff, 0.5); shake.add(0.3); G.fovKick += 12; player.burst = 60; sfx.boost();
  banner('빨간 망토를 추격하라!');
}
$('startBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('mute').onclick = () => { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') $('mute').onclick();
  if ((e.code === 'Enter' || e.code === 'Space') && G.state !== 'play' && (G.state === 'title' || G.overT > 1.2)) startGame();
});

// ---------- 오토파일럿 (타이틀/게임오버 배경) ----------
function autopilot() {
  let tx, ty, tz;
  if (target.state === 'flee') { tx = target.pos.x; ty = target.pos.y + 3; tz = target.pos.z; }
  else { tz = player.pos.z - 160; tx = pathX(tz); ty = Math.max(groundAt(tx, tz), groundAt(player.pos.x, player.pos.z)) + 12; }
  const want = Math.atan2(-(tx - player.pos.x), -(tz - player.pos.z));
  let err = want - player.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
  const gap = player.pos.z - tz;
  return { x: clamp(-err * 1.6, -1, 1), y: clamp((ty - player.pos.y) * 0.06, -0.8, 0.8), boost: gap > 90 && player.energy > 30, fire: false };
}

// ---------- 시뮬레이션 ----------
const _v = new THREE.Vector3(), _u = new THREE.Vector3();
function simulate(dt, inp) {
  const playing = G.state === 'play';
  if (G.state === 'over') player.energy = 0;
  const hitGround = player.update(dt, inp);
  if (playing && hitGround > 0) onGround(hitGround);

  if (player.boostStarted && playing) {
    sfx.boost();
    shocks.spawn(ahead(10), 0xbff8ff, 10, 0.35, null, player.fwd);
    impact({ trauma: 0.25, fov: 10, flash: 0.12, flashColor: 0xcffcff });
  }

  // 저공비행: 먼지/물보라 + 점수
  const low = player.groundDist < 7;
  if (low && G.state !== 'over') {
    const water = heightAt(player.pos.x, player.pos.z) < SEA;
    for (let i = 0; i < 3; i++) {
      const at = ahead(6 + Math.random() * 10), s = (Math.random() - 0.5) * 8;
      const gh = groundAt(at.x, at.z);
      dust.emit(at.x + s, gh + 0.3, at.z + s, (Math.random() - 0.5) * 14, 3 + Math.random() * 5, (Math.random() - 0.5) * 14,
        water ? 0xe8fdff : (Math.random() < 0.5 ? 0xd9c79a : 0xa6dd73), water ? 1.6 : 1.3, 0.7, 2.5, 6);
    }
    if (playing) G.score += 60 * dt * mult();
  }
  $('skim').classList.toggle('on', low && playing);

  // 표적
  const ev = target.update(dt, player, rocks, G.locked);
  if (target.state === 'flee' && Math.random() < 0.8) {
    const t = target.tail;
    sparks.emit(t.x, t.y, t.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, Math.random() < 0.5 ? 0xffd36b : 0xfff6c8, 1.4, 0.6, 1.5, 0);
  }
  if (target.state === 'down') dust.emit(target.pos.x, target.pos.y, target.pos.z, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, 0x555555, 3, 1.2, 1, -2);
  if (ev === 'crashed') onTargetCrash();
  if (ev === 'escaped') {
    G.respawnT = 0.8;
    if (playing) { G.left -= 8; G.combo = 0; banner('표적 도주! -8초'); sfx.hurt(); }
  }
  if (target.state === 'dead' || target.state === 'none') {
    G.respawnT -= dt;
    if (G.respawnT <= 0) spawnNextTarget();
  }
  rocks.update(dt);

  if (playing) {
    // 지형 장애물
    const k = world.collide(player.pos, 1.3);
    if (k) onObstacle(k);
    // 크리스탈/아치
    for (const c of world.nearChunks(player.pos)) {
      for (const cr of c.crystals) {
        if (cr.taken) continue;
        _v.set(cr.x - player.pos.x, cr.y - player.pos.y, cr.z - player.pos.z);
        if (_v.lengthSq() < 49) {
          cr.taken = true; player.energy = Math.min(100, player.energy + 15);
          sparks.burst(_v.set(cr.x, cr.y, cr.z), 20, 25, [0x7ffcff, 0xffffff], 0.9, 0.4);
          sfx.pickup(); G.score += 30;
        }
      }
      for (const gt of c.gates) {
        if (gt.done) continue;
        _v.subVectors(player.pos, gt.c);
        const side = _v.dot(gt.D);
        if (gt.prev !== null && Math.sign(side) !== Math.sign(gt.prev) && Math.abs(side) < 30) {
          const u = _v.dot(gt.A), h = player.pos.y - gt.c.y;
          if (Math.abs(u) < gt.halfW && h > 0 && h < gt.top) {
            gt.done = true; G.arches++; bumpCombo(); G.left += 2;
            const at = ahead(20);
            sparks.burst(at, 40, 45, [0xffffff, 0xfff3c4], 1.2, 0.5);
            sfx.arch(); impact({ trauma: 0.2, fov: 8, flash: 0.1, flashColor: 0xfff6d8 });
            player.burst += 45;
            addScore(300, null); banner('ARCH! +2초');
          }
        }
        gt.prev = side;
      }
    }
    // 날아오는 바위
    for (let i = rocks.list.length - 1; i >= 0; i--) {
      const r = rocks.list[i];
      if (r.p.distanceToSquared(player.pos) < (r.r + 2) * (r.r + 2)) onRock(i, r, false);
    }

    // ---- 자동 타겟팅: 시야 원뿔 안 → 락온 게이지 충전 → 완료 시 자동 사격 ----
    let inCone = false;
    if (target.state === 'flee') {
      _v.subVectors(target.pos, player.pos);
      const d = _v.length();
      const a = Math.acos(clamp(_v.dot(player.fwd) / d, -1, 1));
      inCone = a < 0.4 && d < 320;
      G.tDist = d;
    }
    const was = G.locked;
    G.lockP = inCone ? Math.min(1, G.lockP + dt / 0.5) : Math.max(0, G.lockP - dt * 2.5);
    G.locked = G.lockP >= 1;
    if (G.locked && !was) sfx.lock();

    G.fireT -= dt;
    if ((G.locked || inp.fire) && G.fireT <= 0) {
      G.fireT = 0.11; G.side = -G.side;
      const m = player.localPoint(G.side * 1.1, -0.9, -1.5, _u);
      let dir;
      if (G.locked) {
        const d = target.pos.distanceTo(m);
        dir = target.pos.clone().addScaledVector(target.vel, d / 330).sub(m).normalize();
      } else dir = player.fwd.clone();
      bolts.fire(m, dir.multiplyScalar(330).addScaledVector(player.fwd, player.speed * 0.5), G.locked ? target : null);
      sfx.shoot();
    }
  } else $('skim').classList.remove('on');

  // 유도탄
  bolts.update(dt, 8);
  for (let i = bolts.list.length - 1; i >= 0; i--) {
    const b = bolts.list[i];
    sparks.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0xffc93c, 1.1, 0.16, 0, 0);
    if (target.alive && segDist(b.prev, b.p, target.pos) < 3.2) {
      _v.copy(b.v).normalize();
      hitTarget(target.pos.clone().addScaledVector(_v, -1.5), _v.clone());
      bolts.remove(i); continue;
    }
    for (let j = rocks.list.length - 1; j >= 0; j--) {
      const r = rocks.list[j];
      if (segDist(b.prev, b.p, r.p) < r.r + 0.8) { onRock(j, r, true); bolts.remove(i); break; }
    }
  }

  if (playing) {
    G.comboT -= dt; if (G.comboT <= 0 && G.combo > 0) G.combo = 0;
    G.time += dt; G.dist += player.speed * dt;
    G.left -= dt;
    if (G.left <= 0) { G.left = 0; gameOver('시간 초과!'); }
  }
}

// ---------- 1인칭 카메라 ----------
const _e = new THREE.Euler();
function updateCamera(rdt, dt) {
  const sk = clamp((player.speed - 80) / 85, 0, 1.3);
  G.bob += dt * (6 + sk * 6);
  camera.position.copy(player.pos).add(shake.off);
  camera.position.y += Math.sin(G.bob) * 0.08 * (1 + sk);
  const gh = groundAt(camera.position.x, camera.position.z) + 1;
  if (camera.position.y < gh) camera.position.y = gh;
  camera.quaternion.setFromEuler(_e.set(player.pitch, player.yaw, player.roll * 0.9 + shake.rot, 'YXZ'));
  G.fovKick = damp(G.fovKick, 0, 5, rdt);
  camera.fov = clamp(72 + sk * 22 + G.fovKick, 55, 118);
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const H = { score: $('score'), combo: $('combo'), wave: $('wave'), speed: $('speed'), dist: $('dist'), kills: $('kills'), timer: $('timer'), hp: $('hpBar').firstElementChild, en: $('enBar').firstElementChild, hpT: $('hpTxt'), enT: $('enTxt'), lock: $('lock'), lockTxt: $('lockTxt'), arrow: $('arrow'), tbar: $('tbar'), thp: $('thp').firstElementChild, tname: $('tname') };
function updateHud(rdt) {
  const W = innerWidth, Hh = innerHeight;
  popups.update(rdt, camera, W, Hh);
  if (G.state !== 'play') return;
  H.score.textContent = Math.floor(G.score).toLocaleString();
  H.combo.textContent = G.combo > 1 ? `COMBO ${G.combo}  ×${mult().toFixed(1)}` : '';
  H.wave.textContent = `WAVE ${G.wave}`;
  H.speed.textContent = Math.round(player.speed * 3.6);
  H.speed.style.color = player.boosting ? '#9ffcff' : '#fff';
  H.dist.textContent = `${(G.dist / 1000).toFixed(2)} km`;
  H.kills.textContent = `격추 ${G.kills}`;
  H.timer.textContent = G.left.toFixed(1);
  H.timer.classList.toggle('warn', G.left < 10);
  H.hp.style.width = `${Math.max(0, player.hp)}%`; H.hpT.textContent = Math.max(0, Math.ceil(player.hp));
  H.en.style.width = `${player.energy}%`; H.enT.textContent = Math.floor(player.energy);

  const tv = target.state === 'flee';
  H.tbar.style.opacity = tv ? 1 : 0.35;
  H.thp.style.width = `${tv ? (target.hp / target.max) * 100 : 0}%`;
  H.tname.textContent = tv ? `빨간 망토 Lv.${G.wave}  ·  ${Math.round(G.tDist)}m` : '다음 표적 탐색 중…';

  // 락온 레티클: 크게 떴다가 수축하며 잠김
  if (tv) {
    _v.copy(target.pos).project(camera);
    const front = _v.z < 1;
    const on = front && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * Hh;
    if (on && G.lockP > 0) {
      const sc = 1 + (1 - G.lockP) * 2.4;
      H.lock.style.display = 'block';
      H.lock.style.left = `${sx}px`; H.lock.style.top = `${sy}px`;
      H.lock.style.transform = `scale(${sc}) rotate(${(1 - G.lockP) * 180 + (G.locked ? G.t * 60 : 0)}deg)`;
      H.lock.style.opacity = 0.35 + G.lockP * 0.65;
      H.lock.classList.toggle('locked', G.locked);
      H.lockTxt.style.display = G.locked ? 'block' : 'none';
      H.lockTxt.style.left = `${sx}px`; H.lockTxt.style.top = `${sy + 50}px`;
    } else { H.lock.style.display = 'none'; H.lockTxt.style.display = 'none'; }
    if (!on) {
      let ax = _v.x, ay = _v.y; if (!front) { ax = -ax; ay = -ay; }
      const ang = Math.atan2(-ay, ax);
      const r = Math.min(W, Hh) * 0.4;
      H.arrow.style.display = 'block';
      H.arrow.style.left = `${W / 2 + Math.cos(ang) * r}px`; H.arrow.style.top = `${Hh / 2 + Math.sin(ang) * r}px`;
      H.arrow.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
    } else H.arrow.style.display = 'none';
  } else { H.lock.style.display = 'none'; H.lockTxt.style.display = 'none'; H.arrow.style.display = 'none'; }
}

function showOver() {
  $('hud').classList.add('hidden');
  $('overTitle').textContent = G.reason || 'GAME OVER';
  $('stats').innerHTML = `<div class="big">${Math.floor(G.score).toLocaleString()}</div>
    <div>최고 기록 ${Math.floor(best).toLocaleString()}</div>
    <div>격추 ${G.kills} · 도달 WAVE ${G.wave} · 명중 ${G.hits}</div>
    <div>비행 ${(G.dist / 1000).toFixed(2)} km · 아치 ${G.arches} · 박살 ${G.smashes} · 최대콤보 ${G.maxCombo}</div>`;
  $('overScr').classList.remove('hidden');
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  let dt;
  if (G.hitstop > 0) { G.hitstop -= rdt; dt = 0; }
  else {
    G.slow = Math.max(0, G.slow - rdt);
    G.ts = damp(G.ts, G.slow > 0 ? 0.28 : 1, 14, rdt);
    dt = rdt * G.ts;
  }
  G.t += rdt;
  if (G.state === 'over') { G.overT += rdt; if (G.overT > 1.2 && $('overScr').classList.contains('hidden')) showOver(); }

  // G.autoSteer: 자동 조종(검증·데모용)
  if (dt > 0) simulate(dt, G.state === 'play' && !G.autoSteer ? input.read() : { ...autopilot(), fire: false });
  world.update(dt, player.pos, player.fwd);
  world.animate(G.t);
  sparks.update(dt); dust.update(dt); debris.update(dt); shocks.update(dt, camera);
  shake.update(rdt);
  updateCamera(rdt, dt);

  if (target.obj.visible) {
    const gy = groundAt(target.pos.x, target.pos.z);
    const hgt = target.pos.y - gy;
    tShadow.visible = true; tShadow.position.set(target.pos.x, gy + 0.3, target.pos.z);
    tShadow.scale.setScalar(Math.max(0.4, 1.3 - hgt * 0.03)); tShadow.material.opacity = clamp(1 - hgt / 40, 0, 1);
  } else tShadow.visible = false;

  const sk = clamp((player.speed - 70) / 90, 0, 1.4);
  const boostK = player.boosting ? 1 : 0;
  const lowK = player.groundDist < 7 ? 0.35 : 0;
  lines.update(dt > 0 ? dt : 0, player.speed, clamp(sk * 0.7 + boostK * 0.5 + lowK, 0, 1.4));
  post.update(rdt, sk, boostK);
  sfx.wind(player.speed, boostK, lowK);
  updateHud(rdt);
  post.render();
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// 검증용 훅
window.__game = { G, player, target, rocks, world, bolts, startGame };
