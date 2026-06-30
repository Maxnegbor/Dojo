import { useMemo, useState } from 'react'
import { CalendarDays, Check, Sun, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MetricInput } from '@/components/ui/MetricInput'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { computeMorningLogFields, formatMorningMinutes } from '@/lib/morningLog'
import type { DailyCheckGroup, MorningLog, ScheduleBlock } from '@/types'
import { cn } from '@/lib/utils'

type MorningLogStep = 'log' | 'checklist' | 'schedule'

interface MorningLogModalProps {
  date: string
  initial?: MorningLog | null
  morningChecklist: DailyCheckGroup[]
  blocks: ScheduleBlock[]
  userId: string
  isActiveDay: boolean
  timelineStartHour: number
  timelineEndHour: number
  onUpdateBlock: (block: ScheduleBlock) => void | Promise<void>
  onDeleteBlock: (id: string) => void | Promise<void>
  onCreateBlock: (block: ScheduleBlock) => void | Promise<void>
  onClose: () => void
  onSave: (morningLog: MorningLog) => void | Promise<void>
}

export function MorningLogModal({
  date,
  initial,
  morningChecklist,
  blocks,
  userId,
  isActiveDay,
  timelineStartHour,
  timelineEndHour,
  onUpdateBlock,
  onDeleteBlock,
  onCreateBlock,
  onClose,
  onSave,
}: MorningLogModalProps) {
  const checklistGroups = useMemo(
    () => activeDailyChecklist(morningChecklist),
    [morningChecklist],
  )
  const hasChecklist = checklistGroups.length > 0

  const [step, setStep] = useState<MorningLogStep>('log')
  const [bedtime, setBedtime] = useState(initial?.bedtime ?? '23:00')
  const [asleepTime, setAsleepTime] = useState(initial?.asleep_time ?? '23:30')
  const [wakeTime, setWakeTime] = useState(initial?.wake_time ?? '07:00')
  const [alertness, setAlertness] = useState(String(initial?.alertness ?? 7))
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)

  const preview = computeMorningLogFields({
    bedtime,
    asleep_time: asleepTime,
    wake_time: wakeTime,
    alertness: parseInt(alertness, 10) || 7,
  })

  const stepIndex = step === 'log' ? 1 : step === 'checklist' ? 2 : 3
  const stepCount = hasChecklist ? 3 : 2

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goNextFromLog = () => {
    if (hasChecklist) setStep('checklist')
    else setStep('schedule')
  }

  const goNextFromChecklist = () => {
    setStep('schedule')
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await onSave(preview)
    } finally {
      setSaving(false)
    }
  }

  const stepTitle =
    step === 'log'
      ? 'Morning log'
      : step === 'checklist'
        ? 'Morning checklist'
        : 'Plan your day'

  const stepSubtitle =
    step === 'log'
      ? date
      : step === 'checklist'
        ? 'Optional — tap what you’ve done'
        : 'Sketch today’s schedule on the timeline'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className={cn(
          'relative flex max-h-[92vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl',
          step === 'schedule' ? 'h-[min(92vh,820px)] w-full max-w-3xl' : 'w-full max-w-md',
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="border-b border-zinc-800/80 px-5 py-4 pr-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-950">
              {step === 'schedule' ? (
                <CalendarDays size={20} className="text-amber-400" />
              ) : (
                <Sun size={20} className="text-amber-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">{stepTitle}</h2>
              <p className="text-xs text-zinc-400">{stepSubtitle}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
            Step {step === 'schedule' && !hasChecklist ? 2 : stepIndex} of {stepCount}
          </p>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 px-5 py-4',
            step === 'schedule'
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto',
          )}
        >
          {step === 'log' && (
            <div className="space-y-3">
              <MetricInput
                label="Bedtime"
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
              />
              <MetricInput
                label="Asleep time"
                type="time"
                value={asleepTime}
                onChange={(e) => setAsleepTime(e.target.value)}
              />
              <MetricInput
                label="Wake up"
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
              />
              <MetricInput
                label="Alertness"
                unit="/ 10"
                min={1}
                max={10}
                value={alertness}
                onChange={(e) => setAlertness(e.target.value)}
              />
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                <p>
                  In bed:{' '}
                  <span className="font-medium text-zinc-200">
                    {formatMorningMinutes(preview.in_bed_minutes)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {step === 'checklist' && (
            <div className="space-y-4">
              {checklistGroups.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.items.map((item) => {
                      const done = checked.has(item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleCheck(item.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                              done
                                ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/60'
                                : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                done
                                  ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                                  : 'border-zinc-600',
                              )}
                            >
                              {done && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="text-sm text-zinc-200">{item.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {step === 'schedule' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <HourlyTimeline
                blocks={blocks}
                date={date}
                userId={userId}
                isActiveDay={isActiveDay}
                startHour={timelineStartHour}
                endHour={timelineEndHour}
                onUpdate={onUpdateBlock}
                onDelete={onDeleteBlock}
                onCreate={onCreateBlock}
              />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-5 py-4">
          {step === 'log' && (
            <Button onClick={goNextFromLog} className="w-full">
              Continue
            </Button>
          )}
          {step === 'checklist' && (
            <Button onClick={goNextFromChecklist} className="w-full">
              Continue
            </Button>
          )}
          {step === 'schedule' && (
            <Button onClick={handleFinish} className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Finish morning log'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
