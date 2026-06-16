/**
 * Fully procedural Web Audio engine — all SFX and ambience synthesized at
 * runtime (no external audio assets / API keys required). A shared convolver
 * reverb gives the board a sense of space.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;
  private ambientGain!: GainNode;
  private ambientNodes: AudioNode[] = [];
  private _muted = false;
  private _volume = 0.8;
  private started = false;

  /** Must be called from a user gesture to satisfy autoplay policies. */
  resume(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private init(): void {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._volume;
    this.master.connect(this.ctx.destination);

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8, 2.6);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.connect(this.master);
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = rate * duration;
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  private route(node: AudioNode, wet = 0.5): void {
    node.connect(this.master);
    const send = this.ctx!.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(this.reverb);
  }

  private tone(
    freq: number,
    t0: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    wet = 0.4,
    glideTo?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    this.route(gain, wet);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(
    t0: number,
    dur: number,
    peak: number,
    filterType: BiquadFilterType,
    freq: number,
    wet = 0.3,
  ): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(gain);
    this.route(gain, wet);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- Public SFX ---

  move(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.noise(t, 0.09, 0.5, 'bandpass', 1800, 0.18);
    this.tone(150, t, 0.12, 'triangle', 0.32, 0.2, 90);
  }

  capture(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.noise(t, 0.16, 0.7, 'bandpass', 1100, 0.3);
    this.noise(t, 0.05, 0.5, 'highpass', 4000, 0.2);
    this.tone(110, t, 0.2, 'sawtooth', 0.3, 0.3, 60);
  }

  select(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(880, t, 0.06, 'sine', 0.18, 0.25);
  }

  /** Signature transmutation shimmer — bright bell + ascending sparkle. */
  morph(): void {
    if (!this.ready()) return;
    const t = this.now();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.045, 0.5 - i * 0.04, 'sine', 0.16, 0.6);
      this.tone(f * 2, t + i * 0.045, 0.3, 'sine', 0.05, 0.6);
    });
    this.noise(t + 0.02, 0.5, 0.18, 'highpass', 6000, 0.5);
    this.tone(196, t, 0.6, 'sine', 0.12, 0.4, 392);
  }

  check(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.tone(440, t, 0.18, 'square', 0.18, 0.3);
    this.tone(415, t + 0.16, 0.28, 'square', 0.2, 0.3);
  }

  castle(): void {
    if (!this.ready()) return;
    const t = this.now();
    this.noise(t, 0.09, 0.45, 'bandpass', 1600, 0.2);
    this.noise(t + 0.12, 0.09, 0.45, 'bandpass', 1400, 0.2);
  }

  win(): void {
    this.chord([523.25, 659.25, 783.99, 1046.5], 'win');
  }
  lose(): void {
    this.chord([392, 466.16, 311.13], 'lose');
  }
  start(): void {
    this.chord([261.63, 392, 523.25], 'win');
  }

  private chord(freqs: number[], kind: 'win' | 'lose'): void {
    if (!this.ready()) return;
    const t = this.now();
    freqs.forEach((f, i) => {
      const delay = kind === 'win' ? i * 0.09 : i * 0.14;
      this.tone(f, t + delay, 1.1, 'sine', 0.16, 0.6);
      this.tone(f, t + delay, 1.1, 'triangle', 0.06, 0.6);
    });
  }

  click(): void {
    if (!this.ready()) return;
    this.tone(660, this.now(), 0.04, 'sine', 0.12, 0.1);
  }
  hover(): void {
    if (!this.ready()) return;
    this.tone(1200, this.now(), 0.03, 'sine', 0.05, 0.05);
  }

  /** Low evolving ambient pad; fades in/out. */
  setAmbient(on: boolean): void {
    if (!this.ctx) {
      if (on) this.resume();
      if (!this.ctx) return;
    }
    const ctx = this.ctx!;
    if (on && !this.started) {
      this.started = true;
      const freqs = [55, 82.4, 110, 164.8];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + i * 0.017;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = f * 0.004;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.05 / (i + 1);
        osc.connect(g);
        g.connect(this.ambientGain);
        osc.start();
        lfo.start();
        this.ambientNodes.push(osc, lfo);
      });
    }
    const target = on && !this._muted ? 0.5 : 0;
    this.ambientGain.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.ctx)
      this.master.gain.setTargetAtTime(
        m ? 0 : this._volume,
        this.ctx.currentTime,
        0.05,
      );
  }
  get muted(): boolean {
    return this._muted;
  }

  setVolume(v: number): void {
    this._volume = v;
    if (this.ctx && !this._muted)
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this._muted;
  }
}
