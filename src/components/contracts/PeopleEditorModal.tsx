import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ColorDotPicker } from '@/components/ui/ColorDotPicker'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { PERSON_COLORS } from '@/lib/habitContracts'
import { cn } from '@/lib/utils'
import type { HabitContractPerson } from '@/types'

const FIELD =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-[var(--accent-ring)] focus:border-[var(--accent-500)] focus:ring-1'

interface PeopleEditorModalProps {
  people: HabitContractPerson[]
  selfPersonId: string | null
  onSave: (input: { id?: string; name: string; color: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function PeopleEditorModal({
  people,
  selfPersonId,
  onSave,
  onDelete,
  onClose,
}: PeopleEditorModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(PERSON_COLORS[people.length % PERSON_COLORS.length])
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-100">People</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Add your friend here. They sign in to the same Dojo — contracts are shared with everyone
          on this site.
        </p>

        <ul className="mt-4 space-y-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: person.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{person.name}</span>
              {selfPersonId === person.id && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  You
                </span>
              )}
              {confirmId === person.id ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="danger" onClick={() => onDelete(person.id)}>
                    Delete
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>
                    No
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  aria-label={`Remove ${person.name}`}
                  onClick={() => setConfirmId(person.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-xs font-medium text-zinc-400">Add friend</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              placeholder="Siebe"
            />
          </label>
          <ColorDotPicker
            value={color}
            swatches={PERSON_COLORS}
            onChange={setColor}
            label="Person color"
          />
          <Button
            size="sm"
            className={cn('shrink-0')}
            disabled={!name.trim()}
            onClick={() => {
              onSave({ name: name.trim(), color })
              setName('')
              setColor(PERSON_COLORS[(people.length + 1) % PERSON_COLORS.length])
            }}
          >
            <Plus size={14} />
            Add
          </Button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
