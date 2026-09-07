import { createChatCompletion } from '@/lib/openaiApi'
import type { CoachSnapshot } from '@/lib/coachContext'
import {
  normalizeCoachAdvice,
  saveCoachAdvice,
  type CoachAdvice,
  type CoachKind,
} from '@/lib/coachStore'

const SYSTEM_PROMPT = `You are the personal coach inside Dojo, a private daily operating system.
Use only the JSON snapshot the user sends. Never invent metrics, tasks, or events that are not in it.
Be specific and extremely brief. Speak in second person. No fluff, no greetings, no markdown.
Always reply as JSON with keys: headline (max 6 words), body (1-2 short sentences, under 40 words), bullets (exactly 2 objects with title and a one-line detail).
Cover feedback, next action, and one insight — but keep the whole reply tight. Do not list everything in the snapshot.`

const KIND_INSTRUCTIONS: Record<CoachKind, string> = {
  morning:
    'Morning check-in. One sentence on what looks solid, one on the next action before midday. Prefer Pulse gaps, today’s next timeblock, planned workouts, weekly volume that is behind, Habitify, WHOOP, or open Todoist — pick only the highest-leverage items.',
  midday:
    'Midday check-in. One sentence on what is lagging, one on the highest-leverage afternoon action. Skip anything already done. Mention weekly workout volume only if onTrack is false.',
  evening:
    'Evening wrap. One honest sentence on how the day went, one on what to close tonight or carry tomorrow. Mention Pulse gaps or weekly volume only if they matter.',
  insights:
    '2 short insights a coach would notice for this window. Prefer Pulse, sleep, WHOOP, training vs weekly volume, focus, and outcome-goal pace. Skip noise.',
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown
  }
  throw new Error('ChatGPT returned a reply that was not JSON')
}

export async function generateCoachAdvice(
  kind: CoachKind,
  snapshot: CoachSnapshot,
  storageDate = snapshot.date,
): Promise<CoachAdvice> {
  const content = await createChatCompletion({
    temperature: kind === 'insights' ? 0.65 : 0.5,
    maxTokens: 320,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${KIND_INSTRUCTIONS[kind]}\n\nSnapshot JSON:\n${JSON.stringify(snapshot)}`,
      },
    ],
  })

  const parsed = parseJsonObject(content)
  const advice = normalizeCoachAdvice(parsed, kind, storageDate)
  if (!advice) throw new Error('ChatGPT returned an empty coaching reply')
  return saveCoachAdvice(advice)
}
