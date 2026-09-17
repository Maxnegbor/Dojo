import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { BOTH_WHO, contractCoversEveryone } from '@/lib/habitContracts'
import { formatDate, generateId } from '@/lib/utils'
import type { HabitContract, HabitContractPerson } from '@/types'

const FIELD =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-[var(--accent-ring)] focus:border-[var(--accent-500)] focus:ring-1'

interface ContractFormModalProps {
  people: HabitContractPerson[]
  initial?: HabitContract | null
  defaultPersonId?: string | null
  onSave: (contract: HabitContract) => void
  onClose: () => void
}

function initialWho(
  people: HabitContractPerson[],
  initial?: HabitContract | null,
  defaultPersonId?: string | null,
): string {
  if (initial) {
    if (contractCoversEveryone(initial, people)) return BOTH_WHO
    return initial.person_ids[0] ?? ''
  }
  return defaultPersonId ?? people[0]?.id ?? ''
}

export function ContractFormModal({
  people,
  initial,
  defaultPersonId,
  onSave,
  onClose,
}: ContractFormModalProps) {
  const [who, setWho] = useState(() => initialWho(people, initial, defaultPersonId))
  const [name, setName] = useState(initial?.name ?? '')
  const [goal, setGoal] = useState(initial?.goal ?? '')
  const [penalty, setPenalty] = useState(initial?.penalty ?? '')
  const [howToCalculate, setHowToCalculate] = useState(initial?.how_to_calculate ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? formatDate(new Date()))
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')

  const personIds = who === BOTH_WHO ? people.map((person) => person.id) : who ? [who] : []
  const canSave = name.trim() && personIds.length > 0 && penalty.trim()
  const bothLabel = people.length === 2 ? 'Both' : 'Everyone'

  return (
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-100">
          {initial ? 'Edit contract' : 'New contract'}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          A goal, a penalty, and how to calculate it. Proof is scored with those instructions.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Who</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} className={FIELD}>
              {people.length > 1 && <option value={BOTH_WHO}>{bothLabel}</option>}
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              placeholder="Screentime"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Goal</span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className={`${FIELD} min-h-[4.5rem] resize-y`}
              placeholder="Under 2 hours of phone screentime per day"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Penalty</span>
            <textarea
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
              className={`${FIELD} min-h-[3.5rem] resize-y`}
              placeholder="€5 if over 2 hours of screentime"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">How to calculate</span>
            <textarea
              value={howToCalculate}
              onChange={(e) => setHowToCalculate(e.target.value)}
              className={`${FIELD} min-h-[4.5rem] resize-y`}
              placeholder="Once per day. If a whole week is submitted at once, charge each day over the limit and add them up."
            />
            <span className="block text-[11px] text-zinc-500">
              Tell the API exactly how to apply the penalty. This is the scoring method, not the amount.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">Start</span>
              <DatePickerField value={startDate} onChange={setStartDate} allowPast />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">End</span>
              <DatePickerField value={endDate} onChange={setEndDate} allowPast placeholder="Open" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: initial?.id ?? generateId(),
                person_ids: personIds,
                name: name.trim(),
                goal: goal.trim(),
                penalty: penalty.trim(),
                how_to_calculate: howToCalculate.trim(),
                start_date: startDate,
                end_date: endDate || null,
                created_at: initial?.created_at ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
