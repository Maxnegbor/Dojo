let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new AudioContext()
    void sharedCtx.resume()
    return sharedCtx
  } catch {
    return null
  }
}

export function warmAudioContext() {
  getAudioContext()
}

export function playTimerChime() {
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.08, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.35)
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
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.01)
}

/** Short retro blips when today's progress fills in. */
export function playGoalProgressSound(options?: { hitTarget?: boolean }) {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const notes = options?.hitTarget ? [523, 659, 784] : [440, 554]

  notes.forEach((freq, i) => {
    playBlip(ctx, freq, now + i * 0.07, i === notes.length - 1 ? 0.07 : 0.05)
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
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Quick satisfying chime when a daily habit is checked off. */
export function playHabitCheckSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  playTone(ctx, 523.25, now, 0.1, 0.042, 'sine')
  playTone(ctx, 659.25, now + 0.07, 0.14, 0.038, 'sine')
  playTone(ctx, 783.99, now + 0.13, 0.18, 0.032, 'sine')
}

/** Richer fanfare for weekly shutdown goal completion. */
export function playWeeklyGoalWinSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  playTone(ctx, 196, now, 0.18, 0.07, 'sine')
  const victory = [523.25, 659.25, 783.99, 1046.5, 1318.51]
  victory.forEach((freq, i) => {
    playTone(ctx, freq, now + 0.08 + i * 0.11, 0.14, 0.055)
  })
  playTone(ctx, 1568, now + 0.62, 0.22, 0.04, 'sine')
}

/** Descending tone for weekly goals that missed target. */
export function playWeeklyGoalFailSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  playTone(ctx, 349.23, now, 0.22, 0.05, 'sine')
  playTone(ctx, 293.66, now + 0.18, 0.28, 0.045, 'sine')
  playTone(ctx, 220, now + 0.38, 0.38, 0.04, 'sine')
  playBlip(ctx, 165, now + 0.55, 0.12, 0.035)
}
