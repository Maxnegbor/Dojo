import { useEffect, useState } from 'react'
import {
  getPulseDevPreviewScore,
  setPulseDevPreviewScore,
  subscribePulseDevPreview,
} from '@/lib/pulseDevPreview'

export function usePulseDevPreview(): [number | null, (score: number | null) => void] {
  const [previewScore, setPreviewScoreState] = useState<number | null>(() => getPulseDevPreviewScore())

  useEffect(() => subscribePulseDevPreview(() => setPreviewScoreState(getPulseDevPreviewScore())), [])

  const setPreviewScore = (score: number | null) => {
    setPulseDevPreviewScore(score)
    setPreviewScoreState(score)
  }

  return [previewScore, setPreviewScore]
}
