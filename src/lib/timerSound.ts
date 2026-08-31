type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      const Ctor =
        window.AudioContext || (window as WebAudioWindow).webkitAudioContext
      if (!Ctor) return null
      sharedCtx = new Ctor()
    }
    return sharedCtx
  } catch {
    return null
  }
}

/**
 * Schedule audio immediately, then resume the context.
 * Do NOT wait for resume before scheduling — delayed scheduling after an async
 * resume is what was killing the radiant SFX in some browsers.
 */
function withAudioContext(play: (ctx: AudioContext) => void) {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    play(ctx)
  } catch {
    /* ignore graph errors */
  }
  if (ctx.state !== 'running') {
    void ctx.resume()
  }
}

export function warmAudioContext() {
  const ctx = getAudioContext()
  if (ctx && ctx.state !== 'running') void ctx.resume()
}

/** Resume audio from a click/tap so later SFX can play. */
export function unlockAudio() {
  withAudioContext((ctx) => {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  })
}

export function playTimerChime() {
  withAudioContext((ctx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  })
}

/** Block-start alarm for schedule timeblocks. */
export function playScheduleBlockAlarmSound() {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    playTone(ctx, 659.25, now, 0.2, 0.08, 'sine')
    playTone(ctx, 880, now + 0.15, 0.25, 0.07, 'sine')
    playTone(ctx, 1046.5, now + 0.32, 0.35, 0.06, 'sine')
  })
}

/** Clear completion chime when a focus block (or the whole session) ends. */
export function playFocusTimerFinishSound(options?: { sessionComplete?: boolean }) {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    if (options?.sessionComplete) {
      playTone(ctx, 392.0, now, 0.16, 0.07, 'sine')
      playTone(ctx, 523.25, now + 0.12, 0.18, 0.065, 'sine')
      playTone(ctx, 659.25, now + 0.24, 0.2, 0.06, 'sine')
      playTone(ctx, 783.99, now + 0.38, 0.28, 0.055, 'sine')
      playTone(ctx, 1046.5, now + 0.52, 0.45, 0.045, 'sine')
      return
    }
    playTone(ctx, 523.25, now, 0.14, 0.07, 'sine')
    playTone(ctx, 659.25, now + 0.11, 0.16, 0.06, 'sine')
    playTone(ctx, 783.99, now + 0.22, 0.32, 0.055, 'sine')
  })
}

function playBlip(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration = 0.055,
  volume = 0.035,
) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2200

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(Math.max(0.001, volume), start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + Math.max(0.02, duration))

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.01)
}

/** Short retro blips when today's progress fills in. */
export function playGoalProgressSound(options?: { hitTarget?: boolean }) {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    const notes = options?.hitTarget ? [523, 659, 784] : [440, 554]
    notes.forEach((freq, i) => {
      playBlip(ctx, freq, now + i * 0.07, i === notes.length - 1 ? 0.07 : 0.05)
    })
  })
}

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'square',
) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2800

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(Math.max(0.001, volume), start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + Math.max(0.02, duration))

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

function playSweepTone(
  ctx: AudioContext,
  fromFreq: number,
  toFreq: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(40, fromFreq), start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), start + duration)
  gain.gain.setValueAtTime(0.001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + duration * 0.25)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function playNoiseSweep(
  ctx: AudioContext,
  start: number,
  duration: number,
  fromFreq: number,
  toFreq: number,
  volume: number,
) {
  const safeDuration = Math.max(0.05, duration)
  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, safeDuration + 0.04)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.1
  filter.frequency.setValueAtTime(Math.max(60, fromFreq), start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, toFreq), start + safeDuration)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + safeDuration * 0.2)
  gain.gain.exponentialRampToValueAtTime(0.001, start + safeDuration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start(start)
  source.stop(start + safeDuration + 0.02)
}

/** Quick satisfying chime when a daily habit is checked off. */
export function playHabitCheckSound() {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    playTone(ctx, 523.25, now, 0.1, 0.05, 'sine')
    playTone(ctx, 659.25, now + 0.07, 0.14, 0.045, 'sine')
    playTone(ctx, 783.99, now + 0.13, 0.18, 0.04, 'sine')
  })
}

/** Richer fanfare for weekly shutdown goal completion. */
export function playWeeklyGoalWinSound() {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    playTone(ctx, 196, now, 0.18, 0.07, 'sine')
    const victory = [523.25, 659.25, 783.99, 1046.5, 1318.51]
    victory.forEach((freq, i) => {
      playTone(ctx, freq, now + 0.08 + i * 0.11, 0.14, 0.055)
    })
    playTone(ctx, 1568, now + 0.62, 0.22, 0.04, 'sine')
  })
}

/** Descending tone for weekly goals that missed target. */
export function playWeeklyGoalFailSound() {
  withAudioContext((ctx) => {
    const now = ctx.currentTime
    playTone(ctx, 349.23, now, 0.22, 0.05, 'sine')
    playTone(ctx, 293.66, now + 0.18, 0.28, 0.045, 'sine')
    playTone(ctx, 220, now + 0.38, 0.38, 0.04, 'sine')
    playBlip(ctx, 165, now + 0.55, 0.12, 0.035)
  })
}

/** Quiet tension as the core finishes growing / starts shaking. */
function scheduleRadiantGrowTension(ctx: AudioContext, at: number, duration: number) {
  const d = Math.max(0.08, duration)
  playSweepTone(ctx, 55, 120, at, d, 0.028, 'sine')
  playSweepTone(ctx, 110, 200, at + d * 0.15, d * 0.9, 0.022, 'triangle')
}

/** Halo bloom — rising whoosh while nova emits (noise only — no tonal boops). */
function scheduleRadiantCharge(ctx: AudioContext, at: number, duration: number) {
  const d = Math.max(0.08, duration)
  playNoiseSweep(ctx, at, d, 280, 2200, 0.07)
  playNoiseSweep(ctx, at + d * 0.15, d * 0.85, 400, 1600, 0.045)
}

/**
 * Radiant grow → nova soundtrack.
 * Slam impact plays separately via playPulseRadiantSlamSound on animation impact.
 */
export function playPulseRadiantSequenceSound(options?: {
  growMs?: number
  novaMs?: number
}) {
  const growMs = Math.max(0, options?.growMs ?? 1750)
  const novaMs = Math.max(0, options?.novaMs ?? 420)

  withAudioContext((ctx) => {
    // Unlock during the gesture when possible.
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)

    const t0 = ctx.currentTime
    const growSec = growMs / 1000
    const novaSec = novaMs / 1000

    const chargeAt = t0 + growSec

    if (growSec > 0) {
      scheduleRadiantGrowTension(ctx, t0, growSec)
    }
    scheduleRadiantCharge(ctx, chargeAt, novaSec)
  })
}

function scheduleRadiantSlam(ctx: AudioContext, at: number) {
  // Deep body — weight of the hit
  playTone(ctx, 48, at, 0.55, 0.18, 'sine')
  playTone(ctx, 72, at, 0.42, 0.12, 'sine')
  playTone(ctx, 110, at + 0.01, 0.28, 0.09, 'triangle')
  playTone(ctx, 165, at + 0.02, 0.22, 0.06, 'sine')
  playNoiseSweep(ctx, at, 0.16, 700, 180, 0.08)

  // Rich ascending bloom — overlapping tones so it rings, not a short blip
  const bloom = [
    { freq: 392.0, delay: 0.04, dur: 0.45, vol: 0.055 }, // G4
    { freq: 523.25, delay: 0.09, dur: 0.5, vol: 0.06 }, // C5
    { freq: 659.25, delay: 0.15, dur: 0.55, vol: 0.055 }, // E5
    { freq: 783.99, delay: 0.22, dur: 0.6, vol: 0.05 }, // G5
    { freq: 1046.5, delay: 0.3, dur: 0.7, vol: 0.042 }, // C6
  ]
  bloom.forEach(({ freq, delay, dur, vol }) => {
    playTone(ctx, freq, at + delay, dur, vol, 'sine')
  })

  // Soft chord pad underneath the bloom
  playTone(ctx, 261.63, at + 0.08, 0.75, 0.035, 'sine')
  playTone(ctx, 329.63, at + 0.1, 0.7, 0.03, 'triangle')
  playTone(ctx, 392.0, at + 0.12, 0.65, 0.028, 'sine')

  // Sparkle trail
  playTone(ctx, 1318.5, at + 0.38, 0.55, 0.032, 'sine')
  playTone(ctx, 1568.0, at + 0.48, 0.45, 0.022, 'sine')
}

/** Rising charge while the pre-slam nova blooms. */
export function playPulseRadiantChargeSound() {
  withAudioContext((ctx) => {
    scheduleRadiantCharge(ctx, ctx.currentTime, 0.42)
  })
}

/** Impact + shimmer when the radiant slam lands. */
export function playPulseRadiantSlamSound() {
  withAudioContext((ctx) => {
    scheduleRadiantSlam(ctx, ctx.currentTime)
  })
}

/** @deprecated Use playPulseRadiantSequenceSound */
export const playPulseRadiantTestSequenceSound = playPulseRadiantSequenceSound
