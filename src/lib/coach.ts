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
Be specific, concrete, and brief. Speak in second person. No fluff, no greetings, no markdown.
Always reply as JSON with keys: headline (max 8 words), body (2-4 sentences), bullets (2-5 objects with title and detail).
Each reply should cover all three: how things are going (feedback), what to do next, and one or two patterns worth noticing (insights).`

const KIND_INSTRUCTIONS: Record<CoachKind, string> = {
  morning:
    'This is the morning check-in. Set up the day: what already looks solid, the next actions until midday, and one pattern to watch. Prefer remaining Pulse points, today’s timeblocks, planned workouts, weekly workout volume that is behind pace, Habitify, WHOOP recovery/sleep/strain when present, and open Todoist tasks. If workoutVolume has onTrack false, say so and what is still needed this week.',
  midday:
    'This is the midday check-in. Reflect on the morning, name what is lagging, and define the highest-leverage actions for the afternoon. Skip anything already done. Close with one insight from today so far. Call out weekly workout volume that is behind pace (workoutVolume.onTrack false) and how much remains. If WHOOP strain is present, factor it into training advice.',
  evening:
    'This is the evening wrap. How the day went, what to close tonight or carry into tomorrow, and the main insight from today. Be honest about Pulse gaps and weekly workout volume without being harsh. If workoutVolume is behind pace, say what still has to happen before the week ends. Use WHOOP recovery/sleep/strain when present.',
  insights:
    'Summarize patterns: recent Pulse scores, sleep, WHOOP recovery/strain when present, training, weekly workout volume vs target, focus, and whether outcome goals are on track. Call out 2-4 insights a thoughtful coach would notice. If a period summary is present, cover that window instead of only today. If workoutVolume has onTrack false, include that.',
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
    maxTokens: 700,
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
