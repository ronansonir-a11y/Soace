/** Процедурный звук (WebAudio): гул реактора, лазеры, взрывы. CC0-ассеты не нужны. */
export class SoundSynth {
  private ctx: AudioContext | null = null; private engineOsc: OscillatorNode | null = null; private engineGain: GainNode | null = null;
  init(): void {
    if (this.ctx) return;
    try { this.ctx = new AudioContext(); } catch { return; }
    const c = this.ctx; this.engineOsc = c.createOscillator(); this.engineGain = c.createGain();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 42; this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(f).connect(this.engineGain).connect(c.destination); this.engineOsc.start();
  }
  setEngine(thrust01: number): void { if (this.ctx && this.engineOsc && this.engineGain) { this.engineOsc.frequency.value = 38 + thrust01 * 55; this.engineGain.gain.value = 0.015 + thrust01 * 0.05; } }
  private blip(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  laser(): void { this.blip(1400, 220, 0.14, 'square', 0.06); }
  cannon(): void { this.blip(300, 60, 0.12, 'sawtooth', 0.09); }
  ping(): void { this.blip(880, 870, 0.25, 'sine', 0.05); }
  explosion(): void {
    if (!this.ctx) return; const c = this.ctx, len = c.sampleRate * 0.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = c.createGain(); g.gain.value = 0.25; src.connect(f).connect(g).connect(c.destination); src.start();
  }
  speak(text: string): void { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.05; speechSynthesis.speak(u); } catch { /* TTS недоступен */ } }
}
