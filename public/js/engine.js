'use strict';

/* ============================================================
   MotionTracker - reads the accelerometer and reports how close
   the player is to the current "hold still" threshold.
   (Same core idea as the original game.)
   ============================================================ */
export class MotionTracker {
  constructor() {
    this.threshold = 10000;
    this.running = false;
    this.performer = null;
    window.addEventListener('devicemotion', (e) => {
      if (!this.running) return;
      const x = e.acceleration?.x || 0;
      const y = e.acceleration?.y || 0;
      const z = e.acceleration?.z || 0;
      const power = x * x + y * y + z * z;
      const strength = power / this.threshold;
      if (strength > 1) {
        this.performer(1, true);
        this.running = false;
      } else {
        this.performer(strength, false);
      }
    });
  }

  setThreshold(threshold) {
    this.threshold = threshold;
  }

  play(performer) {
    this.performer = performer;
    this.running = true;
  }

  stop() {
    this.running = false;
  }
}

/**
 * iOS 13+ requires an explicit, user-gesture-triggered permission grant
 * for motion events. Must be called directly inside a click handler.
 */
export async function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      return result === 'granted';
    } catch (err) {
      console.error('Motion permission request failed', err);
      return false;
    }
  }
  return true; // not required on this platform
}

/* ============================================================
   Warning - full-screen flash + vibration as danger rises.
   ============================================================ */
export class Warning {
  constructor() {
    this.level = 0;
    this.running = false;
    this.state = false;
    this.lastChange = 0;
    this.threshold = 0.3;
    this.canVibrate = typeof window.navigator.vibrate === 'function';
    this.bg = '#000';
    this.fg = '#fff';
    this.onFlash = null; // (state:boolean) => void
  }

  play(bg, fg) {
    this.bg = bg;
    this.fg = fg;
    this.level = 0;
    this.lastChange = 0;
    this.running = true;
    this._light(false);
  }

  stop() {
    this._light(false);
    this.level = 0;
    this.running = false;
  }

  setLevel(level) {
    this.level = level;
    if (level <= this.threshold) this._light(false);
  }

  _light(state) {
    this.state = state;
    if (this.onFlash) this.onFlash(state, state ? '#fff' : this.bg, state ? '#111' : this.fg);
    if (state && this.canVibrate) window.navigator.vibrate(80);
  }

  tick() {
    if (!this.running || this.level <= this.threshold) return;
    const nextBlinkAt = this.lastChange + (1 - this.level) * 200 + 50;
    if (Date.now() > nextBlinkAt) {
      this.lastChange = Date.now();
      this._light(!this.state);
    }
  }
}

/* ============================================================
   Track - plays back a sequence of timed rate/threshold changes
   against the elapsed time of the current round.
   ============================================================ */
export class Track {
  constructor() {
    this.track = [];
    this.head = 0;
    this.running = false;
    this.startTime = 0;
  }

  plug(track) {
    this.track = track || [];
    this.head = 0;
    this.running = false;
  }

  play() {
    this.startTime = Date.now();
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  tick(performer) {
    if (!this.running) return;
    const time = Date.now() - this.startTime;
    while (this.track[this.head] && this.track[this.head].time < time) {
      performer(this.track[this.head]);
      this.head++;
    }
  }
}

/* ============================================================
   SynthAudio - procedurally generated tension drone + stings,
   so the game needs no external music/sound-effect files at all.
   Drop real files in /static and swap this out if you'd rather
   ship your own soundtrack (see README).
   ============================================================ */
export class SynthAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.droneNodes = null;
    this.rate = 1;
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startDrone(volume = 1) {
    this.stopDrone();
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = volume * 0.35;
    gain.connect(this.master);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 110.5; // slight detune for tension beating

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    osc1.start();
    osc2.start();

    // Rhythmic pulse via an LFO on the gain, speed tied to this.rate.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2 * this.rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain.gain.value * 0.6;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();

    this.droneNodes = { gain, osc1, osc2, filter, lfo, lfoGain, volume };
  }

  setVolume(volume) {
    if (!this.droneNodes) return;
    this.droneNodes.volume = volume;
    this.droneNodes.gain.gain.setTargetAtTime(volume * 0.35, this.ctx.currentTime, 0.05);
  }

  setRate(rate) {
    this.rate = rate;
    if (!this.droneNodes) return;
    const t = this.ctx.currentTime;
    this.droneNodes.osc1.frequency.setTargetAtTime(55 * rate, t, 0.3);
    this.droneNodes.osc2.frequency.setTargetAtTime(110.5 * rate, t, 0.3);
    this.droneNodes.lfo.frequency.setTargetAtTime(2 * rate, t, 0.3);
  }

  stopDrone() {
    if (!this.droneNodes) return;
    const { osc1, osc2, lfo, gain } = this.droneNodes;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      [osc1, osc2, lfo].forEach((n) => {
        try {
          n.stop();
        } catch (e) {
          /* already stopped */
        }
      });
    }, 200);
    this.droneNodes = null;
  }

  sting(type) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(this.master);

    if (type === 'win') {
      // Bright ascending arpeggio.
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        const start = now + i * 0.11;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.4, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        osc.connect(g);
        g.connect(this.master);
        osc.start(start);
        osc.stop(start + 0.5);
      });
    } else {
      // Low descending thud for elimination.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  }
}
