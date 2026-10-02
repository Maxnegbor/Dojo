import { useLayoutEffect, useRef, useState } from 'react'

/** A continuous rounded path behind the cards, measured again as their content changes. */
export function OneThingGoalPath() {
  const ref = useRef<SVGSVGElement>(null)
  const [path, setPath] = useState('')
  useLayoutEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    const cards = [...host.querySelectorAll<HTMLElement>(':scope > section')]
    const measure = () => {
      const bounds = host.getBoundingClientRect()
      const centers = cards.map(card => {
        const rect = card.getBoundingClientRect()
        return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 }
      })
      if (centers.length !== 6) return
      const [a, b, c, d, e, f] = centers
      if (Math.abs(a.x - b.x) < 1) {
        setPath(`M ${a.x} ${a.y} L ${f.x} ${f.y}`)
        return
      }
      const right = bounds.width - 4
      const left = 4
      const radius = 24
      setPath([
        `M ${a.x} ${a.y}`,
        `H ${right - radius}`,
        `Q ${right} ${a.y} ${right} ${a.y + radius}`,
        `V ${c.y - radius}`,
        `Q ${right} ${c.y} ${right - radius} ${c.y}`,
        `H ${left + radius}`,
        `Q ${left} ${d.y} ${left} ${d.y + radius}`,
        `V ${e.y - radius}`,
        `Q ${left} ${e.y} ${left + radius} ${e.y}`,
        `H ${f.x}`,
      ].join(' '))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    cards.forEach(card => observer.observe(card))
    return () => observer.disconnect()
  }, [])
  return <svg ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-[var(--accent-400)]">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="9" opacity="0.07" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}
