// On-screen controls for touchscreens: a floating joystick on the left half (push past the
// ring to sprint), drag anywhere on the right half to look, and action buttons. Everything
// writes into Input, so the player code doesn't know which device is in use.

const RADIUS = 56; // joystick travel in px
const LOOK_GAIN = 1.25; // touch drag px -> mouse px

const BUTTONS = [
  { id: 'fire', label: 'FIRE' },
  { id: 'aim', label: 'AIM' },
  { id: 'reload', label: 'R', key: 'KeyR' },
  { id: 'roll', label: 'ROLL', key: 'Space' },
  { id: 'melee', label: 'BAT', key: 'KeyF' },
  { id: 'swap', label: 'SWAP', key: 'Tab' },
];

export class TouchControls {
  constructor(input, { onPause }) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.id = 'touch';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="zone left"></div>
      <div class="zone right"></div>
      <div class="stick hidden"><div class="ring"></div><div class="knob"></div></div>
      ${BUTTONS.map((b) => `<button class="tbtn ${b.id}" data-t="${b.id}" tabindex="-1">${b.label}</button>`).join('')}
      <button class="tbtn pause" data-t="pause" tabindex="-1" aria-label="Pause">II</button>`;
    document.getElementById('app').appendChild(this.el);
    this.stick = this.el.querySelector('.stick');
    this.knob = this.el.querySelector('.knob');
    this.moveId = null;
    this.looks = new Map(); // pointerId -> last {x, y}

    const left = this.el.querySelector('.zone.left');
    const right = this.el.querySelector('.zone.right');
    left.addEventListener('pointerdown', (e) => this.stickStart(e));
    right.addEventListener('pointerdown', (e) => this.lookStart(e, right));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this.el.addEventListener(t, (e) => this.end(e));

    for (const btn of this.el.querySelectorAll('.tbtn')) {
      const def = BUTTONS.find((b) => b.id === btn.dataset.t);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('on');
        const id = btn.dataset.t;
        if (id === 'pause') return onPause();
        if (id === 'fire') {
          input.touch.fire = true;
          input.touch.firePressed = true;
          this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, fire: true }); // drag the fire button to aim
        } else if (id === 'aim') {
          input.touch.aim = !input.touch.aim;
          btn.classList.toggle('active', input.touch.aim);
        } else if (def?.key) {
          input.justPressed.add(def.key);
        }
      });
      const release = () => {
        btn.classList.remove('on');
        if (btn.dataset.t === 'fire') input.touch.fire = false;
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    }
    // No long-press menus / text selection on the controls.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
    if (!v) this.clear();
  }

  clear() {
    this.moveId = null;
    this.looks.clear();
    this.stick.classList.add('hidden');
    Object.assign(this.input.touch, { move: { x: 0, z: 0 }, fire: false, sprint: false });
    this.el.querySelectorAll('.tbtn').forEach((b) => b.classList.remove('on'));
  }

  resetAim() {
    this.input.touch.aim = false;
    this.el.querySelector('.tbtn.aim').classList.remove('active');
  }

  stickStart(e) {
    if (this.moveId !== null) return;
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    this.moveId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.stick.classList.remove('hidden');
    this.setStick(0, 0);
  }

  lookStart(e, zone) {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  move(e) {
    if (e.pointerId === this.moveId) {
      this.setStick(e.clientX - this.origin.x, e.clientY - this.origin.y);
      return;
    }
    const l = this.looks.get(e.pointerId);
    if (!l) return;
    this.input.addTouchLook((e.clientX - l.x) * LOOK_GAIN, (e.clientY - l.y) * LOOK_GAIN);
    l.x = e.clientX;
    l.y = e.clientY;
  }

  end(e) {
    if (e.pointerId === this.moveId) {
      this.moveId = null;
      this.stick.classList.add('hidden');
      this.input.touch.move = { x: 0, z: 0 };
      this.input.touch.sprint = false;
    }
    const l = this.looks.get(e.pointerId);
    if (l?.fire) this.input.touch.fire = false;
    this.looks.delete(e.pointerId);
  }

  setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const k = len > RADIUS ? RADIUS / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const dead = len < 8 ? 0 : 1;
    this.input.touch.move = { x: (dx * k / RADIUS) * dead, z: (-dy * k / RADIUS) * dead };
    // Dragging well past the ring sprints.
    this.input.touch.sprint = len > RADIUS * 1.45;
    this.stick.classList.toggle('sprint', this.input.touch.sprint);
  }
}

/** True on devices whose primary pointer is a finger. */
export function prefersTouch() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
}
