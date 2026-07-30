import { useState } from 'react'
import { createPortal } from 'react-dom'
import { LayoutTemplate, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { useSettings } from '@/context/SettingsContext'
import {
  createScheduleTemplate,
  scheduleBlocksFromTemplate,
  templateBlocksFromSchedule,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'
import type { ScheduleBlock } from '@/types'
import { cn } from '@/lib/utils'

/** Synthetic date — blocks stay in-memory and are never written to the day schedule. */
const TEMPLATE_EDIT_DATE = 'template-draft'

interface ScheduleTemplateEditModalProps {
  userId: string
  initial?: ScheduleTemplate | null
  onClose: () => void
  onSave: (template: ScheduleTemplate) => void
}

export function ScheduleTemplateEditModal({
  userId,
  initial = null,
  onClose,
  onSave,
}: ScheduleTemplateEditModalProps) {
  const { settings } = useSettings()
  const [name, setName] = useState(initial?.name ?? 'New template')
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() =>
    initial ? scheduleBlocksFromTemplate(initial, TEMPLATE_EDIT_DATE, userId) : [],
  )

  const save = () => {
    const trimmed = name.trim() || 'Untitled'
    if (blocks.length === 0) return

    if (initial) {
      onSave({
        ...initial,
        name: trimmed.slice(0, 48),
        blocks: templateBlocksFromSchedule(blocks),
        updated_at: new Date().toISOString(),
      })
      return
    }

    onSave(createScheduleTemplate({ name: trimmed, blocks }))
  }

  const upsertBlock = (block: ScheduleBlock) => {
    const normalized = { ...block, date: TEMPLATE_EDIT_DATE, user_id: userId }
    setBlocks((prev) => {
      const idx = prev.findIndex((entry) => entry.id === normalized.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = normalized
        return next
      }
      return [...prev, normalized]
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-3">
      <div className="relative flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-[min(100%,56rem)] flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="shrink-0 border-b border-zinc-800/80 px-5 py-4 pr-12 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-950)]">
              <LayoutTemplate size={20} className="text-[var(--accent-400)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-zinc-100">
                {initial ? 'Edit template' : 'New schedule template'}
              </h2>
              <p className="text-xs text-zinc-400">
                Drag to create blocks · this won’t change today’s Home schedule
              </p>
            </div>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">Template name</span>
            <input
              type="text"
              value={name}
              maxLength={48}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Deep work day"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none"
            />
          </label>
        </div>

        <div
          data-schedule-height-host
          className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 sm:py-4"
        >
          <HourlyTimeline
            blocks={blocks}
            date={TEMPLATE_EDIT_DATE}
            userId={userId}
            isActiveDay={false}
            startHour={settings.timelineStartHour}
            endHour={settings.timelineEndHour}
            onUpdate={upsertBlock}
            onCreate={upsertBlock}
            onDelete={(id) => setBlocks((prev) => prev.filter((block) => block.id !== id))}
          />
        </div>

        <div className="shrink-0 border-t border-zinc-800/80 px-5 py-4 sm:px-6">
          {blocks.length === 0 && (
            <p className="mb-2 text-center text-[10px] text-zinc-500">
              Add at least one block before saving
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className={cn('flex-[2]', blocks.length === 0 && 'opacity-50')}
              onClick={save}
              disabled={blocks.length === 0}
            >
              {initial ? 'Save changes' : 'Save template'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
