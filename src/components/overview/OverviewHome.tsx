import {
  ChevronRight,
  Crosshair,
  Dumbbell,
  Folder,
  Moon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { OverviewPulseHistoryCard } from '@/components/overview/OverviewPulseHistoryCard'
import { resolveGoalCategoryId } from '@/lib/goalCategories'
import { getActiveGoals } from '@/lib/goals'
import type { OverviewCategory, OverviewCategoryItem } from '@/lib/overviewCategories'
import type { OverviewPeriod, OverviewPeriodStats } from '@/lib/overviewPeriods'
import type { OverviewPulseHistory } from '@/lib/overviewPulse'
import { formatDuration } from '@/lib/utils'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fitness: Dumbbell,
  sleep: Moon,
  habits: Sparkles,
  focus: Crosshair,
}

interface AreaCardModel {
  id: OverviewCategory
  label: string
  icon: LucideIcon
  primary: string
  secondary: string
}

function buildAreaCards(
  categories: OverviewCategoryItem[],
  stats: OverviewPeriodStats,
  goals: Goal[],
  period: OverviewPeriod,
): AreaCardModel[] {
  const periodNoun = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year'

  return categories.map((category) => {
    const icon = CATEGORY_ICONS[category.id] ?? Folder

    if (category.id === 'fitness') {
      const weightBits =
        stats.weightStart != null && stats.weightEnd != null
          ? `${stats.weightStart} → ${stats.weightEnd} kg`
          : stats.weightEnd != null
            ? `${stats.weightEnd} kg`
            : null
      const workoutBits =
        stats.workoutTotalMinutes > 0
          ? formatDuration(stats.workoutTotalMinutes)
          : null
      return {
        id: category.id,
        label: category.label,
        icon,
        primary: weightBits ?? workoutBits ?? 'No logs yet',
        secondary:
          weightBits && workoutBits
            ? `${workoutBits} training`
            : weightBits
              ? 'Weight progress'
              : workoutBits
                ? `Training this ${periodNoun}`
                : 'Open fitness detail',
      }
    }

    if (category.id === 'sleep') {
      return {
        id: category.id,
        label: category.label,
        icon,
        primary:
          stats.sleepAvg != null ? `${stats.sleepAvg.toFixed(1)}h avg` : 'No sleep logs',
        secondary:
          stats.sleepDays > 0
            ? `${stats.sleepDays} night${stats.sleepDays === 1 ? '' : 's'} logged`
            : `Open sleep detail`,
      }
    }

    if (category.id === 'habits') {
      const rate = stats.habitSummary?.avgRate
      return {
        id: category.id,
        label: category.label,
        icon,
        primary: rate != null ? `${Math.round(rate)}%` : 'No habits',
        secondary:
          stats.habits.length > 0
            ? `${stats.habits.length} habit${stats.habits.length === 1 ? '' : 's'} tracked`
            : 'Open habits detail',
      }
    }

    if (category.id === 'focus') {
      return {
        id: category.id,
        label: category.label,
        icon,
        primary:
          stats.focus.total > 0 ? formatDuration(stats.focus.total) : 'No focus yet',
        secondary:
          stats.focus.activeDays > 0
            ? `${stats.focus.activeDays} active day${stats.focus.activeDays === 1 ? '' : 's'}`
            : `Open focus detail`,
      }
    }

    const active = getActiveGoals(goals).filter(
      (goal) => resolveGoalCategoryId(goal.category_id) === category.id,
    )
    return {
      id: category.id,
      label: category.label,
      icon,
      primary:
        active.length > 0
          ? `${active.length} goal${active.length === 1 ? '' : 's'}`
          : 'No goals',
      secondary: 'Open category detail',
    }
  })
}

interface OverviewHomeProps {
  period: OverviewPeriod
  categories: OverviewCategoryItem[]
  stats: OverviewPeriodStats
  goals: Goal[]
  pulseHistory: OverviewPulseHistory
  today: string
  onOpenCategory: (category: OverviewCategory) => void
}

export function OverviewHome({
  period,
  categories,
  stats,
  goals,
  pulseHistory,
  today,
  onOpenCategory,
}: OverviewHomeProps) {
  const cards = buildAreaCards(categories, stats, goals, period)

  return (
    <div className="space-y-5">
      <OverviewPulseHistoryCard period={period} history={pulseHistory} today={today} />

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
          Add metrics categories on the Metrics page to see overview cards.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenCategory(card.id)}
                className={cn(
                  'group flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900 p-4 text-left',
                  'transition-colors hover:border-zinc-700 hover:bg-zinc-800/80',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-500)]',
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-zinc-400 ring-1 ring-zinc-800 group-hover:text-[var(--accent-300)]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      {card.label}
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400"
                    />
                  </span>
                  <span className="mt-1 block truncate text-lg font-semibold text-zinc-100">
                    {card.primary}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                    {card.secondary}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
