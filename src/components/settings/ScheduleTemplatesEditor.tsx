import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ScheduleTemplateEditModal } from '@/components/settings/ScheduleTemplateEditModal'
import { useAuth } from '@/context/AuthContext'
import {
  getScheduleTemplates,
  saveScheduleTemplates,
  SCHEDULE_TEMPLATES_CHANGED,
  summarizeScheduleTemplate,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'

interface ScheduleTemplatesEditorProps {
  onSaved?: () => void
}

export function ScheduleTemplatesEditor({ onSaved }: ScheduleTemplatesEditorProps) {
  const { userId } = useAuth()
  const [templates, setTemplates] = useState(() => getScheduleTemplates())
  const [editor, setEditor] = useState<'create' | ScheduleTemplate | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setTemplates(getScheduleTemplates())
    window.addEventListener(SCHEDULE_TEMPLATES_CHANGED, sync)
    return () => window.removeEventListener(SCHEDULE_TEMPLATES_CHANGED, sync)
  }, [])

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2500)
  }

  const commit = (next: ScheduleTemplate[]) => {
    const saved = saveScheduleTemplates(next)
    setTemplates(saved)
    onSaved?.()
  }

  const renameTemplate = (id: string, name: string) => {
    commit(
      templates.map((template) =>
        template.id === id
          ? { ...template, name: name.slice(0, 48), updated_at: new Date().toISOString() }
          : template,
      ),
    )
  }

  const removeTemplate = (id: string) => {
    commit(templates.filter((template) => template.id !== id))
  }

  const handleSave = (template: ScheduleTemplate) => {
    const existing = templates.find((entry) => entry.id === template.id)
    if (existing) {
      commit(templates.map((entry) => (entry.id === template.id ? template : entry)))
      flash(`Updated “${template.name}”.`)
    } else {
      commit([...templates, template])
      flash(`Saved “${template.name}” with ${template.blocks.length} blocks.`)
    }
    setEditor(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Build a day plan in the schedule editor, then apply it on Home or when planning tomorrow in
        shutdown.
      </p>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          if (!userId) {
            flash('Sign in to create a schedule template.')
            return
          }
          setEditor('create')
        }}
      >
        <Plus size={14} />
        New template
      </Button>

      {message && <p className="text-xs text-zinc-400">{message}</p>}

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-3 py-4 text-center text-xs text-zinc-500">
          No templates yet. Open the schedule editor to create one.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={template.name}
                  maxLength={48}
                  onChange={(e) => renameTemplate(template.id, e.target.value)}
                  className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                  aria-label="Template name"
                />
                <p className="px-0.5 text-[11px] text-zinc-500">
                  {summarizeScheduleTemplate(template)}
                </p>
                {template.blocks.length > 0 && (
                  <ul className="space-y-0.5 px-0.5">
                    {template.blocks.slice(0, 4).map((block, index) => (
                      <li key={`${template.id}-${index}`} className="truncate text-[10px] text-zinc-600">
                        {block.start_time}–{block.end_time} · {block.title}
                      </li>
                    ))}
                    {template.blocks.length > 4 && (
                      <li className="text-[10px] text-zinc-600">
                        +{template.blocks.length - 4} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!userId) {
                      flash('Sign in to edit a schedule template.')
                      return
                    }
                    setEditor(template)
                  }}
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label={`Edit ${template.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(template.id)}
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                  aria-label={`Delete ${template.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editor && userId && (
        <ScheduleTemplateEditModal
          userId={userId}
          initial={editor === 'create' ? null : editor}
          onClose={() => setEditor(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
