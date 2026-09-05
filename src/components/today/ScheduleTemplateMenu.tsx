import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, LayoutTemplate, Minus, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ScheduleTemplateEditModal } from '@/components/settings/ScheduleTemplateEditModal'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { GREY_BLOCK_HEX } from '@/types'
import { scheduleColorHex } from '@/lib/scheduleColors'
import {
  clampedScheduleTemplateShift,
  getScheduleTemplates,
  SCHEDULE_TEMPLATES_CHANGED,
  shiftScheduleTemplate,
  upsertScheduleTemplate,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'
import { cn, formatDuration, parseTimeToMinutes } from '@/lib/utils'

const SHIFT_MINUTES = 30

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

function templateAccent(template: ScheduleTemplate): string {
  const first = template.blocks[0]
  if (!first || first.activity_type === 'grey') return GREY_BLOCK_HEX
  return scheduleColorHex(first.activity_type)
}

function TemplateCard({
  template,
  formatTime,
  onApply,
  onEdit,
  onShift,
}: {
  template: ScheduleTemplate
  formatTime: (date: Date) => string
  onApply: () => void
  onEdit: () => void
  onShift: (delta: number) => void
}) {
  const first = template.blocks[0]
  const canEarlier = clampedScheduleTemplateShift(template, -SHIFT_MINUTES) !== 0
  const canLater = clampedScheduleTemplateShift(template, SHIFT_MINUTES) !== 0
  const accent = templateAccent(template)

  const preview = (() => {
    if (!first) return null
    const startMin = parseTimeToMinutes(first.start_time)
    const endMin = parseTimeToMinutes(first.end_time)
    const start = new Date()
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
    return {
      title: first.title,
      time: formatTime(start),
      duration: formatDuration(Math.max(0, endMin - startMin)),
    }
  })()

  return (
    <div className="border-b border-zinc-800/80 px-2 py-2 last:border-b-0">
      <div className="flex items-start gap-1">
        <button
          type="button"
          role="menuitem"
          className="min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-zinc-800/80"
          onClick={onApply}
        >
          <span className="block truncate text-sm font-semibold text-zinc-100">
            {template.name}
          </span>
          <span className="mt-0.5 block text-[10px] text-zinc-500">
            {template.blocks.length} block{template.blocks.length === 1 ? '' : 's'}
          </span>
          {preview && (
            <span className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span className="truncate">
                {preview.title} · {preview.time} · {preview.duration}
              </span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="mt-0.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label={`Edit ${template.name}`}
          title="Edit template"
        >
          <Pencil size={14} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1 px-1.5">
        <button
          type="button"
          disabled={!canEarlier}
          onClick={() => onShift(-SHIFT_MINUTES)}
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Shift ${template.name} 30 minutes earlier`}
        >
          <Minus size={12} />
          30m
        </button>
        <button
          type="button"
          disabled={!canLater}
          onClick={() => onShift(SHIFT_MINUTES)}
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Shift ${template.name} 30 minutes later`}
        >
          <Plus size={12} />
          30m
        </button>
      </div>
    </div>
  )
}

export function ScheduleTemplateMenu({
  disabled = false,
  applying = false,
  onApply,
  className,
  label = 'Template',
  iconOnly = false,
}: ScheduleTemplateMenuProps) {
  const { userId } = useAuth()
  const { formatTime } = useSettings()
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState(() => getScheduleTemplates())
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null)
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

  const shiftTemplate = (template: ScheduleTemplate, delta: number) => {
    const next = shiftScheduleTemplate(template, delta)
    if (next === template) return
    upsertScheduleTemplate(next)
  }

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[200] w-[18.5rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#12121a] py-1 shadow-2xl shadow-black/50"
          >
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                formatTime={formatTime}
                onApply={() => {
                  setOpen(false)
                  void onApply(template)
                }}
                onEdit={() => {
                  setOpen(false)
                  setEditing(template)
                }}
                onShift={(delta) => shiftTemplate(template, delta)}
              />
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
      {editing && userId && (
        <ScheduleTemplateEditModal
          userId={userId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(template) => {
            upsertScheduleTemplate(template)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
