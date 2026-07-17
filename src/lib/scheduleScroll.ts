export const SCHEDULE_SCROLL_TO_NOW = 'personal-os-schedule-scroll-to-now'

/** Ask any mounted schedule timeline to scroll the current-time indicator to the top. */
export function requestScheduleScrollToNow() {
  window.dispatchEvent(new Event(SCHEDULE_SCROLL_TO_NOW))
}
