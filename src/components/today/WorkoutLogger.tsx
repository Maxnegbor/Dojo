import { useState } from 'react'
import { Dumbbell, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import type { Workout, WorkoutCategory } from '@/types'
import { WORKOUT_LABELS } from '@/types'

interface WorkoutLoggerProps {
  workouts: Workout[]
  onAdd: (category: WorkoutCategory, duration: number) => void
}

const CATEGORIES: WorkoutCategory[] = ['hiit', 'zone2', 'strength']

export function WorkoutLogger({ workouts, onAdd }: WorkoutLoggerProps) {
  const [category, setCategory] = useState<WorkoutCategory>('zone2')
  const [duration, setDuration] = useState('')
  const [showForm, setShowForm] = useState(false)

  const handleAdd = () => {
    const mins = parseInt(duration, 10)
    if (!mins || mins <= 0) return
    onAdd(category, mins)
    setDuration('')
    setShowForm(false)
  }

  const totalByCategory = CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = workouts
        .filter((w) => w.category === cat)
        .reduce((s, w) => s + w.duration_minutes, 0)
      return acc
    },
    {} as Record<WorkoutCategory, number>,
  )

  return (
    <Card
      title="Workouts"
      action={
        <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} />
        </Button>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {CATEGORIES.map((cat) => (
          <div
            key={cat}
            className="rounded-lg bg-zinc-800/50 px-2 py-2 text-center"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              {WORKOUT_LABELS[cat]}
            </p>
            <p className="text-sm font-semibold text-zinc-200">
              {totalByCategory[cat]}m
            </p>
          </div>
        ))}
      </div>

      {workouts.length > 0 && (
        <ul className="mb-3 space-y-1">
          {workouts.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-2 text-xs text-zinc-400"
            >
              <Dumbbell size={12} className="text-indigo-400" />
              <span>{WORKOUT_LABELS[w.category]}</span>
              <span className="text-zinc-600">·</span>
              <span>{w.duration_minutes}m</span>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="flex gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  category === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {WORKOUT_LABELS[cat]}
              </button>
            ))}
          </div>
          <MetricInput
            label="Duration"
            unit="min"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="30"
          />
          <Button onClick={handleAdd} className="w-full">
            Log Workout
          </Button>
        </div>
      )}
    </Card>
  )
}
