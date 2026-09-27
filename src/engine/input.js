// Keyboard, pointer-locked mouse and touch controls, merged into one set of actions.
// Game code polls the action helpers (moveAxis, lookAxis, fireHeld, ...) once per frame.

// Keyboard bindings. Movement works with WASD or the arrow keys; the arrow keys'
// left/right turn the camera so the game is fully playable without a mouse.
export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft'],
  turnRight: ['ArrowRight'],
  lookUp: ['PageUp', 'KeyI'],
  lookDown: ['PageDown', 'KeyK'],
  fire: ['KeyJ', 'Enter', 'NumpadEnter'],
  aim: ['KeyL', 'ShiftRight'],
  sprint: ['ShiftLeft'],
  roll: ['Space'],
  melee: ['KeyF', 'KeyV'],
  reload: ['KeyR'],
  nextWeapon: ['Tab', 'KeyE'],
  lastWeapon: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
};
// Keys whose browser default (scrolling, focus moves) must be suppressed during play.
const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.sensitivity = 1;
    this.active = false; // true while a level is being played (enables key blocking)
    // Written by the on-screen touch controls.
    this.touch = { move: { x: 0, z: 0 }, fire: false, firePressed: false, aim: false, sprint: false };
    // Which device last moved the camera: 'mouse' | 'keys' | 'touch' (aim assist uses this).
    this.lastLook = 'mouse';

    addEventListener('keydown', (e) => {
      if (this.active && BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
      if (e.movementX || e.movementY) this.lastLook = 'mouse';
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  /** Resolves true once the pointer is locked, false if the browser refused (or has no mouse lock). */
  async lock() {
    if (!this.canvas.requestPointerLock) return false;
    try {
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
      return true;
    } catch {
      // Some browsers reject unadjustedMovement, and Chrome refuses a re-lock for a moment
      // after the user pressed Esc; try a plain request once.
      try {
        await this.canvas.requestPointerLock();
        return true;
      } catch {
        return false;
      }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Drops all held keys/buttons (used when play starts or resumes, so nothing "sticks"). */
  reset() {
    this.keys.clear();
    this.justPressed.clear();
    this.mouse.left = this.mouse.right = this.mouse.leftPressed = false;
    this.touch.fire = this.touch.firePressed = false;
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  action(name) { return KEYS[name].some((k) => this.keys.has(k)); }
  actionPressed(name) { return KEYS[name].some((k) => this.justPressed.has(k)); }

  /** Movement: x = strafe right, z = forward, each -1..1 (keys and touch joystick combined). */
  moveAxis() {
    let x = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0) + this.touch.move.x;
    let z = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0) + this.touch.move.z;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z };
  }

  /** Keyboard look rates: x = turn right, y = look up, each -1..1. */
  keyLook() {
    const x = (this.action('turnRight') ? 1 : 0) - (this.action('turnLeft') ? 1 : 0);
    const y = (this.action('lookUp') ? 1 : 0) - (this.action('lookDown') ? 1 : 0);
    if (x || y) this.lastLook = 'keys';
    return { x, y };
  }

  addTouchLook(dx, dy) {
    this.mouse.dx += dx;
    this.mouse.dy += dy;
    this.lastLook = 'touch';
  }

  fireHeld() { return this.mouse.left || this.touch.fire || this.action('fire'); }
  firePressed() { return this.mouse.leftPressed || this.touch.firePressed || this.actionPressed('fire'); }
  aimHeld() { return this.mouse.right || this.touch.aim || this.action('aim'); }
  sprintHeld() { return this.touch.sprint || this.action('sprint'); }

  /** Call at the end of each frame. */
  endFrame() {
    this.justPressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.touch.firePressed = false;
    this.mouse.wheel = 0;
  }
}
