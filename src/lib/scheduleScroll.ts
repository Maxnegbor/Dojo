export const SCHEDULE_SCROLL_TO_NOW = 'personal-os-schedule-scroll-to-now'

/** Past context kept above the now line when auto-scrolling schedules. */
export const SCHEDULE_NOW_HISTORY_MINUTES = 30

/** Ask any mounted schedule timeline to scroll the current-time indicator to the top. */
export function requestScheduleScrollToNow() {
  window.dispatchEvent(new Event(SCHEDULE_SCROLL_TO_NOW))
}

export interface ScheduleScrollToNowInput {
  nowLinePx: number | null
  nowMinutes: number
  timelineStartMinutes: number
  timelineEndMinutes: number
  /** Bottom edge of schedule content within the scroll area (px). */
  contentEndPx: number
  hourHeightPx: number
  scrollHeight: number
  clientHeight: number
  currentScrollTop?: number
  historyMinutes?: number
}

/** Scroll target that keeps ~history above now without scrolling past a visible schedule end. */
export function computeScheduleScrollToNowTarget({
  nowLinePx,
  nowMinutes,
  timelineStartMinutes,
  timelineEndMinutes,
  contentEndPx,
  hourHeightPx,
  scrollHeight,
  clientHeight,
  currentScrollTop = 0,
  historyMinutes = SCHEDULE_NOW_HISTORY_MINUTES,
}: ScheduleScrollToNowInput): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  if (maxScroll <= 0) return 0

  if (contentEndPx <= clientHeight) return 0

  let idealTarget = 0

  if (nowLinePx != null) {
    const historyPx = (historyMinutes / 60) * hourHeightPx
    idealTarget = Math.max(0, nowLinePx - historyPx)
  } else if (nowMinutes > timelineEndMinutes) {
    idealTarget = maxScroll
  } else if (nowMinutes < timelineStartMinutes) {
    return 0
  }

  const maxScrollKeepingEndVisible = Math.max(0, contentEndPx - clientHeight)
  let target = Math.min(idealTarget, maxScroll, maxScrollKeepingEndVisible)

  const endVisible = currentScrollTop + clientHeight >= contentEndPx - 1
  if (endVisible && target > currentScrollTop) {
    target = currentScrollTop
  }

  return target
}
