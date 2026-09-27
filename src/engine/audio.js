// All sound is synthesized with WebAudio — the asset packs ship no audio.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.listener = { x: 0, z: 0, rx: 1, rz: 0 };
    this.music = null;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Listener position and its right-hand direction on the ground plane. */
  setListener(x, z, rx, rz) {
    Object.assign(this.listener, { x, z, rx, rz });
  }

  // Output node for a sound at a world position (distance falloff + stereo pan), or centered.
  out(gain, pos) {
    const g = this.ctx.createGain();
    let vol = gain;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      vol *= 1 / (1 + dist * 0.12);
      const right = dx * this.listener.rx + dz * this.listener.rz;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, dist > 0.01 ? right / dist : 0)) * 0.8;
      g.connect(pan).connect(this.master);
    } else {
      g.connect(this.master);
    }
    g.gain.value = vol;
    return g;
  }

  noiseBurst({ dur = 0.2, gain = 0.5, type = 'lowpass', freq = 1000, q = 1, endFreq, pos, attack = 0.002 }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(this.out(gain, pos));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, endFreq, dur = 0.2, gain = 0.3, type = 'sine', pos, delay = 0, attack = 0.005 }) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env).connect(this.out(gain, pos));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, pos) {
    if (!this.ctx) return;
    const s = SOUNDS[name];
    if (s) s(this, pos);
  }

  startMusic(mood = 0) {
    if (!this.ctx) return;
    this.stopMusic();
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16, t + 3);
    out.connect(this.master);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380 + mood * 60;
    lp.Q.value = 6;
    lp.connect(out);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07 + mood * 0.04;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    const roots = [55, 49, 51.9, 46.2, 43.6];
    const root = roots[mood % roots.length];
    const oscs = [1, 1.498, 2.004, 0.5].map((m, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 3 ? 'sine' : 'sawtooth';
      o.frequency.value = root * m;
      o.detune.value = (i - 1.5) * 7;
      o.connect(lp);
      return o;
    });
    // Heartbeat pulse, faster for later levels.
    const pulse = this.ctx.createOscillator();
    const pulseGain = this.ctx.createGain();
    pulse.type = 'sine';
    pulse.frequency.value = root;
    pulseGain.gain.value = 0;
    pulse.connect(pulseGain).connect(out);
    const beat = 60 / (58 + mood * 14);
    for (let i = 0; i < 2000; i++) {
      const bt = t + 2 + i * beat;
      pulseGain.gain.setValueAtTime(0, bt);
      pulseGain.gain.linearRampToValueAtTime(0.9, bt + 0.02);
      pulseGain.gain.exponentialRampToValueAtTime(0.001, bt + 0.25);
    }
    [...oscs, lfo, pulse].forEach((o) => o.start(t));
    this.music = { out, nodes: [...oscs, lfo, pulse] };
  }

  stopMusic() {
    if (!this.music) return;
    const { out, nodes } = this.music;
    const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    nodes.forEach((n) => n.stop(t + 1.1));
    this.music = null;
  }
}

const SOUNDS = {
  pistol: (a) => {
    a.noiseBurst({ dur: 0.18, gain: 0.9, freq: 2600, endFreq: 300 });
    a.tone({ freq: 160, endFreq: 50, dur: 0.12, gain: 0.7 });
  },
  shotgun: (a) => {
    a.noiseBurst({ dur: 0.45, gain: 1.2, freq: 1800, endFreq: 120 });
    a.tone({ freq: 110, endFreq: 35, dur: 0.3, gain: 1 });
    a.tone({ freq: 900, dur: 0.05, gain: 0.25, type: 'square', delay: 0.35 });
    a.tone({ freq: 600, dur: 0.05, gain: 0.25, type: 'square', delay: 0.45 });
  },
  rifle: (a) => {
    a.noiseBurst({ dur: 0.14, gain: 0.9, freq: 3800, endFreq: 500 });
    a.tone({ freq: 190, endFreq: 60, dur: 0.1, gain: 0.6 });
  },
  enemyShot: (a, pos) => {
    a.noiseBurst({ dur: 0.16, gain: 0.9, freq: 2200, endFreq: 400, pos });
    a.tone({ freq: 140, endFreq: 60, dur: 0.1, gain: 0.5, pos });
  },
  empty: (a) => a.tone({ freq: 1500, dur: 0.03, gain: 0.2, type: 'square' }),
  reload: (a) => {
    a.tone({ freq: 700, dur: 0.04, gain: 0.25, type: 'square' });
    a.tone({ freq: 480, dur: 0.05, gain: 0.25, type: 'square', delay: 0.25 });
    a.noiseBurst({ dur: 0.08, gain: 0.3, type: 'bandpass', freq: 3000, q: 3 });
  },
  reloadDone: (a) => a.tone({ freq: 1100, dur: 0.05, gain: 0.25, type: 'square' }),
  swing: (a) => a.noiseBurst({ dur: 0.22, gain: 0.35, type: 'bandpass', freq: 600, endFreq: 2400, q: 2, attack: 0.08 }),
  bonk: (a, pos) => {
    a.tone({ freq: 220, endFreq: 90, dur: 0.15, gain: 0.8, type: 'triangle', pos });
    a.noiseBurst({ dur: 0.1, gain: 0.5, freq: 900, pos });
  },
  hit: (a, pos) => a.noiseBurst({ dur: 0.09, gain: 0.5, freq: 700, endFreq: 150, pos }),
  headshot: (a, pos) => {
    a.noiseBurst({ dur: 0.12, gain: 0.6, freq: 1200, endFreq: 200, pos });
    a.tone({ freq: 1800, dur: 0.06, gain: 0.2, type: 'square' });
  },
  ricochet: (a, pos) => a.tone({ freq: 2800 + Math.random() * 1500, endFreq: 1200, dur: 0.12, gain: 0.08, type: 'triangle', pos }),
  hurt: (a) => {
    a.tone({ freq: 180, endFreq: 70, dur: 0.25, gain: 0.6, type: 'sawtooth' });
    a.noiseBurst({ dur: 0.15, gain: 0.5, freq: 500 });
  },
  growl: (a, pos) => {
    const f = 70 + Math.random() * 40;
    a.tone({ freq: f, endFreq: f * 0.6, dur: 0.9, gain: 0.5, type: 'sawtooth', pos, attack: 0.1 });
    a.tone({ freq: f * 1.5, endFreq: f * 0.8, dur: 0.8, gain: 0.3, type: 'sawtooth', pos, attack: 0.15 });
    a.noiseBurst({ dur: 0.8, gain: 0.25, freq: 400, pos, attack: 0.1 });
  },
  death: (a, pos) => {
    a.tone({ freq: 150, endFreq: 40, dur: 0.7, gain: 0.5, type: 'sawtooth', pos, attack: 0.02 });
    a.noiseBurst({ dur: 0.4, gain: 0.4, freq: 800, endFreq: 100, pos });
  },
  roar: (a, pos) => {
    for (let i = 0; i < 3; i++) a.tone({ freq: 60 + i * 23, endFreq: 38, dur: 2, gain: 0.6, type: 'sawtooth', pos, attack: 0.3 });
    a.noiseBurst({ dur: 2, gain: 0.6, freq: 500, endFreq: 150, pos, attack: 0.3 });
  },
  slam: (a, pos) => {
    a.tone({ freq: 80, endFreq: 25, dur: 0.8, gain: 1.2, pos });
    a.noiseBurst({ dur: 0.7, gain: 1, freq: 600, endFreq: 60, pos });
  },
  pickup: (a) => {
    a.tone({ freq: 660, dur: 0.1, gain: 0.3, type: 'triangle' });
    a.tone({ freq: 990, dur: 0.18, gain: 0.3, type: 'triangle', delay: 0.08 });
  },
  weapon: (a) => {
    a.tone({ freq: 523, dur: 0.12, gain: 0.3, type: 'triangle' });
    a.tone({ freq: 659, dur: 0.12, gain: 0.3, type: 'triangle', delay: 0.1 });
    a.tone({ freq: 784, dur: 0.25, gain: 0.3, type: 'triangle', delay: 0.2 });
  },
  wave: (a) => {
    a.tone({ freq: 98, dur: 1.4, gain: 0.5, type: 'sawtooth', attack: 0.05 });
    a.tone({ freq: 146.8, dur: 1.4, gain: 0.35, type: 'sawtooth', attack: 0.05 });
    a.noiseBurst({ dur: 1.2, gain: 0.3, freq: 300 });
  },
  clear: (a) => [392, 523, 659, 784].forEach((f, i) => a.tone({ freq: f, dur: 0.4, gain: 0.25, type: 'triangle', delay: i * 0.12 })),
  dodge: (a) => a.noiseBurst({ dur: 0.25, gain: 0.3, freq: 400, endFreq: 1500, attack: 0.05 }),
  step: (a) => a.noiseBurst({ dur: 0.06, gain: 0.08, freq: 500 }),
  switch: (a) => a.tone({ freq: 900, dur: 0.04, gain: 0.2, type: 'square' }),
};
