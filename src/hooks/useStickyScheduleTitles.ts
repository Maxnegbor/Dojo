import { useLayoutEffect, type RefObject } from 'react'

const BLOCK_SELECTOR = '[data-schedule-block]'
const TITLE_SELECTOR = '[data-sticky-block-title]'
/** Keep pinned titles just inside the rounded schedule viewport. */
const VIEW_TOP_INSET_PX = 8

function stickyTitleOffset(
  viewTop: number,
  blockTop: number,
  blockHeight: number,
  titleOffsetTop: number,
  titleHeight: number,
) {
  const maxOffset = Math.max(0, blockHeight - titleOffsetTop - titleHeight)
  return Math.max(0, Math.min(viewTop - (blockTop + titleOffsetTop), maxOffset))
}

/** Keep timeblock titles pinned to the top of a scrolling schedule viewport. */
export function useStickyScheduleTitles(
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  layoutKey: unknown,
) {
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    if (!enabled || !scrollEl) return

    let frame = 0

    const update = () => {
      const viewTop = scrollEl.getBoundingClientRect().top + VIEW_TOP_INSET_PX
      const blocks = scrollEl.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)
      for (const blockEl of blocks) {
        const titleEl = blockEl.querySelector<HTMLElement>(TITLE_SELECTOR)
        if (!titleEl) continue

        const blockRect = blockEl.getBoundingClientRect()
        const offset = stickyTitleOffset(
          viewTop,
          blockRect.top,
          blockRect.height,
          titleEl.offsetTop,
          titleEl.offsetHeight,
        )
        const stuck = offset > 0.5
        titleEl.style.transform = stuck ? `translateY(${offset}px)` : ''
        titleEl.dataset.stuck = stuck ? 'true' : 'false'
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    update()
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(scrollEl)

    return () => {
      cancelAnimationFrame(frame)
      scrollEl.removeEventListener('scroll', onScroll)
      ro.disconnect()
      scrollEl.querySelectorAll<HTMLElement>(TITLE_SELECTOR).forEach((el) => {
        el.style.transform = ''
        delete el.dataset.stuck
      })
    }
  }, [enabled, layoutKey, scrollRef])
}
