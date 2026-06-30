import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn, generateId } from '@/lib/utils'
import type { DailyCheckGroup } from '@/types'

interface SettingsDailyChecklistEditorProps {
  checklist: DailyCheckGroup[]
  onChange: (checklist: DailyCheckGroup[]) => void
  onSaved?: () => void
  emptyHint?: string
}

export function SettingsDailyChecklistEditor({
  checklist,
  onChange,
  onSaved,
  emptyHint = 'No checklist items yet. Add a section to show checkboxes after logging.',
}: SettingsDailyChecklistEditorProps) {
  const [confirmReset, setConfirmReset] = useState(false)

  const commit = (next: DailyCheckGroup[]) => {
    onChange(next)
    onSaved?.()
  }

  const updateGroupLabel = (groupId: string, label: string) => {
    commit(checklist.map((group) => (group.id === groupId ? { ...group, label } : group)))
  }

  const removeGroup = (groupId: string) => {
    commit(checklist.filter((group) => group.id !== groupId))
  }

  const addGroup = () => {
    commit([
      ...checklist,
      {
        id: generateId(),
        label: 'New section',
        items: [{ id: generateId(), label: 'New checkbox' }],
      },
    ])
  }

  const addItem = (groupId: string) => {
    commit(
      checklist.map((group) =>
        group.id === groupId
          ? { ...group, items: [...group.items, { id: generateId(), label: 'New checkbox' }] }
          : group,
      ),
    )
  }

  const updateItemLabel = (groupId: string, itemId: string, label: string) => {
    commit(
      checklist.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) => (item.id === itemId ? { ...item, label } : item)),
            }
          : group,
      ),
    )
  }

  const removeItem = (groupId: string, itemId: string) => {
    commit(
      checklist.map((group) =>
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
          : group,
      ),
    )
  }

  const resetChecklist = () => {
    commit([])
    setConfirmReset(false)
  }

  return (
    <div className="space-y-4">
      {checklist.length === 0 && (
        <p className="text-xs text-zinc-500">{emptyHint}</p>
      )}

      {checklist.map((group) => (
        <div key={group.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={group.label}
              onChange={(e) => updateGroupLabel(group.id, e.target.value)}
              className={cn(
                'min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-sm font-medium text-[var(--accent-300)]',
                'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
              )}
            />
            <button
              type="button"
              onClick={() => removeGroup(group.id)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              aria-label="Remove section"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <input
                  value={item.label}
                  onChange={(e) => updateItemLabel(group.id, item.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200 focus:border-[var(--accent-500)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeItem(group.id, item.id)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  aria-label="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => addItem(group.id)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-[var(--accent-300)]"
          >
            <Plus size={12} /> Add checkbox
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addGroup}>
          <Plus size={14} /> Add section
        </Button>
        {checklist.length > 0 && !confirmReset && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        )}
      </div>

      {confirmReset && (
        <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-400">Clear the entire checklist?</p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" size="sm" onClick={resetChecklist}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
