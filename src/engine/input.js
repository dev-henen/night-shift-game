// Keyboard + pointer-locked mouse. Game code polls `down()` / `pressed()` once per frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.sensitivity = 1;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
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

  /** Resolves true once the pointer is locked, false if the browser refused. */
  async lock() {
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

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  axis() {
    const x = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    const z = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    return { x, z };
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.justPressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
  }
}
