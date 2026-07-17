import { Button } from '@/components/ui/Button'
import { PULSE_PREVIEW_LEVELS } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface PulseDevPreviewControlsProps {
  previewScore: number | null
  onPreviewScoreChange: (score: number | null) => void
  compact?: boolean
  className?: string
}

export function PulseDevPreviewControls({
  previewScore,
  onPreviewScoreChange,
  compact = false,
  className,
}: PulseDevPreviewControlsProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-violet-500/30 bg-violet-950/20',
        compact ? 'px-2.5 py-2' : 'p-3',
        className,
      )}
    >
      <p
        className={cn(
          'font-medium uppercase tracking-wide text-violet-300',
          compact ? 'mb-1.5 text-[10px]' : 'mb-2 text-[11px]',
        )}
      >
        Dev — preview pulse level
      </p>
      <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        <Button
          variant={previewScore == null ? 'primary' : 'secondary'}
          size="sm"
          className={compact ? 'h-7 px-2 text-[10px]' : undefined}
          onClick={() => onPreviewScoreChange(null)}
        >
          Live
        </Button>
        {PULSE_PREVIEW_LEVELS.map(({ label, score }) => (
          <Button
            key={label}
            variant={previewScore === score ? 'primary' : 'secondary'}
            size="sm"
            className={cn(
              compact && 'h-7 px-2 text-[10px]',
              previewScore === score && 'ring-1 ring-violet-400/50',
            )}
            onClick={() => onPreviewScoreChange(score)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
