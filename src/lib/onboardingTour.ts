export const ONBOARDING_TOUR_KEY = 'dojo-onboarding-tour'
export const ONBOARDING_TOUR_CHANGED = 'dojo-onboarding-tour-changed'

export interface OnboardingTourStop {
  id: string
  route: string
  navTarget: string
  contentTarget: string
  title: string
  body: string
  hint: string
}

export const ONBOARDING_TOUR_STOPS: OnboardingTourStop[] = [
  {
    id: 'today',
    route: '/',
    navTarget: '[data-tour="nav-today"]',
    contentTarget: '[data-tour="today-content"]',
    title: 'Home',
    body: 'Your daily home base — log habits, focus, sleep, workouts, and your schedule timeline.',
    hint: 'Start each morning with your log, then check things off as you go.',
  },
  {
    id: 'focus',
    route: '/focus',
    navTarget: '[data-tour="nav-focus"]',
    contentTarget: '[data-tour="focus-timer"]',
    title: 'Focus timer',
    body: 'Run deep-work sessions that count toward your focus goal automatically.',
    hint: 'Open Focus from the nav bar anytime you sit down to work.',
  },
  {
    id: 'metrics',
    route: '/goals',
    navTarget: '[data-tour="nav-metrics"]',
    contentTarget: '[data-tour="metrics-content"]',
    title: 'Metrics',
    body: 'Add, edit, and reorder habits, goals, and workout types — your setup lives here.',
    hint: 'Everything you configured in onboarding can be changed later.',
  },
  {
    id: 'pulse',
    route: '/pulse',
    navTarget: '[data-tour="nav-pulse"]',
    contentTarget: '[data-tour="pulse-hero"]',
    title: 'Pulse',
    body: 'A living rhythm score from habits, focus, and sleep — not another dashboard.',
    hint: 'Check Pulse when you want a feel for how aligned your week is.',
  },
]

interface OnboardingTourState {
  step: number
  preview: boolean
}

function readTourState(): OnboardingTourState | null {
  try {
    const raw = sessionStorage.getItem(ONBOARDING_TOUR_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OnboardingTourState
  } catch {
    return null
  }
}

function writeTourState(state: OnboardingTourState | null): void {
  try {
    if (state == null) {
      sessionStorage.removeItem(ONBOARDING_TOUR_KEY)
    } else {
      sessionStorage.setItem(ONBOARDING_TOUR_KEY, JSON.stringify(state))
    }
    window.dispatchEvent(new Event(ONBOARDING_TOUR_CHANGED))
  } catch {
    /* ignore */
  }
}

export function startOnboardingTour(options?: { preview?: boolean }): void {
  writeTourState({ step: 0, preview: options?.preview ?? false })
}

export function stopOnboardingTour(): void {
  writeTourState(null)
}

export function isOnboardingTourActive(): boolean {
  return readTourState() != null
}

export function getOnboardingTourStep(): number {
  return readTourState()?.step ?? 0
}

export function isOnboardingTourPreview(): boolean {
  return readTourState()?.preview ?? false
}

export function setOnboardingTourStep(step: number): void {
  const current = readTourState()
  if (!current) return
  writeTourState({ ...current, step })
}

export function unionRects(rects: DOMRect[]): DOMRect | null {
  if (rects.length === 0) return null
  const top = Math.min(...rects.map((r) => r.top))
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

export function getTourTargetRect(selectors: string[]): DOMRect | null {
  const rects = selectors
    .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => rect != null && rect.width > 0 && rect.height > 0)
  return unionRects(rects)
}
