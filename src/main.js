// SKY RUSH — 메인 루프 / 게임 규칙 / 타격감 연출 조율
import * as THREE from 'three';
import { World, heightAt, pathX, pathDX, SEA } from './world.js';
import { Player } from './player.js';
import { Particles, Debris, Shockwaves, SpeedLines, Post, Shake, Popups } from './fx.js';
import { Rings, Enemies, makeBolts, makeOrbs, segDist } from './entities.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

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
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 3200);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x6b8f3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4); sun.position.set(0.6, 1, 0.35); scene.add(sun);

const world = new World(scene);
const player = new Player(scene);
const sparks = new Particles(scene, 4000, true);
const dust = new Particles(scene, 1500, false);
const debris = new Debris(scene);
const shocks = new Shockwaves(scene);
const lines = new SpeedLines(camera);
const post = new Post(renderer, scene, camera);
const shake = new Shake();
const popups = new Popups($('popups'));
const rings = new Rings(scene);
const enemies = new Enemies(scene);
const bolts = makeBolts(scene);
const orbs = makeOrbs(scene);
const sfx = new Sfx();
const input = new Input(renderer.domElement);

let best = 0;
try { best = +localStorage.getItem('skyrush-best') || 0; } catch (e) { /* 저장소 불가 */ }

const G = {
  state: 'title', score: 0, combo: 0, comboT: 0, streak: 0, time: 0, dist: 0, kills: 0, ringsHit: 0, arches: 0, smashes: 0,
  hitstop: 0, slow: 0, ts: 1, fovKick: 0, lock: null, lockT: 0, fireT: 0, side: 1, overT: 0, maxCombo: 0, t: 0,
};
const mult = () => 1 + Math.min(4, Math.floor(G.combo / 3) * 0.5);

// ---------- 시작 위치 ----------
function placeOnPath(z) {
  const x = pathX(z);
  player.pos.set(x, Math.max(heightAt(x, z), SEA) + 18, z);
  player.yaw = Math.atan2(pathDX(z), 1);
  player.pitch = 0; player.updateFwd();
}
player.reset(); placeOnPath(0);
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
  G.combo++; G.comboT = 3.5; G.maxCombo = Math.max(G.maxCombo, G.combo);
  const el = $('combo'); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 90);
}
function hurt(dmg, color = 0xff3344) {
  if (player.invuln > 0 || G.state !== 'play') return false;
  player.hp -= dmg; player.invuln = 1.0;
  post.hurt = 1; post.doFlash(color, 0.25);
  G.combo = Math.floor(G.combo / 2);
  sfx.hurt();
  if (player.hp <= 0) gameOver();
  return true;
}

// ---------- 이벤트 ----------
function onGround(power) {
  const p = player.pos;
  const overSea = heightAt(p.x, p.z) < SEA;
  sparks.burst(p, 30, 35, overSea ? [0xbff8ff, 0xffffff] : [0xfff1c0, 0xffffff], 1.2, 0.5, { dir: new THREE.Vector3(0, 1, 0), spread: 1.2, grav: 30 });
  dust.burst(p, 26, 22, overSea ? [0xd8fbff] : [0xb99b6b, 0x8fcf5a], 3.5, 1.1, { dir: new THREE.Vector3(0, 1, 0), spread: 1.5, drag: 2, grav: 4 });
  if (!overSea) debris.spawn(p, 10, 22, [0x8b6a45, 0x5fae3a], 0.8, player.fwd.clone().multiplyScalar(player.speed * 0.4));
  player.speed *= 0.65;
  sfx.crash(power > 0.4);
  impact({ stop: 0.07 + power * 0.06, trauma: 0.5 + power * 0.4, fov: -6 });
  hurt(Math.round(8 + power * 18));
}

function onObstacle(k) {
  const p = player.pos;
  const hitPos = new THREE.Vector3(k.x, clamp(p.y, k.y0, k.y1), k.z);
  if (!k.solid && player.boosting) {
    // 부스트 들이받기: 나무/바위 박살
    world.destroy(k);
    const cols = k.kind === 'tree' ? [k.color, 0x7a5236, 0x9fe06a] : [k.color, 0x6b5a48];
    debris.spawn(hitPos, 18, 45, cols, k.kind === 'tree' ? 1.3 : 1.6, player.fwd.clone().multiplyScalar(player.speed * 0.8));
    sparks.burst(hitPos, 26, 60, [0xffffff, 0xfff1a8], 1.3, 0.4);
    dust.burst(hitPos, 12, 25, k.kind === 'tree' ? [0x7fd04a, 0x5fae3a] : [0x9b8b78], 3, 0.9, { grav: 6 });
    shocks.spawn(hitPos, 0xffffff, 10, 0.3);
    sfx.smash();
    impact({ stop: 0.05, trauma: 0.3, fov: 4 });
    G.smashes++; bumpCombo(); addScore(40, hitPos, 'SMASH', 'smash');
    return;
  }
  // 정면 충돌: 튕겨냄
  const dx = p.x - k.x, dz = p.z - k.z, l = Math.hypot(dx, dz) || 1;
  p.x = k.x + (dx / l) * (k.r + 2.5); p.z = k.z + (dz / l) * (k.r + 2.5);
  player.yaw += (Math.random() < 0.5 ? -1 : 1) * 0.25;
  player.speed *= 0.5;
  if (!k.solid) world.destroy(k);
  debris.spawn(hitPos, 14, 30, k.color ? [k.color, 0x7a5236] : [0xeee6d2, 0x8a7258], 1.2);
  sparks.burst(hitPos, 22, 40, [0xffffff, 0xffc36b], 1.2, 0.4);
  sfx.crash(true);
  impact({ stop: 0.11, trauma: 0.85, fov: -8 });
  hurt(k.solid ? 22 : 14);
}

function onRing(r, hit) {
  if (!hit) { G.streak = 0; popups.spawn(r.pos, 'MISS', 'bad'); return; }
  G.streak++; G.ringsHit++;
  const gold = r.gold;
  player.energy = Math.min(100, player.energy + (gold ? 35 : 14));
  player.hp = Math.min(100, player.hp + (gold ? 6 : 2));
  player.burst += gold ? 70 : 38;
  shocks.spawn(r.pos, gold ? 0xffd34d : 0x8ffcff, gold ? 28 : 20, 0.45, null, r.dir);
  sparks.burst(r.pos, gold ? 70 : 40, gold ? 70 : 45, gold ? [0xffd34d, 0xffffff, 0xffb000] : [0x8ffcff, 0xffffff], 1.4, 0.6, { drag: 3 });
  sfx.ring(G.streak, gold);
  impact({ trauma: gold ? 0.3 : 0.12, fov: gold ? 12 : 7, flash: gold ? 0.18 : 0.06, flashColor: gold ? 0xfff0b0 : 0xcffcff });
  bumpCombo();
  addScore((gold ? 300 : 100) * (1 + Math.min(G.streak, 20) * 0.1), r.pos, gold ? 'GOLD' : '', gold ? 'gold' : 'ring');
}

function hitEnemy(e, dmg, pos, dir) {
  e.hp -= dmg; e.flash = 1; e.punch = 1;
  e.drift.addScaledVector(dir, 10);
  sparks.burst(pos, 20, 70, [0xffffff, 0xffe08a, 0xff7ad9], 1.3, 0.35, { dir: dir.clone().negate(), spread: 1.4 });
  shocks.spawn(pos, 0xffffff, 5, 0.18);
  sfx.hit();
  impact({ stop: 0.045, trauma: 0.14, fov: 1.5 });
  addScore(20, null);
  if (e.hp <= 0) killEnemy(e, false);
}

function killEnemy(e, ram) {
  e.alive = false;
  const i = enemies.list.indexOf(e); if (i >= 0) enemies.remove(i);
  const p = e.pos;
  sparks.burst(p, 110, 95, [0xff3fa4, 0xff7ad9, 0xffd34d, 0xffffff], 2.4, 0.8, { drag: 2.2 });
  sparks.burst(p, 40, 30, [0xffffff], 4, 0.25);
  dust.burst(p, 24, 18, [0x8a7a6a, 0xb0a090], 6, 1.4, { drag: 1.5, grav: -2 });
  debris.spawn(p, 26, 50, [0x7d6650, 0x5e4b3a, 0xff3fa4], 1.5, player.fwd.clone().multiplyScalar(player.speed * 0.4));
  shocks.spawn(p, 0xffffff, 34, 0.45);
  shocks.spawn(p, 0xff3fa4, 20, 0.6);
  sfx.kill();
  impact({ stop: ram ? 0.17 : 0.11, trauma: ram ? 0.8 : 0.55, flash: 0.35, fov: ram ? 14 : 9, slow: 0.35 });
  G.kills++; bumpCombo();
  addScore(ram ? 600 : 250, p, ram ? 'RAM!' : 'BREAK', 'kill');
  if (G.combo >= 3) popups.spawn(p.clone().add(new THREE.Vector3(0, -6, 0)), `COMBO x${G.combo}`, 'gold');
}

function gameOver() {
  G.state = 'over'; G.overT = 0;
  const p = player.pos.clone();
  sparks.burst(p, 120, 70, [0xff5e3a, 0xffd34d, 0xffffff], 1.4, 0.9, {});
  debris.spawn(p, 24, 40, [0x8a5a2b, 0xf2c14e, 0xe8452c], 0.5, player.fwd.clone().multiplyScalar(player.speed * 0.8));
  shocks.spawn(p, 0xffffff, 26, 0.6);
  sfx.kill();
  impact({ stop: 0.25, trauma: 1, flash: 0.4, slow: 1.2 });
  player.model.visible = false;
  if (G.score > best) { best = G.score; try { localStorage.setItem('skyrush-best', String(best)); } catch (e) { /* 무시 */ } }
  $('lock').style.display = 'none';
}

function startGame() {
  sfx.init();
  const z = player.pos.z;
  player.reset(); placeOnPath(z);
  Object.assign(G, { state: 'play', score: 0, combo: 0, comboT: 0, streak: 0, time: 0, dist: 0, kills: 0, ringsHit: 0, arches: 0, smashes: 0, maxCombo: 0, lock: null, hitstop: 0, slow: 0 });
  rings.clear(); enemies.clear(); bolts.clear(); orbs.clear(); popups.clear();
  enemies.spawnT = 3;
  rings.spawnChain(player, 200);
  $('titleScr').classList.add('hidden'); $('overScr').classList.add('hidden'); $('hud').classList.remove('hidden');
  player.model.visible = true;
  post.doFlash(0xffffff, 0.5); shake.add(0.3); G.fovKick += 12; player.burst = 60; sfx.boost();
}
$('startBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('mute').onclick = () => { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') $('mute').onclick();
  if ((e.code === 'Enter' || e.code === 'Space') && G.state !== 'play' && (G.state === 'title' || G.overT > 1.2)) startGame();
});

// ---------- 오토파일럿 (타이틀/게임오버 배경 비행) ----------
function autopilot() {
  const za = player.pos.z - 160, tx = pathX(za);
  const want = Math.atan2(-(tx - player.pos.x), -(za - player.pos.z));
  let err = want - player.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
  const ty = Math.max(heightAt(tx, za), heightAt(player.pos.x, player.pos.z), SEA) + 16;
  return { x: clamp(-err * 2.5, -1, 1), y: clamp((ty - player.pos.y) * 0.06, -0.8, 0.8), boost: false, fire: false };
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
    shocks.spawn(player.tail, 0xbff8ff, 14, 0.4, null, player.fwd);
    impact({ trauma: 0.25, fov: 9, flash: 0.12, flashColor: 0xcffcff });
  }

  // 빗자루 꼬리 불꽃
  if (G.state !== 'over') {
    const tail = player.tail, n = player.boosting ? 6 : 2;
    for (let i = 0; i < n; i++) {
      sparks.emit(tail.x, tail.y, tail.z, -player.fwd.x * 12 + (Math.random() - 0.5) * 6, -player.fwd.y * 12 + (Math.random() - 0.5) * 6, -player.fwd.z * 12 + (Math.random() - 0.5) * 6,
        player.boosting ? (Math.random() < 0.5 ? 0x7ffcff : 0xffffff) : (Math.random() < 0.5 ? 0xffd36b : 0xfff6c8), player.boosting ? 1.1 : 0.7, 0.5, 2, 0);
    }
  }

  // 저공비행: 먼지/물보라 + 점수
  const low = player.groundDist < 8;
  if (low && G.state !== 'over') {
    const gh = Math.max(heightAt(player.pos.x, player.pos.z), SEA);
    const water = heightAt(player.pos.x, player.pos.z) < SEA;
    for (let i = 0; i < 3; i++) {
      const s = (Math.random() - 0.5) * 2;
      dust.emit(player.pos.x + s, gh + 0.3, player.pos.z + s, (Math.random() - 0.5) * 16, 4 + Math.random() * 6, (Math.random() - 0.5) * 16,
        water ? 0xe8fdff : (Math.random() < 0.5 ? 0xd9c79a : 0xa6dd73), water ? 2.2 : 1.8, 0.8, 2.5, 6);
    }
    if (playing) { G.score += 70 * dt * mult(); G.skimT = (G.skimT || 0) + dt; if (G.skimT > 2) { bumpCombo(); G.skimT = 0; } }
  } else G.skimT = 0;
  $('skim').classList.toggle('on', low && playing);

  if (playing) {
    // 장애물
    const k = world.collide(player.pos, 1.3);
    if (k) onObstacle(k);
    // 크리스탈/아치
    for (const c of world.nearChunks(player.pos)) {
      for (const cr of c.crystals) {
        if (cr.taken) continue;
        _v.set(cr.x - player.pos.x, cr.y - player.pos.y, cr.z - player.pos.z);
        if (_v.lengthSq() < 36) {
          cr.taken = true; player.energy = Math.min(100, player.energy + 12);
          sparks.burst(_v.set(cr.x, cr.y, cr.z), 24, 30, [0x7ffcff, 0xffffff], 1, 0.5);
          sfx.pickup(); addScore(30, _v, '', 'ring');
        }
      }
      for (const gt of c.gates) {
        if (gt.done) continue;
        _v.subVectors(player.pos, gt.c);
        const side = _v.dot(gt.D);
        if (gt.prev !== null && Math.sign(side) !== Math.sign(gt.prev) && Math.abs(side) < 30) {
          const u = _v.dot(gt.A), h = player.pos.y - gt.c.y;
          if (Math.abs(u) < gt.halfW && h > 0 && h < gt.top) {
            gt.done = true; G.arches++; bumpCombo();
            const at = gt.c.clone().add(new THREE.Vector3(0, 9, 0));
            shocks.spawn(at, 0xfff3c4, 22, 0.5, null, gt.D);
            sparks.burst(at, 50, 50, [0xffffff, 0xfff3c4], 1.4, 0.6);
            sfx.arch(); impact({ trauma: 0.2, fov: 8, flash: 0.1, flashColor: 0xfff6d8 });
            player.burst += 45;
            addScore(300, at, 'ARCH', 'gold');
          }
        }
        gt.prev = side;
      }
    }
    // 링
    for (const ev of rings.update(dt, player)) onRing(ev.ring, ev.hit);

    // 적 + 락온
    const diff = G.time / 30;
    enemies.update(dt, player, diff, orbs);
    let bestE = null, bestA = 0.42;
    for (const e of enemies.list) {
      _v.subVectors(e.pos, player.pos); const d = _v.length();
      if (d > 480 || d < 8) continue;
      const a = Math.acos(clamp(_v.dot(player.fwd) / d, -1, 1));
      if (a < bestA) { bestA = a; bestE = e; }
      // 몸통 박치기
      if (d < 7.5) {
        if (player.boosting) killEnemy(e, true);
        else { hitEnemy(e, 3, e.pos.clone(), player.fwd.clone()); hurt(18); }
        break;
      }
    }
    if (bestE !== G.lock) { G.lock = bestE; G.lockT = 0; if (bestE) sfx.lock(); }

    // 발사
    G.fireT -= dt;
    if (inp.fire && G.fireT <= 0) {
      G.fireT = 0.1; G.side = -G.side;
      const m = player.localPoint(G.side * 0.9, 0.6, -2, _u);
      let dir;
      if (G.lock) {
        const d = G.lock.pos.distanceTo(m);
        dir = G.lock.pos.clone().addScaledVector(G.lock.drift, d / 320).sub(m).normalize();
      } else dir = player.fwd.clone();
      bolts.fire(m, dir.multiplyScalar(300).addScaledVector(player.fwd, player.speed * 0.6), G.lock);
      sparks.burst(m, 5, 18, [0xbff8ff, 0xffffff], 0.8, 0.15);
      sfx.shoot();
      shake.add(0.02);
    }
  } else {
    $('skim').classList.remove('on');
  }

  // 투사체
  bolts.update(dt, 7);
  for (let i = bolts.list.length - 1; i >= 0; i--) {
    const b = bolts.list[i];
    sparks.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0x9ff5ff, 1.0, 0.18, 0, 0);
    for (const e of enemies.list) {
      if (!e.alive) continue;
      if (segDist(b.prev, b.p, e.pos) < 4.8) {
        _v.copy(b.v).normalize();
        hitEnemy(e, 1, e.pos.clone().addScaledVector(_v, -2.5), _v.clone());
        bolts.remove(i); break;
      }
    }
  }
  orbs.update(dt, 0);
  for (let i = orbs.list.length - 1; i >= 0; i--) {
    const o = orbs.list[i];
    if (Math.random() < 0.6) sparks.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0xff4d6d, 1.6, 0.25, 0, 0);
    if (playing && segDist(o.prev, o.p, player.pos) < 2.6) {
      orbs.remove(i);
      sparks.burst(player.pos, 40, 50, [0xff4d6d, 0xffffff], 1.4, 0.4);
      if (hurt(12)) impact({ stop: 0.07, trauma: 0.6, fov: -5 });
    }
  }

  if (playing) {
    G.comboT -= dt; if (G.comboT <= 0 && G.combo > 0) G.combo = 0;
    G.time += dt; G.dist += player.speed * dt;
  }
}

// ---------- 카메라 ----------
const camOff = new THREE.Vector3(0, 3, 10), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const aim = new THREE.Vector3();
function updateCamera(rdt) {
  const sk = clamp((player.speed - 80) / 85, 0, 1.3);
  _q.setFromEuler(_e.set(player.pitch * 0.55, player.yaw, 0, 'YXZ'));
  _v.set(0, 3.4 + sk * 0.4, 9 + sk * 2.6).applyQuaternion(_q);
  camOff.lerp(_v, 1 - Math.exp(-7 * rdt));
  camera.position.copy(player.pos).add(camOff).add(shake.off);
  const gh = Math.max(heightAt(camera.position.x, camera.position.z), SEA) + 1.2;
  if (camera.position.y < gh) camera.position.y = gh;
  aim.copy(player.pos).addScaledVector(player.fwd, 30).y += 3.2;
  camera.lookAt(aim);
  camera.rotateZ(player.roll * 0.3 + shake.rot);
  G.fovKick = damp(G.fovKick, 0, 5, rdt);
  camera.fov = clamp(68 + sk * 20 + G.fovKick, 50, 115);
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const hudEls = { score: $('score'), combo: $('combo'), streak: $('streak'), speed: $('speed'), dist: $('dist'), kills: $('kills'), time: $('time'), hp: $('hpBar').firstElementChild, en: $('enBar').firstElementChild, hpT: $('hpTxt'), enT: $('enTxt'), lock: $('lock'), cross: $('cross') };
function updateHud(rdt) {
  const W = innerWidth, H = innerHeight;
  popups.update(rdt, camera, W, H);
  if (G.state !== 'play') return;
  hudEls.score.textContent = Math.floor(G.score).toLocaleString();
  hudEls.combo.textContent = G.combo > 1 ? `COMBO ${G.combo}  ×${mult().toFixed(1)}` : '';
  hudEls.streak.textContent = G.streak > 1 ? `링 연속 ${G.streak}` : '';
  hudEls.speed.textContent = Math.round(player.speed * 3.6);
  hudEls.speed.style.color = player.boosting ? '#9ffcff' : '#fff';
  hudEls.dist.textContent = `${(G.dist / 1000).toFixed(2)} km`;
  hudEls.kills.textContent = `격파 ${G.kills}`;
  const s = Math.floor(G.time); hudEls.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  hudEls.hp.style.width = `${Math.max(0, player.hp)}%`; hudEls.hpT.textContent = Math.max(0, Math.ceil(player.hp));
  hudEls.en.style.width = `${player.energy}%`; hudEls.enT.textContent = Math.floor(player.energy);
  _v.copy(player.pos).addScaledVector(player.fwd, 90).project(camera);
  hudEls.cross.style.left = `${(_v.x * 0.5 + 0.5) * W}px`; hudEls.cross.style.top = `${(-_v.y * 0.5 + 0.5) * H}px`;
  if (G.lock) {
    G.lockT += rdt;
    _v.copy(G.lock.pos).project(camera);
    const sc = Math.max(1, 2.2 - G.lockT * 8);
    hudEls.lock.style.display = _v.z < 1 ? 'block' : 'none';
    hudEls.lock.style.left = `${(_v.x * 0.5 + 0.5) * W}px`; hudEls.lock.style.top = `${(-_v.y * 0.5 + 0.5) * H}px`;
    hudEls.lock.style.transform = `scale(${sc}) rotate(${G.lockT * 90}deg)`;
  } else hudEls.lock.style.display = 'none';
}

function showOver() {
  $('hud').classList.add('hidden');
  $('stats').innerHTML = `<div class="big">${Math.floor(G.score).toLocaleString()}</div>
    <div>최고 기록 ${Math.floor(best).toLocaleString()}</div>
    <div>비행 ${(G.dist / 1000).toFixed(2)} km · ${Math.floor(G.time)}초</div>
    <div>격파 ${G.kills} · 링 ${G.ringsHit} · 아치 ${G.arches} · 박살 ${G.smashes} · 최대콤보 ${G.maxCombo}</div>`;
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

  if (dt > 0) simulate(dt, G.state === 'play' ? input.read() : autopilot());
  player.syncVisual(dt);
  world.update(dt, player.pos, player.fwd);
  world.animate(G.t);
  sparks.update(dt); dust.update(dt); debris.update(dt); shocks.update(dt, camera);
  shake.update(rdt);
  updateCamera(rdt);

  const sk = clamp((player.speed - 70) / 90, 0, 1.4);
  const boostK = player.boosting ? 1 : 0;
  const lowK = player.groundDist < 8 ? 0.35 : 0;
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

// 디버그/검증용 훅
window.__game = { G, player, enemies, rings, world, orbs, startGame };
