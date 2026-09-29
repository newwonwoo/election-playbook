// WebAudio 합성 사운드 (외부 파일 없음)
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 바람 루프
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.7; this.windF.frequency.value = 400;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); src.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  wind(speed, boost, low) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windF.frequency.setTargetAtTime(250 + speed * 7 + boost * 500, t, 0.1);
    this.windG.gain.setTargetAtTime(Math.min(0.5, 0.05 + speed / 500 + boost * 0.12 + low * 0.1), t, 0.1);
  }
  env(node, t, a, peak, dec) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.005, vol, dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(freq, dur, vol, type = 'lowpass', q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.2), t + dur); f.Q.value = q;
    const g = this.ctx.createGain(); this.env(g, t, 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  shoot() { this.tone('square', 1400, 500, 0.07, 0.05); this.noiseHit(5000, 0.05, 0.05, 'highpass'); }
  hit(crit) {
    if (crit) { this.tone('sine', 200, 50, 0.2, 0.8); this.noiseHit(3500, 0.16, 0.5); this.tone('square', 1300, 400, 0.08, 0.1); return; }
    this.tone('sine', 240, 80, 0.08, 0.35); this.noiseHit(4000, 0.06, 0.18);
  }
  kill() { this.tone('sine', 120, 30, 0.5, 0.9); this.noiseHit(2500, 0.6, 0.7); this.noiseHit(8000, 0.2, 0.25, 'highpass'); this.tone('sawtooth', 600, 80, 0.3, 0.12); }
  ring(streak, gold) {
    const base = 660 * Math.pow(2, Math.min(streak, 12) / 12);
    this.tone('sine', base, base, 0.18, 0.25); this.tone('triangle', base * 1.5, base * 1.5, 0.22, 0.14, 0.06);
    if (gold) { this.tone('triangle', base * 2, base * 2, 0.35, 0.18, 0.12); this.tone('sine', base * 3, base * 3, 0.4, 0.1, 0.18); }
    this.noiseHit(6000, 0.25, 0.12, 'highpass');
  }
  pickup() { this.tone('triangle', 1600, 2400, 0.12, 0.15); }
  boost() { this.noiseHit(1800, 0.7, 0.4, 'bandpass', 2); this.tone('sawtooth', 90, 260, 0.5, 0.12); }
  crash(big) { this.tone('sine', 90, 30, big ? 0.6 : 0.35, 1); this.noiseHit(1200, big ? 0.6 : 0.3, 0.8); }
  smash() { this.noiseHit(2200, 0.35, 0.6); this.tone('sine', 140, 45, 0.25, 0.6); }
  hurt() { this.tone('square', 220, 90, 0.25, 0.25); this.noiseHit(1500, 0.3, 0.5); }
  arch() { [0, 4, 7, 12].forEach((s, i) => this.tone('triangle', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.2, 0.15, i * 0.05)); }
  lock() { this.tone('square', 1500, 1500, 0.05, 0.08); this.tone('square', 2000, 2000, 0.07, 0.08, 0.07); }
}
