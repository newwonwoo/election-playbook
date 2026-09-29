// 키보드 / 마우스 / 터치 입력 통합
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, on: false };
    this.mouseFire = false; this.mouseBoost = false;
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchFire = false; this.touchBoost = false;
    this.mouseSteer = true;

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseFire = this.mouseBoost = false; });
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = (e.clientY / innerHeight) * 2 - 1; this.mouse.on = true;
    });
    canvas.addEventListener('mouseleave', () => { this.mouse.on = false; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseFire = true; if (e.button === 2) this.mouseBoost = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseFire = false; if (e.button === 2) this.mouseBoost = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 터치: 화면 왼쪽 = 가상 조이스틱
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.id === null && t.clientX < innerWidth * 0.6) {
          this.touch.id = t.identifier; this.touch.ox = t.clientX; this.touch.oy = t.clientY; this.touch.x = this.touch.y = 0;
          stick.style.display = 'block'; stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)';
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.touch.id) {
        let dx = (t.clientX - this.touch.ox) / 55, dy = (t.clientY - this.touch.oy) / 55;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.touch.x = dx; this.touch.y = dy;
        knob.style.transform = `translate(calc(-50% + ${dx * 45}px), calc(-50% + ${dy * 45}px))`;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.touch.id) { this.touch.id = null; this.touch.x = this.touch.y = 0; stick.style.display = 'none'; } };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
    const hold = (id, key) => {
      const el = document.getElementById(id);
      const on = (e) => { this[key] = true; el.classList.add('on'); e.preventDefault(); };
      const off = (e) => { this[key] = false; el.classList.remove('on'); e.preventDefault(); };
      el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
    };
    hold('btnFire', 'touchFire'); hold('btnBoost', 'touchBoost');
  }

  read() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.touch.id !== null) { x = this.touch.x; y = -this.touch.y; }
    else if (x === 0 && y === 0 && this.mouseSteer && this.mouse.on) {
      const dz = (v) => { const a = Math.abs(v); return a < 0.07 ? 0 : Math.sign(v) * Math.min(1, (a - 0.07) * 1.9); };
      x = dz(this.mouse.x); y = -dz(this.mouse.y * 1.2);
    }
    return {
      x, y,
      boost: k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseBoost || this.touchBoost,
      fire: k.has('Space') || k.has('KeyJ') || this.mouseFire || this.touchFire,
    };
  }
}
