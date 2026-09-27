/**
 * Synthesized Web Audio API Alarm Sound Manager
 * Gentle retail-friendly chime — a soft single sine pulse every 6 seconds.
 * Provides reliable, zero-latency, cross-platform audio alerts for retail environments.
 * Specifically optimized for iOS Safari, mobile Chrome/Android, and mobile WebViews with:
 * - Resilient user-gesture unlocking
 * - iOS silent-buffer audio pipeline warmup (required by iOS WebKit)
 * - Autoplay block detection and reactive state subscription
 * - Dual-engine fallback via synthesized in-memory WAV chime
 */

function createBeepWavDataUri(freq: number = 520, durationMs: number = 600): string {
  if (typeof window === 'undefined') return ''
  try {
    const sampleRate = 44100
    const numSamples = Math.floor((sampleRate * durationMs) / 1000)
    const buffer = new ArrayBuffer(44 + numSamples * 2)
    const view = new DataView(buffer)

    // RIFF header
    view.setUint32(0, 0x52494646, false)
    view.setUint32(4, 36 + numSamples * 2, true)
    view.setUint32(8, 0x57415645, false)
    view.setUint32(12, 0x666d7420, false)
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    view.setUint32(36, 0x64617461, false)
    view.setUint32(40, numSamples * 2, true)

    // Sine wave with smooth bell-curve envelope (attack + long decay)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const progress = i / numSamples
      // Quick attack (first 5%), slow exponential decay
      const attack = Math.min(1, progress / 0.05)
      const decay = Math.exp(-progress * 5)
      const envelope = attack * decay
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.45 * 32767
      view.setInt16(44 + i * 2, Math.floor(sample), true)
    }

    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return 'data:audio/wav;base64,' + btoa(binary)
  } catch {
    return ''
  }
}

class AlarmSoundManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private intervalId: number | null = null
  private isAlarmPlaying: boolean = false
  private activeOscillators: OscillatorNode[] = []
  private fallbackAudio: HTMLAudioElement | null = null
  private subscribers: Set<() => void> = new Set()
  private listenersAttached: boolean = false

  constructor() {
    this.attachGlobalListeners()
  }

  public subscribe(callback: () => void): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify() {
    this.subscribers.forEach((cb) => {
      try { cb() } catch { /* ignore */ }
    })
  }

  public isBlocked(): boolean {
    if (!this.isAlarmPlaying) return false
    if (!this.ctx) return true
    return this.ctx.state !== 'running'
  }

  public isPlaying(): boolean {
    return this.isAlarmPlaying
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          this.ctx = new AudioCtx()
          this.ctx.onstatechange = () => { this.notify() }
        }
      } catch { return null }
    }
    if (this.ctx && !this.masterGain) {
      try {
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.setValueAtTime(1, this.ctx.currentTime)
        this.masterGain.connect(this.ctx.destination)
      } catch { /* ignore */ }
    }
    return this.ctx
  }

  public unlock = async (): Promise<boolean> => {
    try {
      const ctx = this.getContext()
      if (ctx) {
        if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
          await ctx.resume().catch(() => {})
        }
        if (ctx.state === 'running') {
          try {
            const buffer = ctx.createBuffer(1, 1, 22050)
            const source = ctx.createBufferSource()
            source.buffer = buffer
            source.connect(ctx.destination)
            source.start(0)
          } catch { /* ignore */ }
        }
      }
      this.warmupFallbackAudio()
      this.notify()
      if (this.isAlarmPlaying) { this.playChime() }
      return this.ctx?.state === 'running'
    } catch { return false }
  }

  private warmupFallbackAudio() {
    if (typeof window === 'undefined') return
    if (!this.fallbackAudio) {
      const uri = createBeepWavDataUri(520, 600)
      if (uri) {
        this.fallbackAudio = new Audio(uri)
        this.fallbackAudio.volume = 0.5
      }
    }
  }

  private playFallbackChime() {
    this.warmupFallbackAudio()
    if (!this.fallbackAudio) return
    try {
      this.fallbackAudio.currentTime = 0
      const promise = this.fallbackAudio.play()
      if (promise && typeof promise.then === 'function') {
        promise.catch(() => {})
      }
    } catch { /* ignore */ }
  }

  private attachGlobalListeners() {
    if (typeof window === 'undefined' || this.listenersAttached) return
    this.listenersAttached = true

    const handleGesture = () => {
      if (!this.ctx || this.ctx.state !== 'running' || this.isAlarmPlaying) {
        void this.unlock()
      }
    }

    const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown']
    events.forEach((evt) => {
      window.addEventListener(evt, handleGesture, { passive: true })
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isAlarmPlaying) {
        void this.unlock()
      }
    })

    window.addEventListener('pageshow', () => {
      if (this.isAlarmPlaying) { void this.unlock() }
    })
  }

  /**
   * Soft single-note chime: sine wave at 520 Hz, gentle volume,
   * smooth bell-curve envelope (quick attack, long decay ~0.6s).
   * Much less irritating than the old sawtooth double-pulse.
   */
  private playChime() {
    if (!this.isAlarmPlaying) return
    const ctx = this.getContext()

    if (!ctx || ctx.state !== 'running') {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.notify()
          if (this.isAlarmPlaying && ctx.state === 'running') { this.playChime() }
        }).catch(() => {})
      }
      this.playFallbackChime()
      this.notify()
      return
    }

    if (!this.masterGain) return

    try {
      const now = ctx.currentTime
      const duration = 0.65  // seconds — gentle fade out

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'                          // soft, rounded tone (not buzzy)
      osc.frequency.setValueAtTime(520, now)     // C5-ish — gentle, not shrill

      // Quick attack (5ms), exponential decay to silence
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.015)  // attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)  // decay

      osc.connect(gain)
      if (this.masterGain) { gain.connect(this.masterGain) }

      this.activeOscillators.push(osc)
      osc.onended = () => {
        const idx = this.activeOscillators.indexOf(osc)
        if (idx !== -1) this.activeOscillators.splice(idx, 1)
      }

      osc.start(now)
      osc.stop(now + duration)

      this.notify()
    } catch {
      this.playFallbackChime()
    }
  }

  public startAlert() {
    if (this.isAlarmPlaying) return
    this.stopAlert()

    this.isAlarmPlaying = true
    const ctx = this.getContext()
    if (ctx && this.masterGain) {
      try { this.masterGain.gain.setValueAtTime(1, ctx.currentTime) } catch { /* ignore */ }
    }

    // Play once immediately
    this.playChime()

    // Then repeat gently every 6 seconds (not a rapid-fire ping)
    this.intervalId = window.setInterval(() => {
      if (this.isAlarmPlaying) {
        this.playChime()
      } else if (this.intervalId) {
        clearInterval(this.intervalId)
        this.intervalId = null
      }
    }, 6000)

    this.notify()
  }

  public stopAlert() {
    this.isAlarmPlaying = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.masterGain && this.ctx) {
      try { this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime) } catch { /* ignore */ }
    }

    for (const osc of this.activeOscillators) {
      try { osc.stop(); osc.disconnect() } catch { /* ignore */ }
    }
    this.activeOscillators = []

    if (this.fallbackAudio) {
      try { this.fallbackAudio.pause(); this.fallbackAudio.currentTime = 0 } catch { /* ignore */ }
    }

    this.notify()
  }
}

export const alarmSound = new AlarmSoundManager()
