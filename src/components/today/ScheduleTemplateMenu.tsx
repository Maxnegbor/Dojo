import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  getScheduleTemplates,
  SCHEDULE_TEMPLATES_CHANGED,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'
import { cn } from '@/lib/utils'

interface ScheduleTemplateMenuProps {
  disabled?: boolean
  applying?: boolean
  onApply: (template: ScheduleTemplate) => void | Promise<void>
  className?: string
  /** Compact label for tight toolbars. */
  label?: string
  /** Icon-only trigger (homepage schedule toolbar). */
  iconOnly?: boolean
}

export function ScheduleTemplateMenu({
  disabled = false,
  applying = false,
  onApply,
  className,
  label = 'Template',
  iconOnly = false,
}: ScheduleTemplateMenuProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState(() => getScheduleTemplates())
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => setTemplates(getScheduleTemplates())
    window.addEventListener(SCHEDULE_TEMPLATES_CHANGED, sync)
    return () => window.removeEventListener(SCHEDULE_TEMPLATES_CHANGED, sync)
  }, [])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuPos(null)
      return
    }
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (templates.length === 0) return null

  const ariaLabel = applying ? 'Applying template…' : label

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[200] min-w-[12rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#12121a] py-1 shadow-2xl shadow-black/50"
          >
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="menuitem"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-zinc-800/80"
                onClick={() => {
                  setOpen(false)
                  void onApply(template)
                }}
              >
                <span className="text-sm text-zinc-100">{template.name}</span>
                <span className="text-[10px] text-zinc-500">
                  {template.blocks.length} block{template.blocks.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {iconOnly ? (
        <button
          type="button"
          disabled={disabled || applying}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            'rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300',
            (disabled || applying) && 'cursor-not-allowed opacity-50',
            open && 'bg-zinc-800 text-zinc-200',
          )}
        >
          <LayoutTemplate size={16} />
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || applying}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <LayoutTemplate size={14} />
          {applying ? 'Applying…' : label}
          <ChevronDown size={12} className={cn('opacity-70 transition-transform', open && 'rotate-180')} />
        </Button>
      )}
      {menu}
    </div>
  )
}
