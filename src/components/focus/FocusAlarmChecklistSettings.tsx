import { Plus, Trash2 } from 'lucide-react'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { generateId } from '@/lib/utils'
import type { FocusAlarmCheckItem } from '@/types'

interface FocusAlarmChecklistSettingsProps {
  label: string
  description: string
  enabled: boolean
  items: FocusAlarmCheckItem[]
  onEnabledChange: (enabled: boolean) => void
  onItemsChange: (items: FocusAlarmCheckItem[]) => void
}

export function FocusAlarmChecklistSettings({
  label,
  description,
  enabled,
  items,
  onEnabledChange,
  onItemsChange,
}: FocusAlarmChecklistSettingsProps) {
  const addItem = () => {
    onItemsChange([...items, { id: generateId(), label: '' }])
  }

  return (
    <div className="space-y-3">
      <ToggleRow
        label={label}
        description={description}
        compact
        checked={enabled}
        onChange={onEnabledChange}
      />
      {enabled && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5">
              <input
                value={item.label}
                placeholder="Checklist item"
                onChange={(event) =>
                  onItemsChange(
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
                className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onItemsChange(items.filter((entry) => entry.id !== item.id))}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                aria-label="Remove item"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1 px-0.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200"
          >
            <Plus size={13} />
            Add item
          </button>
        </div>
      )}
    </div>
  )
}
