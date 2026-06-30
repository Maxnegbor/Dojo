import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { DailyLog, Goal, Workout } from '@/types'
import { calculateProgress, getWeeklyWorkoutTotal } from '@/lib/metrics'
import { formatDuration, getWeekDates } from '@/lib/utils'
import { ALLOW_FUTURE_DATES } from '@/lib/devFlags'
import { useSettings } from '@/context/SettingsContext'
import { format, isFuture, isToday, parseISO } from 'date-fns'

interface DashboardChartsProps {
  logs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  date: string
  view: 'week' | 'month' | 'year'
}

export function DashboardCharts({
  logs,
  workouts,
  goals,
  date,
  view,
}: DashboardChartsProps) {
  const { settings } = useSettings()
  const weekDates = getWeekDates(new Date(date + 'T12:00:00'), settings.weekStartsOn)
  const viewingToday = isToday(parseISO(date))
  const viewingFutureWeek =
    ALLOW_FUTURE_DATES && view === 'week' && isFuture(parseISO(weekDates[weekDates.length - 1] + 'T12:00:00'))
  const todayLog = logs.find((l) => l.date === date)
  const focusToday = todayLog?.focus_minutes ?? 0
  const focusWeek = logs.filter((l) => weekDates.includes(l.date)).reduce((s, l) => s + l.focus_minutes, 0)

  const chartData = logs.map((l) => ({
    date: format(parseISO(l.date), 'MMM d'),
    sleep: l.sleep_hours ?? 0,
    steps: (l.steps ?? 0) / 1000,
    focus: l.focus_minutes,
  }))

  const workoutWeekly = {
    hiit: getWeeklyWorkoutTotal('hiit', workouts, weekDates),
    zone2: getWeeklyWorkoutTotal('zone2', workouts, weekDates),
    strength: getWeeklyWorkoutTotal('strength', workouts, weekDates),
  }

  const workoutTrend = logs.map((l) => {
    const dayWorkouts = workouts.filter((w) => w.date === l.date)
    return {
      date: format(parseISO(l.date), 'MMM d'),
      hiit: dayWorkouts.filter((w) => w.category === 'hiit').reduce((s, w) => s + w.duration_minutes, 0),
      zone2: dayWorkouts.filter((w) => w.category === 'zone2').reduce((s, w) => s + w.duration_minutes, 0),
      strength: dayWorkouts.filter((w) => w.category === 'strength').reduce((s, w) => s + w.duration_minutes, 0),
    }
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            {viewingToday ? 'Focus today' : viewingFutureWeek ? 'Focus · week ahead' : `Focus · ${format(parseISO(date), 'MMM d')}`}
          </p>
          <p className="text-2xl font-bold text-[var(--accent-400)]">{formatDuration(focusToday)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            {view === 'week' && !viewingToday
              ? viewingFutureWeek
                ? 'Focus next week'
                : 'Focus that week'
              : 'Focus this week'}
          </p>
          <p className="text-2xl font-bold text-[var(--accent-300)]">{formatDuration(focusWeek)}</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(['hiit', 'zone2', 'strength'] as const).map((cat) => (
          <Card key={cat} className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              {cat === 'zone2' ? 'Zone 2' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              {view === 'week' && !viewingToday
                ? viewingFutureWeek
                  ? ' next week'
                  : ' that week'
                : ' this week'}
            </p>
            <p className="text-2xl font-bold text-zinc-100">{workoutWeekly[cat]}m</p>
          </Card>
        ))}
      </div>

      <Card title={`Health Trends (${view})`}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
            <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
            <Area type="monotone" dataKey="sleep" stroke="#6366f1" fill="url(#sleepGrad)" name="Sleep (hrs)" />
            <Area type="monotone" dataKey="focus" stroke="#818cf8" fill="url(#focusGrad)" name="Focus (min)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Workout Categories">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={workoutTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
            <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="hiit" fill="#ef4444" name="HIIT" stackId="a" />
            <Bar dataKey="zone2" fill="#3b82f6" name="Zone 2" stackId="a" />
            <Bar dataKey="strength" fill="#eab308" name="Strength" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Goal Progress">
        <div className="space-y-3">
          {goals.map((goal) => {
            const progress = calculateProgress(goal, todayLog, workouts, date, weekDates, logs)
            return (
              <ProgressBar
                key={goal.id}
                percent={progress.percent}
                onTrack={progress.onTrack}
                label={`${goal.name}: ${progress.label}`}
              />
            )
          })}
        </div>
      </Card>

      <Card title="Steps (thousands)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
            <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
            <Line type="monotone" dataKey="steps" stroke="#f59e0b" name="Steps (k)" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
